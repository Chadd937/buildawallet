import assert from "node:assert/strict";
import { test } from "node:test";
import { findLoginDatabase } from "./cloudflare-databases.mjs";

function readSchema(schemas) {
  return (args) => {
    assert.equal(args[0], "d1");
    assert.equal(args[1], "execute");
    const query = args.at(-1);
    assert.match(query, /^(SELECT name FROM sqlite_master|PRAGMA table_info)/);
    const schema = schemas[args[2]];
    const names = query.startsWith("SELECT")
      ? Object.keys(schema ?? {})
      : (schema?.[query.match(/table_info\((\w+)\)/)[1]] ?? []);
    return [{ results: names.map((name) => ({ name })) }];
  };
}
const original = {
  auth_sessions: ["token_hash", "email_hash", "expires_at"],
  auth_email_accounts: ["email_hash", "verified_at"],
};

test("discovers the original Login schema using metadata-only queries", () => {
  const db = { name: "buildawallet-auth", uuid: "test-auth-id" };
  assert.deepEqual(findLoginDatabase([db], undefined, readSchema({ [db.name]: original })), {
    db,
    prefix: "auth",
  });
});
test("uses an explicit existing Login database name", () => {
  const db = { name: "my-existing-login" };
  assert.deepEqual(findLoginDatabase([db], db.name, readSchema({ [db.name]: original })), {
    db,
    prefix: "auth",
  });
});
test("supports the original human email-login schema without confusing wallet sessions", () => {
  const db = { name: "buildawallet" };
  const schema = {
    human_sessions: ["token_hash", "email_hash", "expires_at"],
    human_email_accounts: ["email_hash", "verified_at"],
  };
  assert.equal(
    findLoginDatabase([db], undefined, readSchema({ [db.name]: schema })).prefix,
    "human",
  );
  schema.human_sessions = ["token_hash", "chain", "wallet", "expires_at"];
  assert.throws(
    () => findLoginDatabase([db], undefined, readSchema({ [db.name]: schema })),
    /Cannot identify/,
  );
});
test("stops on missing or ambiguous Login databases", () => {
  const dbs = [{ name: "buildawallet-auth" }, { name: "buildawallet-email-auth" }];
  assert.throws(() => findLoginDatabase(dbs, undefined, readSchema({})), /Cannot identify/);
  assert.throws(
    () =>
      findLoginDatabase(
        dbs,
        undefined,
        readSchema(Object.fromEntries(dbs.map((db) => [db.name, original]))),
      ),
    /Cannot identify/,
  );
});
