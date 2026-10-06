import { randomUUID } from "node:crypto";
import { appDatabase, type Database } from "./context.server";
import { FREE_PLAN_ID, FREE_UNITS, planById } from "@/lib/machine/config";

export type Account = {
  plan_id: string | null;
  quota: number;
  used: number;
  expires_at: string | null;
};
export type AccountKey = {
  id: string;
  name: string;
  token_hint: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};
export type UsageEvent = {
  id: number;
  endpoint: string;
  chain: string;
  units: number;
  allowed: number;
  created_at: string;
  key_id: string;
};
export type AccountPayment = {
  id: string;
  chain: string;
  tx: string;
  payer: string;
  plan_id: string;
  amount_atomic: string;
  paid_at: string;
};
export type Quote = {
  id: string;
  user_id: string;
  plan_id: string;
  chain: string;
  payer: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
};
export type MeterResult = {
  plan_id: string;
  quota: number;
  used: number;
  remaining: number;
  batch_limit: number;
  expires_at: string;
  allowed: boolean;
};
const now = () => new Date().toISOString();
const statement = (sql: string, ...params: unknown[]) =>
  appDatabase()
    .prepare(sql)
    .bind(...params);

export async function accountOverview(userId: string) {
  const db = appDatabase();
  const result = await db.batch([
    statement("SELECT plan_id,quota,used,expires_at FROM api_accounts WHERE user_id=?", userId),
    statement(
      "SELECT id,name,token_hint,created_at,last_used_at,revoked_at FROM api_account_keys WHERE user_id=? ORDER BY created_at DESC",
      userId,
    ),
    statement(
      "SELECT id,endpoint,chain,units,allowed,created_at,key_id FROM api_usage_events WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 100",
      userId,
    ),
    statement(
      "SELECT id,chain,tx,payer,plan_id,amount_atomic,paid_at FROM api_account_payments WHERE user_id=? ORDER BY paid_at DESC",
      userId,
    ),
    statement(
      "SELECT id,user_id,plan_id,chain,payer,created_at,expires_at,consumed_at FROM api_checkout_quotes WHERE user_id=? AND consumed_at IS NULL AND expires_at>? ORDER BY created_at DESC LIMIT 5",
      userId,
      now(),
    ),
  ]);
  return {
    account: (result[0]?.results[0] as Account | undefined) ?? null,
    keys: result[1]!.results as unknown as AccountKey[],
    usage: (result[2]!.results as unknown as UsageEvent[]).map((u) => ({
      ...u,
      id: String(u.id),
      allowed: Boolean(u.allowed),
    })),
    payments: result[3]!.results as unknown as AccountPayment[],
    quotes: result[4]!.results as unknown as Quote[],
  };
}
export async function claimWelcomeUnits(userId: string) {
  const expiresAt = new Date(Date.now() + 30 * 86400_000).toISOString();
  const result = await statement(
    `INSERT OR IGNORE INTO api_accounts(user_id,plan_id,quota,used,expires_at)
    SELECT ?,?,?,0,? WHERE NOT EXISTS(SELECT 1 FROM api_account_payments WHERE user_id=?)`,
    userId,
    FREE_PLAN_ID,
    FREE_UNITS,
    expiresAt,
    userId,
  ).run();
  if (result.meta.changes !== 1) throw new Error("The free allowance is only for new accounts.");
  return { units: FREE_UNITS, expiresAt };
}
export async function storeAccountKey(
  userId: string,
  name: string,
  tokenHash: string,
  hint: string,
) {
  await statement(
    "INSERT INTO api_account_keys(id,user_id,name,token_hash,token_hint) VALUES(?,?,?,?,?)",
    randomUUID(),
    userId,
    name,
    tokenHash,
    hint,
  ).run();
}
export async function revokeStoredAccountKey(userId: string, id: string) {
  await statement(
    "UPDATE api_account_keys SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL",
    now(),
    id,
    userId,
  ).run();
}
export async function storeCheckoutQuote(
  userId: string,
  planId: string,
  chain: string,
  payer: string,
) {
  const quote = {
    id: randomUUID(),
    user_id: userId,
    plan_id: planId,
    chain,
    payer,
    created_at: now(),
    expires_at: new Date(Date.now() + 86400_000).toISOString(),
    consumed_at: null,
  };
  await statement(
    "INSERT INTO api_checkout_quotes(id,user_id,plan_id,chain,payer,created_at,expires_at) VALUES(?,?,?,?,?,?,?)",
    quote.id,
    userId,
    planId,
    chain,
    payer,
    quote.created_at,
    quote.expires_at,
  ).run();
  return quote;
}
export const checkoutQuote = (userId: string, id: string) =>
  statement(
    "SELECT * FROM api_checkout_quotes WHERE id=? AND user_id=?",
    id,
    userId,
  ).first<Quote>();
