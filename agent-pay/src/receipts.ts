import { BASE_COLLECTOR, SOLANA_COLLECTOR, BASE_USDC, SOLANA_USDC } from "./offer";

export { BASE_USDC, SOLANA_USDC } from "./offer";
export const SOLANA_COLLECTOR_ATA = "Hp6uUt3RmYYVmeSYyf6LpimgddHbL9QJ1LG9TbK5pJiQ";
const SOLANA_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export class PendingReceipt extends Error {}

async function rpc(url: string, method: string, params: unknown[]): Promise<any> {
  const response = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("RPC unavailable");
  const data: any = await response.json();
  if (data.error || !("result" in data)) throw new Error("RPC unavailable");
  return data.result;
}

export async function verifyBaseReceipt(url: string, tx: string, payer: string, earliest: number, amountAtomic: bigint): Promise<number> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) throw new Error("Invalid Base transaction hash");
  if (BigInt(await rpc(url, "eth_chainId", [])) !== 8453n) throw new Error("Base RPC network mismatch");
  const receipt = await rpc(url, "eth_getTransactionReceipt", [tx]);
  if (!receipt) throw new PendingReceipt("Transaction is not confirmed yet");
  if (receipt.status !== "0x1" || !receipt.blockNumber) throw new Error("Transaction failed");
  const [transaction, latest, block] = await Promise.all([
    rpc(url, "eth_getTransactionByHash", [tx]), rpc(url, "eth_blockNumber", []),
    rpc(url, "eth_getBlockByNumber", [receipt.blockNumber, false]),
  ]);
  if (!transaction || !block || BigInt(latest) - BigInt(receipt.blockNumber) < 2n) {
    throw new PendingReceipt("Waiting for two Base confirmations");
  }
  if (String(transaction.from).toLowerCase() !== payer ||
      String(transaction.to).toLowerCase() !== BASE_USDC.toLowerCase() ||
      Number(BigInt(block.timestamp)) < earliest - 30) throw new Error("Payment does not belong to this session");
  const paid = (receipt.logs ?? []).some((log: any) =>
    String(log.address).toLowerCase() === BASE_USDC.toLowerCase() &&
    String(log.topics?.[0]).toLowerCase() === TRANSFER_TOPIC &&
    String(log.topics?.[1]).toLowerCase() === `0x${payer.slice(2).padStart(64, "0")}` &&
    String(log.topics?.[2]).toLowerCase() === `0x${BASE_COLLECTOR.slice(2).toLowerCase().padStart(64, "0")}` &&
    BigInt(log.data) === amountAtomic);
  if (!paid) throw new Error("No matching Base USDC transfer to the collector");
  return Number(BigInt(block.timestamp));
}

export async function verifySolanaReceipt(url: string, tx: string, payer: string, earliest: number, amountAtomic: bigint): Promise<number> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(tx)) throw new Error("Invalid Solana signature");
  if (await rpc(url, "getGenesisHash", []) !== SOLANA_GENESIS) throw new Error("Solana RPC network mismatch");
  const result = await rpc(url, "getTransaction", [tx, {
    encoding: "jsonParsed", commitment: "finalized", maxSupportedTransactionVersion: 0,
  }]);
  if (!result) throw new PendingReceipt("Transaction is not finalized yet");
  if (result.meta?.err !== null || !Number.isSafeInteger(result.blockTime) ||
      result.blockTime < earliest - 30 || !result.transaction?.signatures?.includes(tx)) {
    throw new Error("Solana payment failed or predates this session");
  }
  const keys = result.transaction.message?.accountKeys ?? [];
  if (!keys.some((key: any) => key.pubkey === payer && key.signer === true)) {
    throw new Error("Paying wallet did not sign the transaction");
  }
  const balances = (kind: "preTokenBalances" | "postTokenBalances", account: string) => {
    const rows = result.meta[kind] ?? [];
    const row = rows.find((b: any) => keys[b.accountIndex]?.pubkey === account && b.mint === SOLANA_USDC);
    return row ? BigInt(row.uiTokenAmount.amount) : 0n;
  };
  const destination = SOLANA_COLLECTOR_ATA;
  const destBalance = (result.meta.postTokenBalances ?? []).find((b: any) =>
    keys[b.accountIndex]?.pubkey === destination && b.mint === SOLANA_USDC && b.owner === SOLANA_COLLECTOR);
  const source = (result.meta.preTokenBalances ?? []).find((b: any) =>
    b.owner === payer && b.mint === SOLANA_USDC && keys[b.accountIndex]?.pubkey !== destination &&
    balances("preTokenBalances", keys[b.accountIndex]?.pubkey) - balances("postTokenBalances", keys[b.accountIndex]?.pubkey) >= amountAtomic);
  if (!source || !destBalance ||
      balances("postTokenBalances", destination) - balances("preTokenBalances", destination) !== amountAtomic) {
    throw new Error("No matching Solana USDC balance transfer to the collector");
  }
  const sourceAddress = keys[source.accountIndex].pubkey;
  const instructions = [
    ...(result.transaction.message.instructions ?? []),
    ...(result.meta.innerInstructions ?? []).flatMap((item: any) => item.instructions ?? []),
  ];
  if (!instructions.some((instruction: any) => instruction.program === "spl-token" &&
      instruction.parsed?.type === "transferChecked" &&
      instruction.parsed.info?.source === sourceAddress &&
      instruction.parsed.info?.destination === destination &&
      instruction.parsed.info?.authority === payer &&
      instruction.parsed.info?.mint === SOLANA_USDC &&
      instruction.parsed.info?.tokenAmount?.amount === amountAtomic.toString())) {
    throw new Error("No matching signed Solana USDC transfer instruction");
  }
  return result.blockTime;
}
