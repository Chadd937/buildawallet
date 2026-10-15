#!/usr/bin/env node
/**
 * READ ONLY production D1 billing inventory. Prints aggregate counts only.
 * Requires Wrangler account auth. Never prints users, wallets, API keys or txs.
 * Run in human-app before deploying migration or changing canonical billing.
 */
import { execFileSync } from "node:child_process";
const queries = [
  ["Legacy active subscriptions", `SELECT plan_id,COUNT(*) AS count
       FROM human_entitlements WHERE expires_at > unixepoch()
       GROUP BY plan_id ORDER BY plan_id`],
  ["Legacy API keys", `SELECT 'active_keys' AS status,COUNT(*) AS count
       FROM human_api_keys k JOIN human_entitlements e ON e.chain=k.chain AND e.wallet=k.wallet
       WHERE e.expires_at > unixepoch()`],
  ["New wallet subscriptions", `SELECT plan_id,COUNT(*) AS count
       FROM machine_entitlements WHERE expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
       GROUP BY plan_id ORDER BY plan_id`],
  ["New email account subscriptions", `SELECT plan_id,COUNT(*) AS count
       FROM api_accounts WHERE expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
       GROUP BY plan_id ORDER BY plan_id`],
  ["Pending agent quotes", `SELECT chain,plan_id,amount_atomic,COUNT(*) AS count
       FROM machine_access_quotes WHERE consumed_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
       GROUP BY chain,plan_id,amount_atomic ORDER BY chain,plan_id`],
  ["Pending dashboard quotes", `SELECT chain,plan_id,asset,decimals,amount_atomic,COUNT(*) AS count
       FROM api_checkout_quotes WHERE consumed_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
       GROUP BY chain,plan_id,asset,decimals,amount_atomic ORDER BY chain,plan_id`],
];
console.log("BuildAWallet production D1 billing inventory (read-only aggregates, no identities)");
for (const [title,sql] of queries) {
  console.log("\n=== "+title+" ===");
  try {
    const raw=execFileSync("npx",[
      "wrangler","d1","execute","buildawallet","--remote",
      "--config","wrangler.jsonc","--json","--command",sql
    ],{cwd:new URL("../",import.meta.url),encoding:"utf8",timeout:45_000});
    const data=JSON.parse(raw);
    console.log(JSON.stringify(data.flatMap(x=>x.results??[]),null,2));
  } catch(error) {
    console.error("Audit stopped: DB schema/permissions may need attention.");
    if(error?.stderr) console.error(String(error.stderr).slice(0,200));
    process.exitCode=1;
    break;
  }
}
console.log("\nNo database writes, payments or migrations were requested.");
