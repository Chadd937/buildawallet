import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("inspection invokes only schema reads against actual database IDs", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "baw-inspect-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(
    join(directory, "npx"),
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (JSON.stringify(args) === JSON.stringify(['wrangler','d1','list','--json'])) {
  console.log(JSON.stringify([{name:'buildawallet',uuid:'actual-app-id'},{name:'buildawallet-production',uuid:'actual-login-id'},{name:'unrelated',uuid:'excluded-id'}]));
} else if (args[0]==='wrangler' && args[1]==='d1' && args[2]==='execute'
  && ['actual-app-id','actual-login-id'].includes(args[3])
  && args.includes('--remote') && args.includes('--json')
  && args.at(-1) === "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'") {
  console.log(JSON.stringify([{results:[{name:'human_sessions',sql:'CREATE TABLE human_sessions(token_hash TEXT,email_hash TEXT,expires_at INTEGER)'}]}]));
} else { process.exit(1); }
`,
    { mode: 0o755 },
  );
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./inspect-login.mjs", import.meta.url))],
    {
      encoding: "utf8",
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const inspected = JSON.parse(result.stdout);
  assert.deepEqual(
    inspected.map((db) => db.databaseId),
    ["actual-app-id", "actual-login-id"],
  );
  assert.deepEqual(inspected[1].tables, ["human_sessions"]);
  assert.equal(inspected[1].loginSchemas.length, 1);
});
