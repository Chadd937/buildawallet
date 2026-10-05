import { spawnSync } from "node:child_process";
import { databaseId } from "./cloudflare-databases.mjs";

function query(args) {
  const result = spawnSync("npx", ["wrangler", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (result.status !== 0) throw new Error("Cloudflare schema inspection failed");
  return JSON.parse(result.stdout);
}
const databases = query(["d1", "list", "--json"]).filter((db) =>
  db.name.startsWith("buildawallet"),
);
if (!databases.length) throw new Error("No BuildAWallet D1 databases were found in this account");
const result = [];
for (const db of databases) {
  // Address the actual account database ID, bypassing any placeholder config binding.
  // Only schema metadata is read. No account, email, session or payment rows are queried.
  const schema = query([
    "d1",
    "execute",
    databaseId(db),
    "--remote",
    "--json",
    "--command",
    "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  ]).flatMap((item) => item.results ?? []);
  result.push({
    database: db.name,
    databaseId: databaseId(db),
    tables: schema.map((row) => row.name),
    loginSchemas: schema.filter((row) =>
      ["auth_sessions", "auth_email_accounts", "human_sessions", "human_email_accounts"].includes(
        row.name,
      ),
    ),
  });
}
console.log(JSON.stringify(result, null, 2));
