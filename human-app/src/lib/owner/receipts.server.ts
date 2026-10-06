import { appDatabase } from "@/lib/db/context.server";
import {
  BASE_COLLECTOR,
  BASE_MAINNET,
  BASE_USDC,
  SOLANA_COLLECTOR,
  SOLANA_MAINNET,
  SOLANA_USDC,
} from "@/lib/machine/config";

/** Called only with a successful facilitator result, never with caller-provided receipts. */
export async function recordX402Receipt(
  settlement: { success: boolean; transaction?: string; network?: string; payer?: string },
  requirements: { network: string; payTo: string; asset: string; amount: string },
) {
  if (
    !settlement.success ||
    requirements.amount !== "10000" ||
    settlement.network !== requirements.network
  )
    return false;
  const chain =
    requirements.network === BASE_MAINNET
      ? "base"
      : requirements.network === SOLANA_MAINNET
        ? "solana"
        : null;
  if (!chain || !settlement.transaction) return false;
  if (
    chain === "base"
      ? requirements.payTo.toLowerCase() !== BASE_COLLECTOR.toLowerCase() ||
        requirements.asset.toLowerCase() !== BASE_USDC.toLowerCase() ||
        !/^0x[a-f0-9]{64}$/i.test(settlement.transaction)
      : requirements.payTo !== SOLANA_COLLECTOR ||
        requirements.asset !== SOLANA_USDC ||
        !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(settlement.transaction)
  )
    return false;
  const tx = chain === "base" ? settlement.transaction.toLowerCase() : settlement.transaction;
  await appDatabase()
    .prepare(
      "INSERT OR IGNORE INTO treasury_x402_receipts(chain,tx,payer,amount_atomic) VALUES(?,?,?,?)",
    )
    .bind(chain, tx, settlement.payer ?? null, requirements.amount)
    .run();
  return true;
}