export async function activateCheckout(
  userId: string,
  quoteId: string,
  tx: string,
  paidAt: string,
) {
  const db = appDatabase();
  const results = await db.batch([
    statement(
      `INSERT INTO api_account_payments(id,user_id,quote_id,chain,tx,payer,plan_id,amount_atomic,paid_at)
      SELECT ?,q.user_id,q.id,q.chain,CASE WHEN q.chain='base' THEN lower(?) ELSE ? END,q.payer,q.plan_id,
        CASE q.plan_id WHEN 'builder' THEN '15000000' WHEN 'pro' THEN '49000000' WHEN 'scale' THEN '149000000' END,?
      FROM api_checkout_quotes q WHERE q.id=? AND q.user_id=? RETURNING id`,
      randomUUID(),
      tx,
      tx,
      paidAt,
      quoteId,
      userId,
    ),
    statement("SELECT plan_id,quota,expires_at FROM api_accounts WHERE user_id=?", userId),
  ]);
  if (!results[0]?.results.length) throw new RangeError("Checkout not found");
  const account = results[1]!.results[0] as { plan_id: string; quota: number; expires_at: string };
  return {
    status: "unlocked" as const,
    plan: account.plan_id,
    units: account.quota,
    expiresAt: account.expires_at,
  };
}
export async function activateWalletPayment(
  chain: string,
  wallet: string,
  planId: string,
  tx: string,
  paidAt: string,
  amount: bigint,
) {
  const plan = planById(planId);
  if (!plan || plan.amountAtomic !== amount) throw new RangeError("Plan amount mismatch");
  const normalized = chain === "base" ? tx.toLowerCase() : tx;
  const results = await appDatabase().batch([
    statement(
      "INSERT INTO machine_payments(id,chain,tx,wallet,plan_id,amount_atomic,paid_at) VALUES(?,?,?,?,?,?,?)",
      randomUUID(),
      chain,
      normalized,
      wallet,
      planId,
      String(amount),
      paidAt,
    ),
    statement(
      "SELECT expires_at FROM machine_entitlements WHERE chain=? AND wallet=?",
      chain,
      wallet,
    ),
  ]);
  return {
    status: "unlocked",
    chain,
    wallet,
    plan: planId,
    expiresAt: results[1]!.results[0]!["expires_at"] as string,
    tx: normalized,
  };
}

