import { checkBaseRpc, validAddress, walletSnapshot } from "./rpc";
import { checkSolanaRpc, solanaWalletSnapshot, validSolanaAddress } from "./solana";
import { BASE_USDC, SOLANA_USDC } from "./receipts";

async function jsonRpc(url: string, method: string, params: unknown[]): Promise<any> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("RPC unavailable");
  const payload: any = await response.json();
  if (payload.error || !("result" in payload)) throw new Error("Invalid RPC response");
  return payload.result;
}

export type ReadQuery = { chain: "base" | "solana"; kind: "wallet" | "usdc"; address: string };
export function validQuery(q: any): q is ReadQuery {
  return q && (q.chain === "base" || q.chain === "solana") && (q.kind === "wallet" || q.kind === "usdc") &&
    (q.chain === "base" ? validAddress(q.address) : validSolanaAddress(q.address));
}

export async function readQuery(baseUrl: string, solanaUrl: string, q: ReadQuery) {
  if (q.kind === "wallet") return q.chain === "base" ?
    walletSnapshot(baseUrl, q.address) : solanaWalletSnapshot(solanaUrl, q.address);
  if (q.chain === "base") {
    await checkBaseRpc(baseUrl);
    const result = await jsonRpc(baseUrl, "eth_call", [{ to: BASE_USDC,
      data: `0x70a08231${q.address.slice(2).toLowerCase().padStart(64, "0")}` }, "latest"]);
    if (typeof result !== "string" || !/^0x[0-9a-fA-F]+$/.test(result)) throw new Error("Invalid token balance");
    const atomic = BigInt(result);
    return { chain: "base", address: q.address, token: BASE_USDC, symbol: "USDC", decimals: 6,
      balanceAtomic: atomic.toString(), balanceUSDC: `${atomic / 1_000_000n}.${(atomic % 1_000_000n).toString().padStart(6, "0")}` };
  }
  await checkSolanaRpc(solanaUrl);
  const result = await jsonRpc(solanaUrl, "getTokenAccountsByOwner", [q.address, { mint: SOLANA_USDC },
    { encoding: "jsonParsed", commitment: "confirmed" }]);
  if (!Array.isArray(result?.value)) throw new Error("Invalid token accounts");
  const amount = result.value.reduce((sum: bigint, row: any) => {
    const info = row.account?.data?.parsed?.info;
    if (info?.mint !== SOLANA_USDC || info?.owner !== q.address || !/^\d+$/.test(info?.tokenAmount?.amount ?? "")) {
      throw new Error("Invalid token account");
    }
    return sum + BigInt(info.tokenAmount.amount);
  }, 0n);
  return { chain: "solana", address: q.address, token: SOLANA_USDC, symbol: "USDC", decimals: 6,
    balanceAtomic: amount.toString(), balanceUSDC: `${amount / 1_000_000n}.${(amount % 1_000_000n).toString().padStart(6, "0")}`,
    slot: result.context?.slot ?? null };
}

export async function transactionStatus(chain: "base" | "solana", url: string, tx: string) {
  if (chain === "base") {
    if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) throw new Error("Invalid Base transaction hash");
    await checkBaseRpc(url);
    const receipt = await jsonRpc(url, "eth_getTransactionReceipt", [tx]);
    return receipt ? { chain, tx, found: true, success: receipt.status === "0x1",
      blockNumber: Number(BigInt(receipt.blockNumber)), gasUsed: BigInt(receipt.gasUsed).toString(),
      explorer: `https://basescan.org/tx/${tx}` } : { chain, tx, found: false };
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(tx)) throw new Error("Invalid Solana transaction signature");
  await checkSolanaRpc(url);
  const result = await jsonRpc(url, "getSignatureStatuses", [[tx], { searchTransactionHistory: true }]);
  const status = result?.value?.[0];
  return status ? { chain, tx, found: true, success: status.err === null, slot: status.slot,
    confirmationStatus: status.confirmationStatus, explorer: `https://solscan.io/tx/${tx}` } : { chain, tx, found: false };
}
