import { findLoginDatabase, databaseId, loginCookieName } from "./cloudflare-databases.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadDeploymentConfig, prepareDeploymentConfig } from "./deployment-config.mjs";

function wrangler(args, json = false) {
  const result = spawnSync("npx", ["wrangler", ...args], {
    encoding: "utf8",
    stdio: json ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (result.status !== 0) throw new Error("Cloudflare command failed. Deployment stopped.");
  return json ? JSON.parse(result.stdout) : null;
}
const { config, values, overrides } = loadDeploymentConfig();
let databases = wrangler(["d1", "list", "--json"], true);
const authName = values.AUTH_DATABASE_NAME;
const auth = findLoginDatabase(databases, authName, wrangler);
const appName = values.APP_DATABASE_NAME || "buildawallet";
if (!databases.some((db) => db.name === appName)) {
  wrangler(["d1", "create", appName]);
  databases = wrangler(["d1", "list", "--json"], true);
}
const appMatches = databases.filter((db) => db.name === appName);
if (appMatches.length !== 1) throw new Error("Cannot identify one application D1 database");
const path = "dist/server/wrangler.json";
const built = prepareDeploymentConfig(JSON.parse(readFileSync(path, "utf8")), config, values);
built.vars.AUTH_TABLE_PREFIX = auth.prefix;
built.vars.AUTH_COOKIE_NAME = loginCookieName(auth.prefix, values, overrides);
built.d1_databases = [
  {
    binding: "DB",
    database_name: appName,
    database_id: databaseId(appMatches[0]),
    migrations_dir: fileURLToPath(new URL("../migrations/", import.meta.url)),
    migrations_table: "baw_app_migrations",
  },
  { binding: "AUTH_DB", database_name: auth.db.name, database_id: databaseId(auth.db) },
];
writeFileSync(path, JSON.stringify(built, null, 2));
console.log(
  `Using existing Login D1 ${auth.db.name} (${auth.prefix} tables) and app D1 ${appName}. Cookie name: ${built.vars.AUTH_COOKIE_NAME}.`,
);
wrangler(["d1", "migrations", "apply", appName, "--remote", "--config", path]);
const expected = [
  "machine_challenges",
  "machine_sessions",
  "machine_entitlements",
  "machine_api_keys",
  "machine_api_usage",
  "machine_payments",
  "api_accounts",
  "api_account_keys",
  "api_usage_events",
  "api_checkout_quotes",
  "api_account_payments",
  "api_payment_redemptions",
  "api_meter_requests",
  "api_rate_limits",
  "human_ai_conversations",
  "account_payment_validate",
  "account_payment_activate",
  "machine_payment_reserve",
  "machine_payment_activate",
  "account_meter",
  "wallet_meter",
  "account_key_limit",
];
const schema = wrangler(
  [
    "d1",
    "execute",
    appName,
    "--remote",
    "--config",
    path,
    "--json",
    "--command",
    "SELECT name FROM sqlite_master",
  ],
  true,
)
  .flatMap((item) => item.results ?? [])
  .map((row) => row.name);
if (expected.some((name) => !schema.includes(name)))
  throw new Error("Application D1 readiness failed. Deployment stopped.");
console.log("Login schema and application D1 readiness checks passed.");