export async function consumeUnits(
  kind: "account" | "wallet",
  tokenHash: string,
  cost: number,
  endpoint: string,
  chain: string,
): Promise<MeterResult | null> {
  if (!Number.isSafeInteger(cost) || cost < 0) throw new RangeError("Invalid usage cost");
  const id = randomUUID();
  const insert =
    kind === "account"
      ? statement(
          `INSERT INTO api_meter_requests(id,kind,user_id,key_id,endpoint,request_chain,cost,plan_id,quota,used,batch_limit,expires_at,allowed)
      SELECT ?,'account',k.user_id,k.id,?,?,?,a.plan_id,a.quota,
        a.used+CASE WHEN a.used+?<=a.quota THEN ? ELSE 0 END,
        CASE a.plan_id WHEN 'pro' THEN 10 WHEN 'scale' THEN 50 ELSE 0 END,a.expires_at,(?=0 OR a.used+?<=a.quota)
      FROM api_account_keys k JOIN api_accounts a ON a.user_id=k.user_id
      WHERE k.token_hash=? AND k.revoked_at IS NULL AND a.expires_at>?
      RETURNING plan_id,quota,used,max(quota-used,0) AS remaining,batch_limit,expires_at,allowed`,
          id,
          endpoint,
          chain,
          cost,
          cost,
          cost,
          cost,
          cost,
          tokenHash,
          now(),
        )
      : statement(
          `INSERT INTO api_meter_requests(id,kind,chain,wallet,endpoint,request_chain,cost,plan_id,quota,used,batch_limit,expires_at,allowed,period_start)
      SELECT ?,'wallet',chain,wallet,?,?,?,plan_id,quota,
        current_used+CASE WHEN current_used+?<=quota THEN ? ELSE 0 END,batch_limit,expires_at,
        (?=0 OR current_used+?<=quota),period_start
      FROM (SELECT e.chain,e.wallet,e.plan_id,e.expires_at,
        CASE e.plan_id WHEN 'builder' THEN 100000 WHEN 'pro' THEN 500000 WHEN 'scale' THEN 2000000 END AS quota,
        CASE e.plan_id WHEN 'pro' THEN 10 WHEN 'scale' THEN 50 ELSE 0 END AS batch_limit,
        CASE WHEN u.period_start>? THEN u.used ELSE 0 END AS current_used,
        CASE WHEN u.period_start>? THEN u.period_start ELSE ? END AS period_start
        FROM machine_api_keys k JOIN machine_entitlements e ON e.chain=k.chain AND e.wallet=k.wallet
        LEFT JOIN machine_api_usage u ON u.chain=e.chain AND u.wallet=e.wallet
        WHERE k.token_hash=? AND e.expires_at>?)
      RETURNING plan_id,quota,used,max(quota-used,0) AS remaining,batch_limit,expires_at,allowed`,
          id,
          endpoint,
          chain,
          cost,
          cost,
          cost,
          cost,
          cost,
          new Date(Date.now() - 30 * 86400_000).toISOString(),
          new Date(Date.now() - 30 * 86400_000).toISOString(),
          now(),
          tokenHash,
          now(),
        );
  const result = await appDatabase().batch([
    insert,
    statement("DELETE FROM api_meter_requests WHERE id=?", id),
  ]);
  const row = result[0]?.results[0];
  return row ? { ...(row as unknown as MeterResult), allowed: Boolean(row["allowed"]) } : null;
}
export async function hitRateLimit(bucket: string, limit: number, windowSeconds: number) {
  const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const row = await statement(
    `INSERT INTO api_rate_limits(bucket,window_start,hits) VALUES(?,?,1)
    ON CONFLICT(bucket) DO UPDATE SET
      hits=CASE WHEN api_rate_limits.window_start<=? THEN 1 ELSE api_rate_limits.hits+1 END,
      window_start=CASE WHEN api_rate_limits.window_start<=? THEN excluded.window_start ELSE api_rate_limits.window_start END
    RETURNING hits`,
    bucket,
    now(),
    cutoff,
    cutoff,
  ).first<{ hits: number }>();
  return Boolean(row && row.hits <= limit);
}
export async function conversation(userId: string) {
  const row = await statement(
    "SELECT messages FROM human_ai_conversations WHERE user_id=?",
    userId,
  ).first<{ messages: string }>();
  return row ? (JSON.parse(row.messages) as unknown[]) : [];
}
export async function saveConversation(
  userId: string,
  messages: unknown[],
  db: Database = appDatabase(),
) {
  await db
    .prepare(
      `INSERT INTO human_ai_conversations(user_id,messages,updated_at) VALUES(?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET messages=excluded.messages,updated_at=excluded.updated_at`,
    )
    .bind(userId, JSON.stringify(messages), now())
    .run();
}
export async function clearConversation(userId: string) {
  await statement("DELETE FROM human_ai_conversations WHERE user_id=?", userId).run();
}
