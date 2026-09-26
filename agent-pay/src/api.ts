import { Hono } from "hono";
import type { Env } from "./index";
import { hashToken } from "./subscription";
import { PERIOD_SECONDS, planById } from "./plans";
import { readQuery, transactionStatus, validQuery, type ReadQuery } from "./data";

const api = new Hono<{ Bindings: Env }>();
const now = () => Math.floor(Date.now() / 1000);
type Account = { chain: "base" | "solana"; wallet: string; expires_at: number; plan_id: string };

async function account(c: any): Promise<Account | null> {
  const key = /^Bearer (baw_live_[0-9a-f]{64})$/.exec(c.req.header("Authorization") ?? "")?.[1];
  if (!key || !c.env.DB) return null;
  return c.env.DB.prepare(`SELECT k.chain,k.wallet,e.expires_at,e.plan_id FROM human_api_keys k
    JOIN human_entitlements e ON e.chain=k.chain AND e.wallet=k.wallet
    WHERE k.token_hash=? AND e.expires_at>?`).bind(await hashToken(key), now()).first() as Promise<Account | null>;
}

async function usage(c: any, user: Account) {
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

async function execute(c: any, queries: ReadQuery[], transaction?: { chain: "base" | "solana"; tx: string }) {
  if (!c.env.BASE_RPC_URL?.startsWith("https://") || !c.env.SOLANA_RPC_URL?.startsWith("https://"))
    return c.json({ error: "Mainnet RPC unavailable" }, 503);
  try {
    const user = await account(c);
    if (!user) return c.json({ error: "Active plan and API key required" }, 401);
    const state = await usage(c, user);
    if (!state) return c.json({ error: "Unknown plan" }, 503);
    const cost = queries.length + (transaction ? 1 : 0);
    if (cost > 1 && (!state.plan.batchLimit || cost > state.plan.batchLimit))
      return c.json({ error: `This plan allows batches of at most ${state.plan.batchLimit} queries` }, 403);
    if (state.used + cost > state.plan.units) return c.json({ error: "API quota exhausted", remaining: 0 }, 429);
    // Resolve first. No usage is charged for an invalid address or upstream failure.
    const results = [];
    for (const query of queries) results.push(await readQuery(c.env.BASE_RPC_URL, c.env.SOLANA_RPC_URL, query));
    if (transaction) results.push(await transactionStatus(transaction.chain,
      transaction.chain === "base" ? c.env.BASE_RPC_URL : c.env.SOLANA_RPC_URL, transaction.tx));
    const used = await consume(c, user, cost, state.plan.units);
    if (used === null) return c.json({ error: "API quota exhausted", remaining: 0 }, 429);
    c.header("X-RateLimit-Limit", String(state.plan.units));
    c.header("X-RateLimit-Remaining", String(state.plan.units - used));
    c.header("Cache-Control", "no-store");
    return c.json(cost === 1 ? results[0] : { results, units: cost });
  } catch { return c.json({ error: "Mainnet RPC or API usage unavailable" }, 503); }
}

api.get("/:chain/wallet/:address", (c) => {
  const q = { chain: c.req.param("chain"), kind: "wallet", address: c.req.param("address") };
  return validQuery(q) ? execute(c, [q]) : c.json({ error: "Valid chain and address required" }, 400);
});
api.get("/:chain/usdc/:address", (c) => {
  const q = { chain: c.req.param("chain"), kind: "usdc", address: c.req.param("address") };
  return validQuery(q) ? execute(c, [q]) : c.json({ error: "Valid chain and address required" }, 400);
});
api.get("/:chain/transaction/:tx", (c) => {
  const chain = c.req.param("chain"), tx = c.req.param("tx");
  if ((chain === "base" && /^0x[0-9a-fA-F]{64}$/.test(tx)) ||
    (chain === "solana" && /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(tx)))
    return execute(c, [], { chain, tx });
  return c.json({ error: "Valid chain and transaction ID required" }, 400);
});
api.post("/batch", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !Array.isArray(body.queries) || body.queries.length < 1 || body.queries.length > 50 ||
    !body.queries.every(validQuery)) return c.json({ error: "Provide 1 to 50 valid wallet or USDC queries" }, 400);
  return execute(c, body.queries);
});

export default api;
