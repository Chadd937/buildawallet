#!/usr/bin/env node
// One paid request per invocation. No automatic payment retries.
import { readFileSync, statSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { x402Client, x402HTTPClient } from "@x402/core/client";

const BASE = {
  name: "base",
  network: "eip155:8453",
  path: "/machine/wallet?address=0xBcCA6AED433d9020C50D44560F9679F1B5eB511d",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  collector: "0xBcCA6AED433d9020C50D44560F9679F1B5eB511d",
  explorer: "https://basescan.org/tx/",
};
const SOLANA = {
  name: "solana",
  network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  path: "/machine/solana-wallet?address=Ew8mbrKwD6LGaSX28a6XGmXqeQSs2hykRibjXVhftTRC",
  asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  collector: "Ew8mbrKwD6LGaSX28a6XGmXqeQSs2hykRibjXVhftTRC",
  explorer: "https://solscan.io/tx/",
};
const AMOUNT = "10000"; // USDC has six decimals: $0.01.
const ORIGIN = "https://buildawallet.xyz";
let paidRequestSent = false;

function fail(message) {
  throw new Error(message);
}

function sameAddress(chain, a, b) {
  return chain.name === "base" ? a?.toLowerCase() === b.toLowerCase() : a === b;
}

function requireRpcUrl(value, variable) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.toString();
  } catch { /* Report a generic error so the entered value is not echoed. */ }
  fail(`${variable} must be a full https:// mainnet URL. Enter only the URL at the hidden prompt, one command at a time.`);
}

