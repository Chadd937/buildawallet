import { Hono } from "hono";
import type { Env } from "./index";
import { hashToken } from "./subscription";
import { PERIOD_SECONDS, planById } from "./plans";
import { readQuery, transactionStatus, validQuery, type ReadQuery } from "./data";
import {
  broadcastBaseTransaction,
  broadcastSolanaTransaction,
  prepareBaseTransaction,
  prepareSolanaTransaction,
  type PrepareIntent,
} from "./transactions";

const api = new Hono<{ Bindings: Env }>();
const now = () => Math.floor(Date.now() / 1000);
type Account = { chain: "base" | "solana"; wallet: string; expires_at: number; plan_id: string };
type UsageState = { plan: NonNullable<ReturnType<typeof planById>>; used: number; periodStart: number; expiresAt: number };

async function account(c: any): Promise<Account | null> {
  const key = /^Bearer (baw_live_[0-9a-f]{64})$/.exec(c.req.header("Authorization") ?? "")?.[1];
  if (!key || !c.env.DB) return null;
  return c.env.DB.prepare(`SELECT k.chain,k.wallet,e.expires_at,e.plan_id FROM human_api_keys k
    JOIN human_entitlements e ON e.chain=k.chain AND e.wallet=k.wallet
    WHERE k.token_hash=? AND e.expires_at>?`).bind(await hashToken(key), now()).first() as Promise<Account | null>;
}

async function usage(c: any, user: Account): Promise<UsageState | null> {
  const plan = planById(user.plan_id);
  if (!plan) return null;
  const row = await c.env.DB.prepare("SELECT period_start,used FROM human_api_usage WHERE chain=? AND wallet=?")
    .bind(user.chain, user.wallet).first() as { period_start: number; used: number } | null;
  const active = row && row.period_start + PERIOD_SECONDS > now();
  return { plan, used: active ? row!.used : 0, periodStart: active ? row!.period_start : now(), expiresAt: user.expires_at };
}

async function consume(c: any, user: Account, units: number, limit: number) {
  const time = now();
  const row = await c.env.DB.prepare(`INSERT INTO human_api_usage(chain,wallet,period_start,used) VALUES(?,?,?,0)
    ON CONFLICT(chain,wallet) DO UPDATE SET period_start=excluded.period_start,used=0
    WHERE human_api_usage.period_start+?<=?`)
    .bind(user.chain, user.wallet, time, PERIOD_SECONDS, time).run();
  if (!row.success) throw new Error("Usage storage unavailable");
  const update = await c.env.DB.prepare(`UPDATE human_api_usage SET used=used+? WHERE chain=? AND wallet=?
    AND used+?<=? RETURNING used`).bind(units, user.chain, user.wallet, units, limit).first() as { used: number } | null;
  return update?.used ?? null;
}

function meterHeaders(c: any, state: UsageState, used: number, cost: number) {
  c.header("X-RateLimit-Limit", String(state.plan.units));
  c.header("X-RateLimit-Remaining", String(state.plan.units - used));
  c.header("X-Units-Charged", String(cost));
  c.header("Cache-Control", "no-store");
}

async function authorized(c: any, cost: number) {
  const user = await account(c);
  if (!user) return { response: c.json({ error: "Active plan and API key required" }, 401) };
  const state = await usage(c, user);
  if (!state) return { response: c.json({ error: "Unknown plan" }, 503) };
  if (state.used + cost > state.plan.units) return { response: c.json({ error: "API quota exhausted", remaining: 0 }, 429) };
  return { user, state };
}

api.use("/*", async (c, next) => {
  if (!c.env.DB || !c.env.REQUEST_RATE_LIMITER) return c.json({ error: "API unavailable" }, 503);
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { success } = await c.env.REQUEST_RATE_LIMITER.limit({ key: `api:${ip}` });
  if (!success) return c.json({ error: "Rate limit exceeded" }, 429, { "Retry-After": "60" });
  await next();
});

api.get("/usage", async (c) => {
  try {
    const user = await account(c);
    if (!user) return c.json({ error: "Active plan and API key required" }, 401);
    const state = await usage(c, user);
    if (!state) return c.json({ error: "Unknown plan" }, 503);
    return c.json({ plan: state.plan.id, quota: state.plan.units, used: state.used,
      remaining: Math.max(0, state.plan.units - state.used), batchLimit: state.plan.batchLimit,
      periodStart: state.periodStart, periodEndsAt: state.periodStart + PERIOD_SECONDS,
      subscriptionExpiresAt: state.expiresAt });
  } catch { return c.json({ error: "API usage unavailable" }, 503); }
});

