import { Hono } from "hono";
import type { Env } from "./index";

const app = new Hono<{ Bindings: Env }>();
const evm = [
  { id: "ethereum", chainId: 1, symbol: "ETH", rpc: ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com"], explorer: "https://etherscan.io", usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  { id: "base", chainId: 8453, symbol: "ETH", rpc: ["https://mainnet.base.org", "https://base-rpc.publicnode.com"], explorer: "https://basescan.org", usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
  { id: "arbitrum", chainId: 42161, symbol: "ETH", rpc: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com", "https://arbitrum.llamarpc.com"], explorer: "https://arbiscan.io", usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
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

const evmAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value);
async function limited(c: any) {
  if (!c.env.REQUEST_RATE_LIMITER) return false;
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const result = await c.env.REQUEST_RATE_LIMITER.limit({ key: "public-inspect:" + ip });
  return result.success;
}
async function contractCall(config: typeof evm[number], to: string, data: string) {
  return (await firstSuccessful(config.rpc, async (url) => {
    const chainId = await jsonRpc(url, "eth_chainId", []);
    if (Number(BigInt(String(chainId))) !== config.chainId) throw new Error("network_mismatch");
    const result = await jsonRpc(url, "eth_call", [{ to, data }, "latest"]);
    if (typeof result !== "string" || !/^0x[0-9a-fA-F]+$/.test(result))
      throw new Error("invalid_contract_response");
    return result;
  })).result;
}
// Known ERC-20 contracts can be queried without an indexer. This is NOT wallet-wide token discovery.
app.get("/:chain/:address/token/:contract", async (c) => {
  const config = evm.find((item) => item.id === c.req.param("chain"));
  const address = c.req.param("address"), contract = c.req.param("contract");
  if (!config || !evmAddress(address) || !evmAddress(contract))
    return c.json({ error: "Valid EVM chain, address and token contract required" }, 400);
  try {
    if (!(await limited(c))) return c.json({ error: "Rate limited or unavailable" }, 429);
    const atomic = BigInt(await contractCall(config, contract,
      "0x70a08231" + address.slice(2).toLowerCase().padStart(64, "0")));
    let decimals: number | null = null, symbol: string | null = null;
    const warnings: string[] = [];
    try {
      const raw = BigInt(await contractCall(config, contract, "0x313ce567"));
      if (raw >= 0n && raw <= 255n) decimals = Number(raw);
      else warnings.push("Token decimals invalid");
    } catch { warnings.push("Token decimals unavailable"); }
    try {
      const result = await contractCall(config, contract, "0x95d89b41");
      const raw = result.slice(2);
      // Support conventional ABI dynamic strings and fixed bytes32 symbols.
      if (raw.length >= 128 && BigInt("0x" + raw.slice(0, 64)) === 32n) {
        const len = Number(BigInt("0x" + raw.slice(64, 128)));
        if (len <= 64 && raw.length >= 128 + len * 2) {
          const bytes = raw.slice(128, 128 + len * 2).match(/../g) ?? [];
          symbol = new TextDecoder().decode(Uint8Array.from(bytes.map(h => parseInt(h, 16))));
        }
      } else if (raw.length === 64) {
        const bytes = raw.match(/../g) ?? [];
        symbol = new TextDecoder().decode(Uint8Array.from(bytes.map(h => parseInt(h, 16)))).replace(/\\0+$/g, "");
      }
      if (!symbol) warnings.push("Token symbol unavailable");
    } catch { warnings.push("Token symbol unavailable"); }
    return c.json({ chain: config.id, address, contract, standard: "ERC-20 balanceOf",
      balanceAtomic: atomic.toString(), decimals, symbol,
      balance: decimals === null ? null : formatted(atomic, decimals),
      complete: warnings.length === 0, warnings, observedAt: new Date().toISOString() });
  } catch {
    return c.json({ error: "Token contract read unavailable", code: "token_unavailable" }, 503);
  }
});
app.get("/bitcoin/:address/utxos", async (c) => {
  const address = c.req.param("address");
  if (!validBitcoin(address)) return c.json({ error: "Invalid Bitcoin address" }, 400);
  try {
    if (!(await limited(c))) return c.json({ error: "Rate limited or unavailable" }, 429);
    const { result } = await firstSuccessful(btcApi, url =>
      jsonGet(url + "/address/" + encodeURIComponent(address) + "/utxo"));
    if (!Array.isArray(result)) throw new Error("invalid_utxo_response");
    return c.json({ chain: "bitcoin", address, utxos: result.slice(0, 100).map((x: any) => ({
      txid: x.txid, vout: x.vout, valueSats: x.value, confirmed: Boolean(x.status?.confirmed),
      blockHeight: x.status?.block_height ?? null })),
      truncated: result.length > 100, totalReturned: result.length,
      note: "UTXO information is not an Ordinals or Runes inventory." });
  } catch { return c.json({ error: "Bitcoin UTXO providers unavailable" }, 503); }
});
app.get("/portfolio/:address", async (c) => {
  const address = c.req.param("address");
  if (!evmAddress(address)) return c.json({ error: "Valid EVM address required" }, 400);
  try {
    if (!(await limited(c))) return c.json({ error: "Rate limited or unavailable" }, 429);
    // Bound public fanout to the seven configured EVM mainnets.
    const result = await Promise.allSettled(evm.map(config => evmInspect(config, address)));
    const networks = result.map((item, index) => item.status === "fulfilled"
      ? { chain: evm[index]!.id, ok: true, data: item.value }
      : { chain: evm[index]!.id, ok: false, data: null, error: "Public RPC unavailable" });
    return c.json({ address, chainsQueried: evm.length, networks,
      complete: false, tokenDiscovery: "indexed_discovery_not_available",
      observedAt: new Date().toISOString() }, 200,
      { "Cache-Control": "public, max-age=30" });
  } catch { return c.json({ error: "Portfolio lookup unavailable" }, 503); }
});
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
