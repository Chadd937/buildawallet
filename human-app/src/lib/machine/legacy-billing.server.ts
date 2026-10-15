import { appDatabase } from "@/lib/db/context.server";

// Legacy agent-pay keys remain usable for their ORIGINAL allowances and expiry.
// Read and debit the exact human_api_usage table still used by agent-pay, so a
// key cannot double-spend separate quota counters by switching API versions.
const LEGACY_ALLOWANCES: Record<string, { quota: number; batchLimit: number }> = {
  builder: { quota: 500, batchLimit: 0 },
  pro: { quota: 5_000, batchLimit: 10 },
  scale: { quota: 25_000, batchLimit: 50 },
};
const PERIOD_SECONDS = 30 * 24 * 60 * 60;

export function legacyAllowance(planId: string) {
  return LEGACY_ALLOWANCES[planId] ?? null;
}

export async function consumeLegacyKey(
  tokenHash: string,
  cost: number,
): Promise<{
  plan_id: string;
  quota: number;
  used: number;
  remaining: number;
  batch_limit: number;
  expires_at: string;
  allowed: boolean;
} | null> {
  if (!Number.isSafeInteger(cost) || cost < 0) throw new RangeError("Invalid usage cost");
  const db = appDatabase();
  const timestamp = Math.floor(Date.now() / 1000);
  const legacy = await db.prepare(
    `SELECT k.chain,k.wallet,e.plan_id,e.expires_at
     FROM human_api_keys k JOIN human_entitlements e
       ON e.chain=k.chain AND e.wallet=k.wallet
     WHERE k.token_hash=? AND e.expires_at>?`
  ).bind(tokenHash, timestamp).first<{
    chain: string; wallet: string; plan_id: string; expires_at: number;
  }>();
  if (!legacy) return null;
  const allowance = legacyAllowance(legacy.plan_id);
  if (!allowance) return null;

  // Only a newly expired 30-day usage period may be reset; an existing active
  // period is never overwritten by the newer nine-chain service.
  await db.prepare(
    `INSERT INTO human_api_usage(chain,wallet,period_start,used)
     VALUES(?,?,?,0)
     ON CONFLICT(chain,wallet) DO UPDATE SET
       period_start=excluded.period_start,used=0
     WHERE human_api_usage.period_start+?<=?`
  ).bind(legacy.chain,legacy.wallet,timestamp,PERIOD_SECONDS,timestamp).run();

  // This update and agent-pay's consume() use the SAME guarded SQL counter.
  // One writer can consume each unit; concurrent requests cannot exceed quota.
  const update = await db.prepare(
    `UPDATE human_api_usage SET used=used+?
     WHERE chain=? AND wallet=? AND used+?<=?
     RETURNING used`
  ).bind(cost,legacy.chain,legacy.wallet,cost,allowance.quota).first<{ used: number }>();
  const row = update ?? await db.prepare(
    "SELECT used FROM human_api_usage WHERE chain=? AND wallet=?"
  ).bind(legacy.chain,legacy.wallet).first<{ used: number }>();
  if (!row) throw new Error("Legacy usage counter unavailable");
  return {
    plan_id: legacy.plan_id,
    quota: allowance.quota,
    used: row.used,
    remaining: Math.max(0,allowance.quota-row.used),
    batch_limit: allowance.batchLimit,
    expires_at: new Date(legacy.expires_at * 1000).toISOString(),
    allowed: Boolean(update),
  };
}
