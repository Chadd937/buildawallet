import { MACHINE_CHAINS, machineChain, rpcUrl, validAddress, type MachineChain, type MachineChainId } from "./chains";

const timeout = (ms = 12_000) => AbortSignal.timeout(ms);
const atomicText = (value: bigint, decimals: number) => {
  const base = 10n ** BigInt(decimals), whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
};
async function rpc(url: string, method: string, params: unknown[]) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: timeout() });
  if (!response.ok) throw new Error("Upstream RPC unavailable");
  const body = await response.json() as { result?: unknown; error?: unknown };
  if (body.error || !("result" in body)) throw new Error("Invalid upstream RPC response");
  return body.result as any;
}
async function ensureMainnet(chain: MachineChain, url: string) {
  if (chain.family === "evm") {
    if (Number(BigInt(await rpc(url, "eth_chainId", []))) !== chain.chainId) throw new Error("RPC network mismatch");
  } else if (chain.family === "solana") {
    if (await rpc(url, "getGenesisHash", []) !== "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d") throw new Error("RPC network mismatch");
  }
}
async function evmNative(chain: MachineChain, address: string, url: string) {
  await ensureMainnet(chain, url);
  const [balance, nonce, block] = await Promise.all([
    rpc(url, "eth_getBalance", [address, "latest"]), rpc(url, "eth_getTransactionCount", [address, "latest"]), rpc(url, "eth_blockNumber", []),
  ]);
  const atomic = BigInt(balance);
  return { chain: chain.id, family: chain.family, address, asset: chain.symbol, decimals: chain.decimals,
    balanceAtomic: atomic.toString(), balance: atomicText(atomic, chain.decimals), transactionCount: Number(BigInt(nonce)),
    blockNumber: Number(BigInt(block)), explorer: `${chain.explorer}/address/${address}` };
}
async function evmToken(chain: MachineChain, address: string, url: string) {
  if (!chain.stablecoin) throw new Error("No stablecoin configured");
  await ensureMainnet(chain, url);
  const result = await rpc(url, "eth_call", [{ to: chain.stablecoin.address,
    data: `0x70a08231${address.slice(2).toLowerCase().padStart(64, "0")}` }, "latest"]);
  const atomic = BigInt(result);
  return { chain: chain.id, address, token: chain.stablecoin.address, symbol: chain.stablecoin.symbol,
    decimals: chain.stablecoin.decimals, balanceAtomic: atomic.toString(), balance: atomicText(atomic, chain.stablecoin.decimals) };
}
async function solanaNative(chain: MachineChain, address: string, url: string) {
  await ensureMainnet(chain, url);
  const result = await rpc(url, "getBalance", [address, { commitment: "confirmed" }]);
  const atomic = BigInt(result.value);
  return { chain: chain.id, family: chain.family, address, asset: chain.symbol, decimals: chain.decimals,
    balanceAtomic: atomic.toString(), balance: atomicText(atomic, chain.decimals), slot: result.context.slot,
    explorer: `${chain.explorer}/account/${address}` };
}
async function solanaToken(chain: MachineChain, address: string, url: string) {
  if (!chain.stablecoin) throw new Error("No stablecoin configured");
  await ensureMainnet(chain, url);
  const result = await rpc(url, "getTokenAccountsByOwner", [address, { mint: chain.stablecoin.address }, { encoding: "jsonParsed", commitment: "confirmed" }]);
  const atomic = (result.value as any[]).reduce((sum, row) => sum + BigInt(row.account.data.parsed.info.tokenAmount.amount), 0n);
  return { chain: chain.id, address, token: chain.stablecoin.address, symbol: chain.stablecoin.symbol,
    decimals: chain.stablecoin.decimals, balanceAtomic: atomic.toString(), balance: atomicText(atomic, chain.stablecoin.decimals), slot: result.context.slot };
}
async function bitcoinNative(chain: MachineChain, address: string, url: string) {
  const response = await fetch(`${url}/address/${encodeURIComponent(address)}`, { signal: timeout() });
  if (!response.ok) throw new Error("Bitcoin API unavailable");
  const row = await response.json() as any;
  const funded = BigInt(row.chain_stats.funded_txo_sum), spent = BigInt(row.chain_stats.spent_txo_sum);
  const memFunded = BigInt(row.mempool_stats.funded_txo_sum), memSpent = BigInt(row.mempool_stats.spent_txo_sum);
  const confirmed = funded - spent, total = confirmed + memFunded - memSpent;
  return { chain: chain.id, family: chain.family, address, asset: chain.symbol, decimals: chain.decimals,
    balanceAtomic: total.toString(), balance: atomicText(total, chain.decimals), confirmedAtomic: confirmed.toString(),
    transactionCount: Number(row.chain_stats.tx_count) + Number(row.mempool_stats.tx_count), explorer: `${chain.explorer}/address/${address}` };
}
async function tronNative(chain: MachineChain, address: string, url: string) {
  const response = await fetch(`${url}/v1/accounts/${encodeURIComponent(address)}`, { signal: timeout() });
  if (!response.ok) throw new Error("Tron API unavailable");
  const body = await response.json() as any;
  const account = body.data?.[0], atomic = BigInt(account?.balance ?? 0);
  return { chain: chain.id, family: chain.family, address, asset: chain.symbol, decimals: chain.decimals,
    balanceAtomic: atomic.toString(), balance: atomicText(atomic, chain.decimals),
    blockTimestamp: account?.latest_opration_time ?? null, explorer: `${chain.explorer}/#/address/${address}` };
}
async function tronToken(chain: MachineChain, address: string, url: string) {
  if (!chain.stablecoin) throw new Error("No stablecoin configured");
  const response = await fetch(`${url}/v1/accounts/${encodeURIComponent(address)}?only_confirmed=true`, { signal: timeout() });
  if (!response.ok) throw new Error("Tron API unavailable");
  const body = await response.json() as any;
  const map = body.data?.[0]?.trc20?.find((row: Record<string, string>) => row[chain.stablecoin?.address ?? ""] !== undefined);
  const atomic = BigInt(map?.[chain.stablecoin.address] ?? 0);
  return { chain: chain.id, address, token: chain.stablecoin.address, symbol: chain.stablecoin.symbol,
    decimals: chain.stablecoin.decimals, balanceAtomic: atomic.toString(), balance: atomicText(atomic, chain.stablecoin.decimals) };
}