async function rpc(url, method, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) fail(`Receipt RPC ${method} returned HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) fail(`Receipt RPC ${method} failed: ${data.error.message ?? "unknown error"}`);
  return data.result;
}

async function verifyBase(transaction, payer, chain) {
  const { createPublicClient, http, decodeEventLog, parseAbiItem } = await import("viem");
  const { base } = await import("viem/chains");
  if (!/^0x[\da-fA-F]{64}$/.test(transaction)) fail("Settlement returned no Base transaction hash");
  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.BAW_BASE_RPC_URL || "https://mainnet.base.org"),
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: transaction, timeout: 90000 });
  if (receipt.status !== "success") fail("Base transaction reverted");
  const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
  const matched = receipt.logs.some((log) => {
    if (!sameAddress(chain, log.address, chain.asset)) return false;
    try {
      const { args } = decodeEventLog({ abi: [transfer], data: log.data, topics: log.topics });
      return sameAddress(chain, args.from, payer) &&
        sameAddress(chain, args.to, chain.collector) && args.value === BigInt(AMOUNT);
    } catch {
      return false;
    }
  });
  if (!matched) fail("Base receipt lacks the expected 10,000-unit USDC transfer to the collector");
  return { blockNumber: String(receipt.blockNumber), confirmedTransfer: true };
}

async function verifySolana(transaction, payer, chain) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(transaction)) fail("Settlement returned no Solana transaction signature");
  const url = process.env.BAW_SOLANA_RPC_URL;
  for (let attempt = 0; attempt < 24; attempt++) {
    const result = await rpc(url, "getTransaction", [transaction, {
      encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0,
    }]);
    if (result) {
      if (result.meta?.err !== null) fail("Solana transaction failed onchain");
      const signedByPayer = result.transaction?.message?.accountKeys?.some(
        (entry) => entry.pubkey === payer && entry.signer === true,
      );
      if (!signedByPayer) fail("Solana receipt does not show the test wallet as a signer");
      const amountFor = (balances, owner) => balances
        .filter((entry) => entry.mint === chain.asset && entry.owner === owner)
        .reduce((total, entry) => total + BigInt(entry.uiTokenAmount.amount), 0n);
      const before = amountFor(result.meta.preTokenBalances ?? [], chain.collector);
      const after = amountFor(result.meta.postTokenBalances ?? [], chain.collector);
      if (after - before !== BigInt(AMOUNT)) {
        fail("Solana receipt lacks the expected 10,000-unit USDC increase for the collector");
      }
      return { slot: result.slot, confirmedTransfer: true };
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  fail("Solana transaction was not visible at confirmed commitment within 60 seconds");
}

async function main() {
  const [name, mode = "--prepare"] = process.argv.slice(2);
  if ((name !== "base" && name !== "solana") || !["--prepare", "--check-funds", "--execute"].includes(mode)) {
    fail("Usage: node scripts/paid-smoke.mjs <base|solana> [--prepare|--check-funds|--execute]");
  }
  const chain = name === "base" ? BASE : SOLANA;
  const url = ORIGIN + chain.path;
  const unpaid = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (unpaid.status !== 402) fail(`Expected 402 before payment; received HTTP ${unpaid.status}`);
  const initialClient = new x402HTTPClient(new x402Client());
  const required = initialClient.getPaymentRequiredResponse(
    (header) => unpaid.headers.get(header), await unpaid.json(),
  );
  if (required.x402Version !== 2 || required.resource?.url !== url) {
    fail("The x402 version or resource URL differs from the expected endpoint");
  }
  const matches = required.accepts.filter((option) =>
    option.scheme === "exact" && option.network === chain.network &&
    option.amount === AMOUNT && sameAddress(chain, option.asset, chain.asset) &&
    sameAddress(chain, option.payTo, chain.collector),
  );
  if (matches.length !== 1) fail("Expected one exact $0.01 USDC option for the selected chain and collector");
  const selected = matches[0];
  console.log(JSON.stringify({ mode, endpoint: url, network: selected.network,
    amountUSDC: "0.01", token: selected.asset, collector: selected.payTo }, null, 2));
  if (mode === "--prepare") return;
  if (mode === "--execute" && !stdin.isTTY) fail("Execute mode requires an interactive terminal");

  let payer;
  const client = new x402Client();
  if (name === "base") {
    const { privateKeyToAccount } = await import("viem/accounts");
    const { ExactEvmScheme } = await import("@x402/evm/exact/client");
    const key = process.env.BAW_TEST_EVM_PRIVATE_KEY;
    if (!/^0x[\da-fA-F]{64}$/.test(key ?? "")) fail("Set BAW_TEST_EVM_PRIVATE_KEY to a dedicated test payer key");
    const signer = privateKeyToAccount(key);
    payer = signer.address;
    client.register(chain.network, new ExactEvmScheme(signer));
  } else {
    const { createKeyPairSignerFromBytes } = await import("@solana/kit");
    const { ExactSvmScheme } = await import("@x402/svm/exact/client");
    const file = process.env.BAW_TEST_SOLANA_KEYPAIR_FILE;
    if (!file || !process.env.BAW_SOLANA_RPC_URL) {
      fail("Set BAW_TEST_SOLANA_KEYPAIR_FILE and BAW_SOLANA_RPC_URL for the test payer");
    }
    const solanaRpcUrl = requireRpcUrl(process.env.BAW_SOLANA_RPC_URL, "BAW_SOLANA_RPC_URL");
    const genesis = await rpc(solanaRpcUrl, "getGenesisHash", []);
    if (genesis !== "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d") {
      fail("The local Solana RPC is not connected to mainnet");
    }
    if (statSync(file).mode & 0o077) fail("Solana keypair file must have 0600 permissions");
    const bytes = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(bytes) || bytes.length !== 64 || bytes.some((b) => !Number.isInteger(b) || b < 0 || b > 255)) {
      fail("Solana keypair file must contain a 64-byte JSON array");
    }
    const signer = await createKeyPairSignerFromBytes(new Uint8Array(bytes));
    payer = String(signer.address);
    client.register(chain.network, new ExactSvmScheme(signer, { rpcUrl: solanaRpcUrl }));
  }
  if (sameAddress(chain, payer, chain.collector)) fail("Use a separate payer, not the collector wallet");
  let balanceAtomic;
  if (name === "base") {
    const { createPublicClient, http, parseAbi } = await import("viem");
    const { base } = await import("viem/chains");
    const rpcUrl = requireRpcUrl(process.env.BAW_BASE_RPC_URL || "https://mainnet.base.org", "BAW_BASE_RPC_URL");
    const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
    if (await publicClient.getChainId() !== 8453) fail("The local Base RPC is not connected to mainnet");
    balanceAtomic = await publicClient.readContract({
      address: chain.asset,
      abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
      functionName: "balanceOf",
      args: [payer],
    });
  } else {
    const result = await rpc(process.env.BAW_SOLANA_RPC_URL, "getTokenAccountsByOwner", [
      payer, { mint: chain.asset }, { encoding: "jsonParsed" },
    ]);
    if (!Array.isArray(result?.value)) fail("Solana RPC returned invalid token accounts");
    balanceAtomic = result.value.reduce((total, entry) =>
      total + BigInt(entry.account.data.parsed.info.tokenAmount.amount), 0n);
  }
  console.log(`Payer: ${payer}`);
  console.log(`Payer USDC: ${Number(balanceAtomic) / 1e6}`);
  if (balanceAtomic < BigInt(AMOUNT)) fail("Test payer needs at least 0.01 USDC on the selected mainnet before signing");
  if (mode === "--check-funds") return;
  console.log(`One attempt: pay $0.01 USDC on ${name} to ${chain.collector}.`);
  const prompt = createInterface({ input: stdin, output: stdout });
  const answer = await prompt.question(`Type PAY ${name.toUpperCase()} to sign and submit once: `);
  prompt.close();
  if (answer !== `PAY ${name.toUpperCase()}`) fail("Canceled before signing");

  const httpClient = new x402HTTPClient(client);
  const payload = await httpClient.createPaymentPayload({ ...required, accepts: [selected] });
  if (payload.accepted.network !== chain.network || payload.accepted.amount !== AMOUNT ||
    !sameAddress(chain, payload.accepted.payTo, chain.collector)) fail("Signed payload does not match the reviewed charge");
  const headers = httpClient.encodePaymentSignatureHeader(payload);
  // Do not retry if the request times out: it might have settled despite a lost HTTP response.
  paidRequestSent = true;
  const paid = await fetch(url, { headers, signal: AbortSignal.timeout(90000) });
  const body = await paid.json();
  const outcome = httpClient.parsePaymentResult({
    status: paid.status, getHeader: (header) => paid.headers.get(header), body,
  });
  if (outcome.paymentStatus !== "settled" || paid.status !== 200) {
    fail(`Paid request returned HTTP ${paid.status} (${outcome.paymentStatus}): ${JSON.stringify(outcome.header ?? body)}`);
  }
  const settlement = outcome.header;
  if (!settlement?.success || settlement.network !== chain.network || !settlement.transaction) {
    fail("The paid response lacks a successful settlement header and transaction ID");
  }
  if (settlement.payer && !sameAddress(chain, settlement.payer, payer)) fail("Settlement payer differs from test wallet");
  if (body.chain !== name || !sameAddress(chain, body.address, chain.collector)) {
    fail("Paid response is not the requested wallet snapshot");
  }
  console.log(`Settlement transaction: ${settlement.transaction}`);
  console.log(`Explorer: ${chain.explorer}${settlement.transaction}`);
  const proof = name === "base" ?
    await verifyBase(settlement.transaction, payer, chain) :
    await verifySolana(settlement.transaction, payer, chain);
  console.log(JSON.stringify({ status: "settled_and_verified", chain: name, payer,
    collector: chain.collector, amountUSDC: "0.01", transaction: settlement.transaction,
    explorer: chain.explorer + settlement.transaction, receipt: proof, snapshot: body }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  if (paidRequestSent) console.error("Do not rerun until you check the payer and collector transactions.");
  process.exitCode = 1;
});
