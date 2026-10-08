import { BASE_USDC, SOLANA_USDC, SOLANA_COLLECTOR, BITCOIN_COLLECTOR, paymentCollector, paymentRail, planById, type PlanId } from "./config";
import type { MachineChain } from "./chains";

export { BASE_USDC, SOLANA_USDC } from "./config";
export { SOLANA_COLLECTOR_ATA } from "./config";
const SOLANA_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export class PendingReceipt extends Error {}

async function rpc(url: string, method: string, params: unknown[]): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("RPC unavailable");
  const data: any = await response.json();
  if (data.error || !("result" in data)) throw new Error("RPC unavailable");
  return data.result;
}

export async function verifyEvmReceipt(
  url: string,
  chain: MachineChain,
  tx: string,
  payer: string,
  earliest: number,
  amountAtomic: bigint,
): Promise<number> {
  if (
    !/^0x[0-9a-fA-F]{64}$/.test(tx) ||
    chain.family !== "evm" ||
    !chain.chainId ||
    !chain.stablecoin
  )
    throw new Error("Invalid EVM payment");
  if (BigInt(await rpc(url, "eth_chainId", [])) !== BigInt(chain.chainId))
    throw new Error(`${chain.name} RPC network mismatch`);
  const receipt = await rpc(url, "eth_getTransactionReceipt", [tx]);
  if (!receipt) {
    if (!(await rpc(url, "eth_getTransactionByHash", [tx])))
      throw new Error(`Transaction not found on ${chain.name}`);
    throw new PendingReceipt("Transaction is not confirmed yet");
  }
  if (receipt.status !== "0x1" || !receipt.blockNumber) throw new Error("Transaction failed");
  const [transaction, latest, block] = await Promise.all([
    rpc(url, "eth_getTransactionByHash", [tx]),
    rpc(url, "eth_blockNumber", []),
    rpc(url, "eth_getBlockByNumber", [receipt.blockNumber, false]),
  ]);
  const confirmations = chain.id === "ethereum" ? 3n : 2n;
  if (!transaction || !block || BigInt(latest) - BigInt(receipt.blockNumber) + 1n < confirmations)
    throw new PendingReceipt(`Waiting for ${confirmations} ${chain.name} confirmations`);
  if (
    String(transaction.from).toLowerCase() !== payer.toLowerCase() ||
    String(transaction.to).toLowerCase() !== chain.stablecoin.address.toLowerCase() ||
    Number(BigInt(block.timestamp)) < earliest - 30
  )
    throw new Error("Payment does not belong to this session");
  const treasury = paymentCollector(chain.id);
  const paid = (receipt.logs ?? []).some(
    (log: any) =>
      String(log.address).toLowerCase() === chain.stablecoin!.address.toLowerCase() &&
      String(log.topics?.[0]).toLowerCase() === TRANSFER_TOPIC &&
      String(log.topics?.[1]).toLowerCase() === `0x${payer.slice(2).padStart(64, "0")}` &&
      String(log.topics?.[2]).toLowerCase() ===
        `0x${treasury.slice(2).toLowerCase().padStart(64, "0")}` &&
      BigInt(log.data) === amountAtomic,
  );
  if (!paid)
    throw new Error(`No matching ${chain.stablecoin.symbol} transfer to the developer treasury`);
  return Number(BigInt(block.timestamp));
}

export async function verifyBaseReceipt(
  url: string,
  tx: string,
  payer: string,
  earliest: number,
  amountAtomic: bigint,
) {
  const chain = {
    id: "base",
    name: "Base",
    family: "evm" as const,
    symbol: "ETH",
    decimals: 18,
    chainId: 8453,
    env: "BASE_RPC_URL",
    fallback: url,
    explorer: "https://basescan.org",
    stablecoin: { symbol: "USDC", address: BASE_USDC, decimals: 6 },
  };
  return verifyEvmReceipt(url, chain, tx, payer, earliest, amountAtomic);
}