export type ReadKind = "wallet" | "stablecoin" | "transaction" | "snapshot";
export async function readWallet(chainId: string, address: string) {
  const chain = machineChain(chainId);
  if (!chain || !validAddress(chain, address)) throw new RangeError("Valid supported-chain address required");
  const url = rpcUrl(chain);
  if (chain.family === "evm") return evmNative(chain, address, url);
  if (chain.family === "solana") return solanaNative(chain, address, url);
  if (chain.family === "bitcoin") return bitcoinNative(chain, address, url);
  return tronNative(chain, address, url);
}
export async function readStablecoin(chainId: string, address: string) {
  const chain = machineChain(chainId);
  if (!chain || !validAddress(chain, address)) throw new RangeError("Valid supported-chain address required");
  if (!chain.stablecoin) throw new RangeError(`${chain.name} has no configured stablecoin read`);
  const url = rpcUrl(chain);
  return chain.family === "evm" ? evmToken(chain, address, url) : chain.family === "solana" ? solanaToken(chain, address, url) : tronToken(chain, address, url);
}
export async function readTransaction(chainId: string, tx: string) {
  const chain = machineChain(chainId);
  if (!chain) throw new RangeError("Supported chain required");
  const url = rpcUrl(chain);
  if (chain.family === "evm") {
    if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) throw new RangeError("Valid transaction hash required");
    await ensureMainnet(chain, url); const receipt = await rpc(url, "eth_getTransactionReceipt", [tx]);
    return receipt ? { chain: chain.id, tx, found: true, success: receipt.status === "0x1", blockNumber: Number(BigInt(receipt.blockNumber)), gasUsed: BigInt(receipt.gasUsed).toString(), explorer: `${chain.explorer}/tx/${tx}` } : { chain: chain.id, tx, found: false };
  }
  if (chain.family === "solana") {
    if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(tx)) throw new RangeError("Valid transaction signature required");
    await ensureMainnet(chain, url); const result = await rpc(url, "getSignatureStatuses", [[tx], { searchTransactionHistory: true }]); const status = result.value?.[0];
    return status ? { chain: chain.id, tx, found: true, success: status.err === null, slot: status.slot, confirmationStatus: status.confirmationStatus, explorer: `${chain.explorer}/tx/${tx}` } : { chain: chain.id, tx, found: false };
  }
  if (chain.family === "bitcoin") {
    if (!/^[0-9a-fA-F]{64}$/.test(tx)) throw new RangeError("Valid Bitcoin transaction ID required");
    const response = await fetch(`${url}/tx/${tx}`, { signal: timeout() });
    if (response.status === 404) return { chain: chain.id, tx, found: false };
    if (!response.ok) throw new Error("Bitcoin API unavailable"); const row = await response.json() as any;
    return { chain: chain.id, tx, found: true, success: true, confirmed: Boolean(row.status?.confirmed), blockHeight: row.status?.block_height ?? null, feeAtomic: String(row.fee), explorer: `${chain.explorer}/tx/${tx}` };
  }
  if (!/^[0-9a-fA-F]{64}$/.test(tx)) throw new RangeError("Valid Tron transaction ID required");
  const response = await fetch(`${url}/wallet/gettransactioninfobyid`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: tx }), signal: timeout() });
  if (!response.ok) throw new Error("Tron API unavailable"); const row = await response.json() as any;
  return Object.keys(row).length ? { chain: chain.id, tx, found: true, success: row.receipt?.result === "SUCCESS", blockNumber: row.blockNumber, feeAtomic: String(row.fee ?? 0), explorer: `${chain.explorer}/#/transaction/${tx}` } : { chain: chain.id, tx, found: false };
}
export async function snapshot(chainId: string, address: string) {
  const native = await readWallet(chainId, address); const chain = machineChain(chainId);
  const stablecoin = chain?.stablecoin ? await readStablecoin(chainId, address) : null;
  return { chain: chainId, address, native, stablecoin, units: 1, observedAt: new Date().toISOString(), consistency: "independent latest or confirmed public-chain reads" };
}
/** Dune-style "full query": every network that accepts this address, native + stablecoin, in one call. */
export async function portfolio(address: string) {
  const chains = MACHINE_CHAINS.filter((chain) => validAddress(chain, address));
  if (!chains.length) throw new RangeError("Address is not valid on any supported network");
  const results = await Promise.allSettled(chains.map((chain) => snapshot(chain.id, address)));
  return { address, networks: chains.map((chain, i) => { const r = results[i]!; return r.status === "fulfilled" ? { chain: chain.id, ok: true, native: r.value.native, stablecoin: r.value.stablecoin } : { chain: chain.id, ok: false, error: "Network temporarily unavailable" }; }), units: 1, observedAt: new Date().toISOString() };
}
export const configuredNetworks = () => Object.fromEntries(MACHINE_CHAINS.map((chain) => [chain.id, { configured: Boolean(rpcUrl(chain)), family: chain.family, symbol: chain.symbol, stablecoin: chain.stablecoin?.symbol ?? null }]));
