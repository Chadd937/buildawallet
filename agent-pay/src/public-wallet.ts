import { Hono } from "hono";
import type { Env } from "./index";
import { solanaWalletSnapshot, validSolanaAddress } from "./solana";

const publicWallet = new Hono<{ Bindings: Env }>();
const programs = [
  { label: "spl-token", id: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
  { label: "token-2022", id: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" },
] as const;

async function rpc(url: string, method: string, params: unknown[]): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error("rpc_http_" + response.status);
  const payload: any = await response.json();
  if (payload?.error) throw new Error("rpc_code_" + String(payload.error.code ?? "unknown"));
  if (!("result" in payload)) throw new Error("rpc_invalid_response");
  return payload.result;
}

// Paginated public transaction signatures, separate from the lightweight snapshot.
publicWallet.get("/solana/:address/history", async (c) => {
  const address = c.req.param("address");
  if (!validSolanaAddress(address)) return c.json({ error: "Invalid Solana address" }, 400);
  const before = c.req.query("before");
  if (before && !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(before))
    return c.json({ error: "Invalid before signature" }, 400);
  const requested = Number(c.req.query("limit") ?? "10");
  if (!Number.isInteger(requested) || requested < 1 || requested > 20)
    return c.json({ error: "limit must be between 1 and 20" }, 400);
  if (!c.env.REQUEST_RATE_LIMITER) return c.json({ error: "Rate limiter unavailable" }, 503);
  try {
    const { success } = await c.env.REQUEST_RATE_LIMITER.limit({
      key: "public-solana:" + (c.req.header("CF-Connecting-IP") ?? "unknown"),
    });
    if (!success) return c.json({ error: "Rate limit exceeded" }, 429);
    const preferredUrl = c.env.SOLANA_RPC_URL;
    const configured: string[] = preferredUrl?.startsWith("https://") ? [preferredUrl] : [];
    const candidates = [...new Set([...configured, "https://solana-rpc.publicnode.com",
      "https://api.mainnet-beta.solana.com"])];
    for (const url of candidates) {
      try {
        if (await rpc(url, "getGenesisHash", []) !==
            "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d") continue;
        const entries = await rpc(url, "getSignaturesForAddress", [address, {
          limit: requested, commitment: "confirmed", ...(before ? { before } : {}),
        }]);
        if (!Array.isArray(entries)) throw new Error("Malformed RPC history");
        return c.json({ chain: "solana", address,
          transactions: entries.map((tx: any) => ({
            signature: tx.signature, slot: tx.slot, blockTime: tx.blockTime ?? null,
            confirmationStatus: tx.confirmationStatus ?? null, success: tx.err === null,
          })),
          nextBefore: entries.length === requested ? entries[entries.length - 1]?.signature ?? null : null,
          completeHistory: false,
          observedAt: new Date().toISOString() },
          200, { "Cache-Control": "public, max-age=15" });
      } catch { /* continue to next public mainnet RPC */ }
    }
    return c.json({ error: "Public transaction-history providers unavailable" }, 503);
  } catch { return c.json({ error: "History lookup failed" }, 503); }
});

publicWallet.get("/solana/:address", async (c) => {
  const address = c.req.param("address");
  const headers = { "Cache-Control": "public, max-age=15", "X-Content-Type-Options": "nosniff" };
  if (!validSolanaAddress(address)) return c.json({ error: "Invalid Solana wallet address" }, 400, headers);
  const configuredUrl = c.env.SOLANA_RPC_URL;
  if (!configuredUrl?.startsWith("https://") || !c.env.REQUEST_RATE_LIMITER)
    return c.json({ error: "Wallet lookup is not configured" }, 503, headers);
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  try {
    const { success } = await c.env.REQUEST_RATE_LIMITER.limit({ key: "public-solana:" + ip });
    if (!success) return c.json({ error: "Too many lookups. Retry shortly." }, 429, { "Retry-After": "60" });
  } catch {
    return c.json({ error: "Rate limiter unavailable" }, 503, headers);
  }
  try {
    // A failure to confirm mainnet or native balance is fatal, not an empty wallet.
    // Validate every candidate with the mainnet genesis hash before reading balances.
    const urls = [configuredUrl, "https://solana-rpc.publicnode.com", "https://api.mainnet.solana.com"]
      .filter((candidate, index, all) => all.indexOf(candidate) === index);
    let url = configuredUrl;
    let native: Awaited<ReturnType<typeof solanaWalletSnapshot>> | undefined;
    const failures: string[] = [];
    for (const [index, candidate] of urls.entries()) {
      try {
        native = await solanaWalletSnapshot(candidate, address);
        url = candidate;
        break;
      } catch (error) {
        failures.push("provider-" + (index + 1) + ": " +
          (error instanceof Error && /network mismatch/i.test(error.message)
            ? "network mismatch" : "unavailable"));
      }
    }
    if (!native) return c.json({
      error: "Solana RPC providers unavailable; balance not verified",
      code: "solana_rpc_unavailable", providersTried: urls.length,
      diagnostics: failures,
    }, 503, { "Cache-Control": "no-store" });
    const warnings: string[] = [];
    const diagnostics: Record<string, string[]> = {};
    function failureReason(error: unknown): string {
      const message = error instanceof Error ? error.message : "";
      if (/^rpc_http_\d+$/.test(message) || /^rpc_code_-?\d+$/.test(message) ||
          message === "rpc_invalid_response") return message;
      return "connection_or_timeout";
    }
    // The provider that allows getBalance may block account and history methods.
    // Retry each method independently across public RPCs after validating the genesis.
    async function readWithFallback(method: string, params: unknown[]) {
      const methodFailures: string[] = [];
      for (const candidate of [url, ...urls.filter((candidate) => candidate !== url)]) {
        try {
          if (candidate !== url) {
            const genesis = await rpc(candidate, "getGenesisHash", []);
            if (genesis !== "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d") {
              methodFailures.push("network_mismatch"); continue;
            }
          }
          return await rpc(candidate, method, params);
        } catch (error) { methodFailures.push(failureReason(error)); }
      }
      diagnostics[method] = methodFailures;
      throw new Error(method + " unavailable");
    }
    const tokenAccounts: Array<Record<string, unknown>> = [];
    for (const program of programs) {
      try {
        const result = await readWithFallback("getTokenAccountsByOwner", [
          address, { programId: program.id }, { encoding: "jsonParsed", commitment: "confirmed" },
        ]);
        if (!Array.isArray(result?.value)) throw new Error("Malformed token response");
        for (const row of result.value) {
          const info = row?.account?.data?.parsed?.info;
          const balance = info?.tokenAmount;
          if (info?.owner !== address || typeof info?.mint !== "string" ||
              !/^\d+$/.test(balance?.amount ?? "") || !Number.isInteger(balance?.decimals)) continue;
          tokenAccounts.push({
            account: row.pubkey, mint: info.mint, program: program.label,
            amountAtomic: balance.amount, decimals: balance.decimals,
            amount: balance.uiAmountString ?? null, state: info.state ?? null,
            delegatedAmountAtomic: info.delegatedAmount?.amount ?? null,
            delegate: info.delegate ?? null, closeAuthority: info.closeAuthority ?? null,
            token2022Extensions: Array.isArray(info.extensions) ? info.extensions : [],
          });
        }
      } catch {
        warnings.push(program.label + " token balances unavailable");
      }
    }
    let recentTransactions: Array<Record<string, unknown>> | null = null;
    try {
      const entries = await readWithFallback("getSignaturesForAddress", [
        address, { limit: 10, commitment: "confirmed" },
      ]);
      if (!Array.isArray(entries)) throw new Error("Malformed signature history");
      recentTransactions = entries.map((tx: any) => ({
        signature: tx.signature, slot: tx.slot, blockTime: tx.blockTime ?? null,
        confirmationStatus: tx.confirmationStatus ?? null, success: tx.err === null,
      }));
    } catch {
      warnings.push("Recent transaction signatures unavailable");
    }
    return c.json({
      chain: "solana", network: "mainnet-beta", address,
      balanceLamports: native.balanceLamports, balanceSol: native.balanceSol, slot: native.slot,
      tokenAccounts, tokenAccountCount: warnings.some(w => w.includes("token balances unavailable")) ? null : tokenAccounts.length, recentTransactions,
      complete: warnings.length === 0, warnings, diagnostics, observedAt: new Date().toISOString(),
      explorer: "https://solscan.io/account/" + address,
      notes: "Read-only public-chain data. Token metadata, prices, NFT classification and stake accounts are not included. An incomplete token query does not imply zero holdings.",
    }, 200, headers);
  } catch {
    return c.json({ error: "Wallet lookup failed; balance not verified", code: "wallet_lookup_failed" }, 503, { "Cache-Control": "no-store" });
  }
});

export default publicWallet;