export async function verifySolanaReceipt(
  url: string,
  tx: string,
  payer: string,
  earliest: number,
  amountAtomic: bigint,
): Promise<number> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(tx)) throw new Error("Invalid Solana signature");
  if ((await rpc(url, "getGenesisHash", [])) !== SOLANA_GENESIS)
    throw new Error("Solana RPC network mismatch");
  const result = await rpc(url, "getTransaction", [
    tx,
    {
      encoding: "jsonParsed",
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    },
  ]);
  if (!result) {
    const status = await rpc(url, "getSignatureStatuses", [
      [tx],
      { searchTransactionHistory: true },
    ]);
    if (!status?.value?.[0]) throw new Error("Transaction not found on Solana");
    throw new PendingReceipt("Transaction is not finalized yet");
  }
  if (
    result.meta?.err !== null ||
    !Number.isSafeInteger(result.blockTime) ||
    result.blockTime < earliest - 30 ||
    !result.transaction?.signatures?.includes(tx)
  ) {
    throw new Error("Solana payment failed or predates this session");
  }
  const keys = result.transaction.message?.accountKeys ?? [];
  if (!keys.some((key: any) => key.pubkey === payer && key.signer === true)) {
    throw new Error("Paying wallet did not sign the transaction");
  }
  const balances = (kind: "preTokenBalances" | "postTokenBalances", account: string) => {
    const rows = result.meta[kind] ?? [];
    const row = rows.find(
      (b: any) => keys[b.accountIndex]?.pubkey === account && b.mint === SOLANA_USDC,
    );
    return row ? BigInt(row.uiTokenAmount.amount) : 0n;
  };
  const destination = "Hp6uUt3RmYYVmeSYyf6LpimgddHbL9QJ1LG9TbK5pJiQ";
  const destBalance = (result.meta.postTokenBalances ?? []).find(
    (b: any) =>
      keys[b.accountIndex]?.pubkey === destination &&
      b.mint === SOLANA_USDC &&
      b.owner === SOLANA_COLLECTOR,
  );
  const source = (result.meta.preTokenBalances ?? []).find(
    (b: any) =>
      b.owner === payer &&
      b.mint === SOLANA_USDC &&
      keys[b.accountIndex]?.pubkey !== destination &&
      balances("preTokenBalances", keys[b.accountIndex]?.pubkey) -
        balances("postTokenBalances", keys[b.accountIndex]?.pubkey) >=
        amountAtomic,
  );
  if (
    !source ||
    !destBalance ||
    balances("postTokenBalances", destination) - balances("preTokenBalances", destination) !==
      amountAtomic
  ) {
    throw new Error("No matching Solana USDC balance transfer to the collector");
  }
  const sourceAddress = keys[source.accountIndex].pubkey;
  const instructions = [
    ...(result.transaction.message.instructions ?? []),
    ...(result.meta.innerInstructions ?? []).flatMap((item: any) => item.instructions ?? []),
  ];
  if (
    !instructions.some(
      (instruction: any) =>
        instruction.program === "spl-token" &&
        instruction.parsed?.type === "transferChecked" &&
        instruction.parsed.info?.source === sourceAddress &&
        instruction.parsed.info?.destination === destination &&
        instruction.parsed.info?.authority === payer &&
        instruction.parsed.info?.mint === SOLANA_USDC &&
        instruction.parsed.info?.tokenAmount?.amount === amountAtomic.toString(),
    )
  ) {
    throw new Error("No matching signed Solana USDC transfer instruction");
  }
  return result.blockTime;
}

