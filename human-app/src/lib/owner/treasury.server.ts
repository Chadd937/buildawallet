import { appDatabase } from "@/lib/db/context.server";
import { BASE_COLLECTOR, SOLANA_COLLECTOR } from "@/lib/machine/config";
import { readWallet, readStablecoin } from "@/lib/machine/data.server";
import type { CollectorBalance, TreasuryChain, TreasurySnapshot } from "./types";

export const collectors = { base: BASE_COLLECTOR, solana: SOLANA_COLLECTOR } as const;

async function collectorBalance(chain: TreasuryChain): Promise<CollectorBalance> {
  const address = collectors[chain];
  const result = await Promise.allSettled([
    readWallet(chain, address),
    readStablecoin(chain, address),
  ]);
  return {
    chain,
    address,
    nativeSymbol: chain === "base" ? "ETH" : "SOL",
    nativeDecimals: chain === "base" ? 18 : 9,
    nativeAtomic: result[0].status === "fulfilled" ? result[0].value.balanceAtomic : null,
    usdcAtomic: result[1].status === "fulfilled" ? result[1].value.balanceAtomic : null,
    error: result.some((item) => item.status === "rejected")
      ? "A balance read is unavailable. Refresh to retry."
      : null,
    explorer:
      chain === "base"
        ? `https://basescan.org/address/${address}`
        : `https://solscan.io/account/${address}`,
  };
}

export async function treasuryLedger(): Promise<TreasurySnapshot["ledger"]> {
  const db = appDatabase();
  const existing = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('api_account_payments','machine_payments','human_payments','treasury_x402_receipts')",
    )
    .all<{ name: string }>();
  const tables = new Set(existing.results.map((row) => row.name));
  const queries = [
    tables.has("api_account_payments") &&
      "SELECT 'Account subscription' AS source,chain,tx,payer,plan_id AS plan,amount_atomic AS amountAtomic,paid_at AS paidAt FROM api_account_payments",
    tables.has("machine_payments") &&
      "SELECT 'Agent subscription' AS source,chain,tx,wallet AS payer,plan_id AS plan,amount_atomic AS amountAtomic,paid_at AS paidAt FROM machine_payments",
    tables.has("human_payments") &&
      "SELECT 'Legacy subscription' AS source,chain,tx,wallet AS payer,NULL AS plan,amount_atomic AS amountAtomic,strftime('%Y-%m-%dT%H:%M:%fZ',paid_at,'unixepoch') AS paidAt FROM human_payments",
    tables.has("treasury_x402_receipts") &&
      "SELECT 'Agent pay per call' AS source,chain,tx,payer,NULL AS plan,amount_atomic AS amountAtomic,paid_at AS paidAt FROM treasury_x402_receipts",
  ]
    .filter(Boolean)
    .join(" UNION ALL ");
  if (!queries)
    return {
      receipts: [],
      totals: [],
      error: "Payment tables are unavailable. Apply the app migrations.",
    };
  const combined = `WITH receipts AS (${queries}) `;
  const rows = await db.batch([
    db.prepare(
      combined +
        "SELECT * FROM receipts WHERE chain IN ('base','solana') ORDER BY paidAt DESC,tx LIMIT 100",
    ),
    db.prepare(
      combined +
        "SELECT source,chain,count(*) AS count,CAST(sum(CAST(amountAtomic AS INTEGER)) AS TEXT) AS amountAtomic FROM receipts WHERE chain IN ('base','solana') GROUP BY source,chain",
    ),
  ]);
  return {
    receipts: rows[0]!.results as unknown as TreasurySnapshot["ledger"]["receipts"],
    totals: rows[1]!.results as unknown as TreasurySnapshot["ledger"]["totals"],
    error: null,
  };
}

export async function treasurySnapshot(): Promise<TreasurySnapshot> {
  const [base, solana, ledger] = await Promise.all([
    collectorBalance("base"),
    collectorBalance("solana"),
    treasuryLedger().catch(() => ({
      receipts: [],
      totals: [],
      error: "Payment history is unavailable. Refresh after verifying the app migrations.",
    })),
  ]);
  return { observedAt: new Date().toISOString(), collectors: [base, solana], ledger };
}
