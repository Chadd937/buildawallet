import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Match Wrangler's journal so the existing application migration history remains usable.
export const journalSql = `CREATE TABLE IF NOT EXISTS "baw_app_migrations" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);`;

export function migrationImport(directory, applied) {
  const names = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
  if (names.some((name) => !/^baw_\d{4}_[a-z0-9_]+\.sql$/.test(name)))
    throw new Error("Unexpected application migration filename. Deployment stopped.");
  const pending = names.filter((name) => !applied.includes(name));
  if (!pending.length) return null;
  const sql = [journalSql, ...pending.map((name) => {
    const source = readFileSync(join(directory, name), "utf8").replace(/\r\n?/g, "\n");
    return `${source}\nINSERT INTO "baw_app_migrations" (name) VALUES ('${name}');`;
  })].join("\n");
  return { pending, sql };
}

export function applyAppMigrations(wrangler, { database, configPath, directory, importPath }) {
  const query = (sql) => wrangler([
    "d1", "execute", database, "--remote", "--config", configPath,
    "--json", "--command", sql,
  ], true).flatMap((item) => item.results ?? []);
  const journalExists = query("SELECT name FROM sqlite_master WHERE type='table' AND name='baw_app_migrations'").length > 0;
  const applied = journalExists ? query('SELECT name FROM "baw_app_migrations"').map((row) => row.name) : [];
  const bundle = migrationImport(directory, applied);
  if (!bundle) {
    console.log("Application D1 migrations are already applied.");
    return;
  }
  console.log(`Applying additive app migrations through D1 SQL-file import: ${bundle.pending.join(", ")}`);
  writeFileSync(importPath, bundle.sql);
  try {
    // --file uses D1's import parser, avoiding the /query trigger splitter.
    // The journal entries are part of the same import as the schema changes.
    wrangler(["d1", "execute", database, "--remote", "--config", configPath, "--file", importPath]);
  } finally {
    rmSync(importPath, { force: true });
  }
  const completed = query('SELECT name FROM "baw_app_migrations"').map((row) => row.name);
  if (bundle.pending.some((name) => !completed.includes(name)))
    throw new Error("Application migration journal verification failed. Deployment stopped.");
}