const TRON_USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
export async function verifyTronReceipt(
  url: string,
  tx: string,
  payer: string,
  earliest: number,
  amountAtomic: bigint,
): Promise<number> {
  if (!/^[0-9a-fA-F]{64}$/.test(tx)) throw new Error("Invalid Tron transaction id");
  const treasury = paymentCollector("tron");
  const base = url.replace(/\/$/, "");
  const endpoint = `${base}/v1/accounts/${treasury}/transactions/trc20?only_confirmed=true&only_to=true&contract_address=${TRON_USDT}&limit=200&min_timestamp=${Math.max(0, (earliest - 30) * 1000)}&order_by=block_timestamp,desc`;
  const response = await fetch(endpoint, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("TronGrid unavailable");
  const body: any = await response.json();
  const match = (body.data ?? []).find(
    (row: any) =>
      String(row.transaction_id).toLowerCase() === tx.toLowerCase() &&
      row.from === payer &&
      row.to === treasury &&
      row.type === "Transfer" &&
      row.token_info?.address === TRON_USDT &&
      BigInt(row.value) === amountAtomic &&
      Number(row.block_timestamp) >= (earliest - 30) * 1000 &&
      row.confirmed !== false,
  );
  if (match) return Math.floor(Number(match.block_timestamp) / 1000);
  throw new Error("No matching Tron USDT transfer to the developer treasury");
}


function decimalToScaled(value: string, scale: number): bigint {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error("Invalid price");
  const parts = value.split(".");
  const whole = parts[0];
  const fraction = parts[1] ?? "";
  if (!whole) throw new Error("Invalid price");
  if (fraction.length > scale) return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.slice(0, scale));
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0"));
}

export async function btcUsdSpot(): Promise<string> {
  const response = await fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot", {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Bitcoin price service unavailable");
  const body: any = await response.json();
  const price = body?.data?.amount;
  if (typeof price !== "string" || !/^\d+(?:\.\d+)?$/.test(price)) throw new Error("Bitcoin price service returned an invalid price");
  return price;
}

export async function paymentAmountAtomic(chain: string, planId: PlanId): Promise<bigint> {
  const plan = planById(planId);
  const rail = paymentRail(chain);
  if (!plan) throw new RangeError("Unknown plan");
  if (chain !== "bitcoin") {
    const base = plan.amountAtomic;
    if (rail.decimals === 6) return base;
    if (rail.decimals === 18) return base * 1_000_000_000_000n;
    throw new RangeError("Unsupported payment decimals");
  }
  const priceScaled = decimalToScaled(await btcUsdSpot(), 8);
  // plan.amountAtomic is USD/USDC at 6 decimals. Round BTC upward so a
  // price move against the merchant cannot turn a quoted plan into an underpayment.
  return (plan.amountAtomic * 10_000_000_000n + priceScaled - 1n) / priceScaled;
}

export async function verifyBitcoinReceipt(
  tx: string,
  payer: string,
  earliest: number,
  amountAtomic: bigint,
): Promise<number> {
  if (!/^[0-9a-fA-F]{64}$/.test(tx)) throw new Error("Invalid Bitcoin transaction id");
  if (!/^(bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(payer)) throw new Error("Valid Bitcoin wallet required");
  const response = await fetch(`https://mempool.space/api/tx/${tx}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (response.status === 404) throw new Error("Bitcoin transaction not found");
  if (!response.ok) throw new Error("Bitcoin transaction service unavailable");
  const body: any = await response.json();
  const status = body?.status;
  if (!status?.confirmed) {
    if (status) throw new PendingReceipt("Bitcoin transaction is not confirmed yet");
    throw new Error("Invalid Bitcoin transaction response");
  }
  const blockTime = Number(status.block_time);
  if (!Number.isSafeInteger(blockTime) || blockTime < earliest - 30)
    throw new Error("Bitcoin payment predates this checkout");
  const signedByPayer = (body?.vin ?? []).some(
    (input: any) => input?.prevout?.scriptpubkey_address === payer,
  );
  if (!signedByPayer) throw new Error("Bitcoin transaction does not spend from the checkout wallet");
  const paid = (body?.vout ?? []).some((output: any) =>
    output?.scriptpubkey_address === BITCOIN_COLLECTOR && BigInt(output?.value ?? 0) >= amountAtomic
  );
  if (!paid) throw new Error("No matching Bitcoin payment to the developer treasury");
  return blockTime;
}