async function execute(c: any, queries: ReadQuery[], transaction?: { chain: "base" | "solana"; tx: string }, composite = false) {
  if (!c.env.BASE_RPC_URL?.startsWith("https://") || !c.env.SOLANA_RPC_URL?.startsWith("https://"))
    return c.json({ error: "Mainnet RPC unavailable" }, 503);
  try {
    const auth = await authorized(c, queries.length + (transaction ? 1 : 0));
    if (auth.response) return auth.response;
    const { user, state } = auth;
    const cost = queries.length + (transaction ? 1 : 0);
    if (!composite && cost > 1 && (!state.plan.batchLimit || cost > state.plan.batchLimit))
      return c.json({ error: `This plan allows batches of at most ${state.plan.batchLimit} queries` }, 403);
    const results = [];
    for (const query of queries) results.push(await readQuery(c.env.BASE_RPC_URL, c.env.SOLANA_RPC_URL, query));
    if (transaction) results.push(await transactionStatus(transaction.chain,
      transaction.chain === "base" ? c.env.BASE_RPC_URL : c.env.SOLANA_RPC_URL, transaction.tx));
    const used = await consume(c, user, cost, state.plan.units);
    if (used === null) return c.json({ error: "API quota exhausted", remaining: 0 }, 429);
    meterHeaders(c, state, used, cost);
    if (composite) {
      const native = results[0] as Record<string, any>;
      const usdc = results[1] as Record<string, any>;
      return c.json({ chain: native.chain, address: native.address, native, usdc, units: cost,
        observedAt: new Date().toISOString(),
        context: { nativeBlock: native.blockNumber ?? null, nativeSlot: native.slot ?? null,
          usdcSlot: usdc.slot ?? null, consistency: "independent confirmed or latest RPC reads" } });
    }
    return c.json(cost === 1 ? results[0] : { results, units: cost });
  } catch { return c.json({ error: "Mainnet RPC or API usage unavailable" }, 503); }
}

async function paidTransactionAction(c: any, chain: "base" | "solana", kind: "prepare" | "broadcast") {
  const rpc = chain === "base" ? c.env.BASE_RPC_URL : c.env.SOLANA_RPC_URL;
  if (!rpc?.startsWith("https://")) return c.json({ error: `${chain} mainnet RPC unavailable` }, 503);
  try {
    const auth = await authorized(c, 1);
    if (auth.response) return auth.response;
    const { user, state } = auth;
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") return c.json({ error: "Valid JSON body required" }, 400);
    let result;
    if (kind === "prepare") {
      const intent = body as PrepareIntent;
      result = chain === "base" ? await prepareBaseTransaction(rpc, intent) : await prepareSolanaTransaction(rpc, intent);
    } else if (chain === "base") {
      result = await broadcastBaseTransaction(rpc, String((body as any).signedTransaction ?? ""));
    } else {
      result = await broadcastSolanaTransaction(rpc, String((body as any).signedTransactionBase64 ?? ""));
    }
    const used = await consume(c, user, 1, state.plan.units);
    if (used === null) return c.json({ error: "API quota exhausted", remaining: 0 }, 429);
    meterHeaders(c, state, used, 1);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transaction request failed";
    if (/required|must|invalid|Valid|exceeds|zeroed/.test(message)) return c.json({ error: message }, 400);
    return c.json({ error: "Mainnet RPC transaction service unavailable" }, 503);
  }
}

api.get("/:chain/wallet/:address", (c) => {
  const q = { chain: c.req.param("chain"), kind: "wallet", address: c.req.param("address") };
  return validQuery(q) ? execute(c, [q]) : c.json({ error: "Valid chain and address required" }, 400);
});
api.get("/:chain/usdc/:address", (c) => {
  const q = { chain: c.req.param("chain"), kind: "usdc", address: c.req.param("address") };
  return validQuery(q) ? execute(c, [q]) : c.json({ error: "Valid chain and address required" }, 400);
});
api.get("/:chain/snapshot/:address", (c) => {
  const chain = c.req.param("chain"), address = c.req.param("address");
  const native = { chain, kind: "wallet", address };
  const usdc = { chain, kind: "usdc", address };
  return validQuery(native) && validQuery(usdc) ? execute(c, [native, usdc], undefined, true) :
    c.json({ error: "Valid chain and address required" }, 400);
});
api.get("/:chain/transaction/:tx", (c) => {
  const chain = c.req.param("chain"), tx = c.req.param("tx");
  if ((chain === "base" && /^0x[0-9a-fA-F]{64}$/.test(tx)) ||
    (chain === "solana" && /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(tx)))
    return execute(c, [], { chain, tx } as { chain: "base" | "solana"; tx: string });
  return c.json({ error: "Valid chain and transaction ID required" }, 400);
});
api.post("/:chain/transaction/prepare", (c) => {
  const chain = c.req.param("chain");
  return chain === "base" || chain === "solana" ? paidTransactionAction(c, chain, "prepare") :
    c.json({ error: "Valid chain required" }, 400);
});
api.post("/:chain/transaction/broadcast", (c) => {
  const chain = c.req.param("chain");
  return chain === "base" || chain === "solana" ? paidTransactionAction(c, chain, "broadcast") :
    c.json({ error: "Valid chain required" }, 400);
});
api.post("/batch", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !Array.isArray(body.queries) || body.queries.length < 1 || body.queries.length > 50 ||
    !body.queries.every(validQuery)) return c.json({ error: "Provide 1 to 50 valid wallet or USDC queries" }, 400);
  return execute(c, body.queries);
});

export default api;
