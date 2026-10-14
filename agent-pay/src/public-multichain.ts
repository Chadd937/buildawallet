import { Hono } from "hono";
import type { Env } from "./index";

const app = new Hono<{ Bindings: Env }>();
const evm = [
  { id: "ethereum", chainId: 1, symbol: "ETH", rpc: ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com"], explorer: "https://etherscan.io", usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  { id: "base", chainId: 8453, symbol: "ETH", rpc: ["https://mainnet.base.org", "https://base-rpc.publicnode.com"], explorer: "https://basescan.org", usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
  { id: "arbitrum", chainId: 42161, symbol: "ETH", rpc: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com", "https://arbitrum.llamarpc.com"], explorer: "https://arbiscan.io", usdc: "0xaf88d065e77c8C2239327C5EDb3A432268e5831", decimals: 6 },
  { id: "optimism", chainId: 10, symbol: "ETH", rpc: ["https://mainnet.optimism.io", "https://optimism-rpc.publicnode.com"], explorer: "https://optimistic.etherscan.io", usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 },
  { id: "polygon", chainId: 137, symbol: "POL", rpc: ["https://polygon-bor-rpc.publicnode.com", "https://polygon-rpc.com"], explorer: "https://polygonscan.com", usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
  { id: "bnb", chainId: 56, symbol: "BNB", rpc: ["https://bsc-dataseed.bnbchain.org", "https://bsc-rpc.publicnode.com"], explorer: "https://bscscan.com", usdc: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18 },
  { id: "avalanche", chainId: 43114, symbol: "AVAX", rpc: ["https://api.avax.network/ext/bc/C/rpc", "https://avalanche-c-chain-rpc.publicnode.com"], explorer: "https://snowtrace.io", usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", decimals: 6 },
] as const;
const btcApi = ["https://mempool.space/api", "https://blockstream.info/api"];

function formatted(atomic: bigint, decimals: number) {
  const base = 10n ** BigInt(decimals);
  const fraction = (atomic % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return (atomic / base).toString() + (fraction ? "." + fraction : "");
}
async function jsonRpc(endpoint: string, method: string, params: unknown[]) {
  const response = await fetch(endpoint, { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(6500) });
  if (!response.ok) throw new Error("upstream_http_" + response.status);
  const payload = await response.json() as { result?: unknown; error?: unknown };
  if (payload.error || !("result" in payload)) throw new Error("upstream_rpc_error");
  return payload.result;
}
async function jsonGet(endpoint: string) {
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(6500) });
  if (!response.ok) throw new Error("upstream_http_" + response.status);
  return response.json() as Promise<any>;
}
async function firstSuccessful<T>(endpoints: readonly string[], task: (endpoint: string) => Promise<T>): Promise<{ result: T; endpoint: string }> {
  for (const endpoint of endpoints) {
    try { return { result: await task(endpoint), endpoint }; } catch { /* use next public provider */ }
  }
  throw new Error("public_providers_unavailable");
}
async function evmInspect(config: typeof evm[number], address: string) {
  const { endpoint, result: native } = await firstSuccessful(config.rpc, async (url) => {
    const chainId = await jsonRpc(url, "eth_chainId", []);
    if (Number(BigInt(String(chainId))) !== config.chainId) throw new Error("network_mismatch");
    const [balance, nonce, block] = await Promise.all([
      jsonRpc(url, "eth_getBalance", [address, "latest"]),
      jsonRpc(url, "eth_getTransactionCount", [address, "latest"]),
      jsonRpc(url, "eth_blockNumber", []),
    ]);
    return { balanceAtomic: BigInt(String(balance)).toString(), transactionCount: Number(BigInt(String(nonce))),
      blockNumber: Number(BigInt(String(block))) };
  });
  const warnings: string[] = [];
  let stablecoin: Record<string, unknown> | null = null;
  const usdcDiagnostics: string[] = [];
  try {
    // A provider may support native reads while rejecting eth_call.
    // Verify chain ID independently on every fallback before trusting token data.
    const tokenResult = await firstSuccessful(
      [endpoint, ...config.rpc.filter((candidate) => candidate !== endpoint)],
      async (url) => {
        try {
        if (url !== endpoint) {
          const actualChainId = await jsonRpc(url, "eth_chainId", []);
          if (Number(BigInt(String(actualChainId))) !== config.chainId) throw new Error("network_mismatch");
        }
        const value = await jsonRpc(url, "eth_call", [{
          to: config.usdc, data: "0x70a08231" + address.slice(2).toLowerCase().padStart(64, "0"),
        }, "latest"]);
        if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value))
          throw new Error("invalid_contract_response");
        return BigInt(value);
        } catch (error) {
          const detail = error instanceof Error ? error.message : "unknown";
          const reason = detail.startsWith("upstream_http_") ? detail
            : detail === "network_mismatch" ? "network_mismatch"
            : detail === "invalid_contract_response" ? "invalid_contract_response"
            : detail === "upstream_rpc_error" ? "upstream_rpc_error"
            : "connection_or_timeout";
          usdcDiagnostics.push("provider-" + ((config.rpc as readonly string[]).indexOf(url) + 1) + ":" + reason);
          throw error;
        }
      },
    );
    const atomic = tokenResult.result;
    stablecoin = { symbol: "USDC", contract: config.usdc, balanceAtomic: atomic.toString(),
      decimals: config.decimals, balance: formatted(atomic, config.decimals) };
  } catch { warnings.push("USDC balance unavailable"); }
  return { chain: config.id, network: "mainnet", address, asset: config.symbol,
    native: { ...native, balance: formatted(BigInt(native.balanceAtomic), 18), symbol: config.symbol },
    stablecoin, diagnostics: { usdc: usdcDiagnostics }, tokenDiscovery: "not_supported_by_standard_public_rpc",
    recentTransactions: null, historyStatus: "indexer_required",
    explorer: config.explorer + "/address/" + address, complete: false,
    warnings, observedAt: new Date().toISOString() };
}
async function bitcoinInspect(address: string) {
  const { result: account, endpoint } = await firstSuccessful(btcApi, async (url) => {
    const result = await jsonGet(url + "/address/" + encodeURIComponent(address));
    if (!result?.chain_stats || !result?.mempool_stats) throw new Error("invalid_address_response");
    return result;
  });
  const chain = account.chain_stats, pending = account.mempool_stats;
  const confirmed = BigInt(chain.funded_txo_sum) - BigInt(chain.spent_txo_sum);
  const unconfirmed = BigInt(pending.funded_txo_sum) - BigInt(pending.spent_txo_sum);
  const warnings: string[] = [];
  let recentTransactions: unknown[] | null = null;
  try {
    const transactions = await jsonGet(endpoint + "/address/" + encodeURIComponent(address) + "/txs");
    if (!Array.isArray(transactions)) throw new Error("invalid_history");
    recentTransactions = transactions.slice(0, 10).map((t: any) => ({
      txid: t.txid, confirmed: Boolean(t.status?.confirmed),
      blockHeight: t.status?.block_height ?? null, feeSats: t.fee ?? null,
    }));
  } catch { warnings.push("Recent transactions unavailable"); }
  return { chain: "bitcoin", network: "mainnet", address,
    native: { symbol: "BTC", balanceAtomic: (confirmed + unconfirmed).toString(),
      balance: formatted(confirmed + unconfirmed, 8), confirmedSats: confirmed.toString(),
      unconfirmedSats: unconfirmed.toString(), transactionCount: Number(chain.tx_count) + Number(pending.tx_count) },
    recentTransactions, ordinalsAndRunes: null, ordinalsStatus: "specialized_indexer_required",
    complete: warnings.length === 0, warnings,
    explorer: "https://mempool.space/address/" + address, observedAt: new Date().toISOString() };
}
const validBitcoin = (address: string) =>
  /^(bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(address);
const allChains = [...evm.map((chain) => chain.id), "solana", "bitcoin"];
app.get("/chains", (c) => c.json({ chains: allChains, source: "public API only",
  note: "EVM full ERC-20/NFT discovery and Bitcoin Ordinals/Runes require indexed data; never inferred as zero." }));
app.get("/:chain/:address", async (c) => {
  const chainId = c.req.param("chain"), address = c.req.param("address");
  if (chainId === "solana") return c.json({ error: "Use /machine/public/solana/:address" }, 308);
  const config = evm.find((chain) => chain.id === chainId);
  if (!config && chainId !== "bitcoin") return c.json({ error: "Unsupported chain", supported: allChains }, 400);
  if (config ? !/^0x[0-9a-fA-F]{40}$/.test(address) : !validBitcoin(address))
    return c.json({ error: "Invalid address for chain" }, 400);
  if (!c.env.REQUEST_RATE_LIMITER) return c.json({ error: "Lookup rate limiter unavailable" }, 503);
  try {
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const { success } = await c.env.REQUEST_RATE_LIMITER.limit({ key: "public-inspect:" + ip });
    if (!success) return c.json({ error: "Rate limited" }, 429, { "Retry-After": "60" });
    const value = config ? await evmInspect(config, address) : await bitcoinInspect(address);
    return c.json(value, 200, { "Cache-Control": "public, max-age=15" });
  } catch {
    return c.json({ error: "Public providers unavailable", code: "upstream_unavailable" }, 503,
      { "Cache-Control": "no-store" });
  }
});
export default app;
