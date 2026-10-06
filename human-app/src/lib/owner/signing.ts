import { base58, base64 } from "@scure/base";
import { Interface, parseUnits } from "ethers";
import { BASE_COLLECTOR, BASE_USDC, SOLANA_COLLECTOR } from "@/lib/machine/config";
import { treasurySolanaMessage } from "./solana-message";
import type { TreasuryChain, WithdrawalQuote } from "./types";

export type EvmProvider = {
  request(input: { method: string; params?: unknown[] }): Promise<unknown>;
};
export type SolanaProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect(): Promise<{ publicKey: { toString(): string } }>;
  request(input: { method: string; params: Record<string, unknown> }): Promise<unknown>;
};
export function deviceProviders() {
  const browser = window as unknown as {
    ethereum?: EvmProvider;
    phantom?: { solana?: SolanaProvider };
    solana?: SolanaProvider;
  };
  return {
    evm: browser.ethereum,
    solana: browser.phantom?.solana ?? (browser.solana?.isPhantom ? browser.solana : undefined),
  };
}
export async function connectCollector(chain: TreasuryChain, providers = deviceProviders()) {
  if (chain === "base") {
    if (!providers.evm)
      throw new Error(
        "Open this page in your Base wallet's browser, or enable an Ethereum wallet extension.",
      );
    const accounts = await providers.evm.request({ method: "eth_requestAccounts" });
    if (
      !Array.isArray(accounts) ||
      typeof accounts[0] !== "string" ||
      accounts[0].toLowerCase() !== BASE_COLLECTOR.toLowerCase()
    )
      throw new Error("Select the configured Base collector account in your wallet.");
    await providers.evm.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x2105" }],
    });
    if (BigInt(String(await providers.evm.request({ method: "eth_chainId" }))) !== 8453n)
      throw new Error("Switch your wallet to Base mainnet.");
    return accounts[0] as string;
  }
  if (!providers.solana)
    throw new Error("Open this page in Phantom's browser, or enable the Phantom Solana extension.");
  const account = await providers.solana.connect();
  if (account.publicKey.toString() !== SOLANA_COLLECTOR)
    throw new Error("Select the configured Solana collector account in Phantom.");
  return account.publicKey.toString();
}

export async function verifyWithdrawalQuote(quote: WithdrawalQuote) {
  if (!["base", "solana"].includes(quote.chain) || !["usdc", "native"].includes(quote.asset))
    throw new Error("Unsupported withdrawal.");
  const decimals = quote.asset === "usdc" ? 6 : quote.chain === "base" ? 18 : 9;
  if (
    quote.decimals !== decimals ||
    parseUnits(quote.amount, decimals).toString() !== quote.amountAtomic
  )
    throw new Error("Amount does not match your review.");
  if (!Number.isFinite(Date.parse(quote.expiresAt)) || Date.parse(quote.expiresAt) <= Date.now())
    throw new Error("This review expired. Review the withdrawal again.");
  if (!/^\d+$/.test(quote.amountAtomic) || BigInt(quote.amountAtomic) <= 0n)
    throw new Error("Invalid withdrawal amount.");
  if (quote.chain === "base") {
    const tx = quote.unsignedTransaction;
    if (
      !tx ||
      quote.from.toLowerCase() !== BASE_COLLECTOR.toLowerCase() ||
      tx["from"]?.toLowerCase() !== BASE_COLLECTOR.toLowerCase() ||
      tx["chainId"] !== "0x2105"
    )
      throw new Error("Withdrawal does not match the Base collector.");
    const allowed = new Set([
      "from",
      "to",
      "value",
      "data",
      "chainId",
      "nonce",
      "gas",
      "maxPriorityFeePerGas",
      "maxFeePerGas",
      "type",
    ]);
    if (Object.keys(tx).some((key) => !allowed.has(key)))
      throw new Error("Unexpected transaction field.");
    if (quote.asset === "usdc") {
      const expected = new Interface([
        "function transfer(address to,uint256 amount)",
      ]).encodeFunctionData("transfer", [quote.to, quote.amountAtomic]);
      if (
        tx["to"]?.toLowerCase() !== BASE_USDC.toLowerCase() ||
        tx["value"] !== "0x0" ||
        tx["data"]?.toLowerCase() !== expected.toLowerCase()
      )
        throw new Error("Token transfer does not match your review.");
    } else if (
      tx["to"]?.toLowerCase() !== quote.to.toLowerCase() ||
      BigInt(tx["value"] ?? "-1") !== BigInt(quote.amountAtomic) ||
      (tx["data"] && tx["data"] !== "0x")
    )
      throw new Error("Transfer does not match your review.");
    if (
      BigInt(tx["gas"] ?? "0") * BigInt(tx["maxFeePerGas"] ?? "0") !==
      BigInt(quote.networkFeeAtomic)
    )
      throw new Error("Network fee does not match your review.");
  } else {
    if (quote.from !== SOLANA_COLLECTOR || !quote.messageBase64 || !quote.recentBlockhash)
      throw new Error("Withdrawal does not match the Solana collector.");
    const expected = await treasurySolanaMessage({
      asset: quote.asset,
      to: quote.to,
      amountAtomic: quote.amountAtomic,
      recentBlockhash: quote.recentBlockhash,
    });
    if (base64.encode(expected) !== quote.messageBase64)
      throw new Error("Solana transaction does not match your review.");
  }
}

export async function signReviewedWithdrawal(
  quote: WithdrawalQuote,
  providers = deviceProviders(),
) {
  await verifyWithdrawalQuote(quote);
  if (quote.chain === "base") {
    if (!providers.evm) throw new Error("Reconnect your Base wallet.");
    const accounts = await providers.evm.request({ method: "eth_accounts" });
    const chainId = await providers.evm.request({ method: "eth_chainId" });
    if (
      !Array.isArray(accounts) ||
      String(accounts[0]).toLowerCase() !== BASE_COLLECTOR.toLowerCase() ||
      BigInt(String(chainId)) !== 8453n
    )
      throw new Error("Wallet account or network changed. Reconnect the collector.");
    await verifyWithdrawalQuote(quote);
    // The private key stays inside the wallet; its own confirmation approves broadcast.
    const tx = await providers.evm.request({
      method: "eth_sendTransaction",
      params: [quote.unsignedTransaction],
    });
    if (typeof tx !== "string" || !/^0x[a-f0-9]{64}$/i.test(tx))
      throw new Error(
        "No valid transaction hash returned. Check your wallet activity before retrying.",
      );
    return tx;
  }
  if (!providers.solana || providers.solana.publicKey?.toString() !== SOLANA_COLLECTOR)
    throw new Error("Wallet account changed. Reconnect the Solana collector.");
  const result = await providers.solana.request({
    method: "signAndSendTransaction",
    params: {
      message: base58.encode(base64.decode(quote.messageBase64!)),
      options: { skipPreflight: false, preflightCommitment: "confirmed" },
    },
  });
  const signature = (result as { signature?: unknown })?.signature;
  if (typeof signature !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature))
    throw new Error("No valid signature returned. Check your wallet activity before retrying.");
  return signature;
}
