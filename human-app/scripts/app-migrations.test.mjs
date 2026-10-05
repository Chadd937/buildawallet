import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { applyAppMigrations, journalSql, migrationImport } from "./app-migrations.mjs";

const migrationDirectory = fileURLToPath(new URL("../migrations/", import.meta.url));
const migrationName = "baw_0001_app_data.sql";
function fixture(t) {
  const scratch = mkdtempSync(join(tmpdir(), "baw-import-"));
  const db = new DatabaseSync(":memory:");
  t.after(() => { db.close(); rmSync(scratch, { recursive: true, force: true }); });
  db.exec("CREATE TABLE human_sessions(token_hash TEXT PRIMARY KEY); INSERT INTO human_sessions VALUES('existing-session'); CREATE TABLE d1_migrations(name TEXT); INSERT INTO d1_migrations VALUES('original-login-migration');");
  const options = { database: "real-d1-uuid", configPath: "dist/server/wrangler.json", directory: migrationDirectory, importPath: join(scratch, "import.sql") };
  let imports = 0;
  const wrangler = (args, json) => {
    assert.deepEqual(args.slice(0, 7), ["d1", "execute", "real-d1-uuid", "--remote", "--config", "dist/server/wrangler.json", json ? "--json" : "--file"]);
    if (json) {
      assert.equal(args[7], "--command");
      return [{ results: db.prepare(args[8]).all() }];
    }
    assert.equal(args[7], options.importPath);
    imports++;
    // D1's file import is transactional; model its rollback boundary locally.
    db.exec("BEGIN");
    try { db.exec(readFileSync(args[7], "utf8")); db.exec("COMMIT"); }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  return { db, options, wrangler, scratch, imports: () => imports };
}

test("file import records the app migration once and preserves existing login data and journals", (t) => {
  const { db, options, wrangler, imports } = fixture(t);
  // A failed standard Wrangler migration can leave its empty journal behind.
  db.exec(journalSql);
  applyAppMigrations(wrangler, options);
  assert.equal(db.prepare("SELECT name FROM baw_app_migrations").get().name, migrationName);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger'").get().n, 7);
  assert.equal(db.prepare("SELECT token_hash FROM human_sessions").get().token_hash, "existing-session");
  assert.equal(db.prepare("SELECT name FROM d1_migrations").get().name, "original-login-migration");
  assert.equal(existsSync(options.importPath), false);
  applyAppMigrations(wrangler, options);
  assert.equal(imports(), 1);
});

test("a fresh journal is created together with the app schema", (t) => {
  const { db, options, wrangler } = fixture(t);
  applyAppMigrations(wrangler, options);
  assert.equal(db.prepare("SELECT name FROM baw_app_migrations").get().name, migrationName);
  assert.equal(db.prepare("SELECT count(*) AS n FROM human_sessions").get().n, 1);
});

test("failed import leaves no journal entry or partial app tables and stops deployment", (t) => {
  const { db, options, wrangler, scratch } = fixture(t);
  writeFileSync(join(scratch, migrationName), "CREATE TABLE partial_app_table(id TEXT); SELECT missing_column FROM missing_table;");
  options.directory = scratch;
  assert.throws(() => applyAppMigrations(wrangler, options), /missing_table/);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('partial_app_table','baw_app_migrations')").get().n, 0);
  assert.equal(db.prepare("SELECT token_hash FROM human_sessions").get().token_hash, "existing-session");
  assert.equal(existsSync(options.importPath), false);
});

test("an unrecorded import cannot pass migration verification", (t) => {
  const { options, wrangler } = fixture(t);
  const missingJournal = (args, json) => args.includes('SELECT name FROM "baw_app_migrations"') ? [{ results: [] }] : wrangler(args, json);
  assert.throws(() => applyAppMigrations(missingJournal, options), /journal verification failed/);
});

test("migration files use LF and only validated app migration names", (t) => {
  const { scratch } = fixture(t);
  writeFileSync(join(scratch, migrationName), "CREATE TABLE sample(id TEXT);\r\n");
  const bundle = migrationImport(scratch, []);
  assert.equal(bundle.sql.includes("\r"), false);
  assert.match(bundle.sql, /INSERT INTO "baw_app_migrations"/);
  writeFileSync(join(scratch, "unexpected.sql"), "SELECT 1;");
  assert.throws(() => migrationImport(scratch, []), /Unexpected/);
});
