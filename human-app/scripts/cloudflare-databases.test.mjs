import assert from "node:assert/strict";
import { test } from "node:test";
import { findLoginDatabase, databaseId, loginCookieName } from "./cloudflare-databases.mjs";

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
  assert.deepEqual(findLoginDatabase([db], undefined, readSchema({ [db.uuid]: original })), {
    db,
    prefix: "auth",
  });
});
test("uses an explicit existing Login database name", () => {
  const db = { name: "my-existing-login", uuid: "existing-login-id" };
  assert.deepEqual(findLoginDatabase([db], db.name, readSchema({ [db.uuid]: original })), {
    db,
    prefix: "auth",
  });
});
test("supports the original human email-login schema without confusing wallet sessions", () => {
  const db = { name: "buildawallet", uuid: "legacy-login-id" };
  const schema = {
    human_sessions: ["token_hash", "email_hash", "expires_at"],
    human_email_accounts: ["email_hash", "verified_at"],
  };
  assert.equal(
    findLoginDatabase([db], undefined, readSchema({ [db.uuid]: schema })).prefix,
    "human",
  );
  schema.human_sessions = ["token_hash", "chain", "wallet", "expires_at"];
  assert.throws(
    () => findLoginDatabase([db], undefined, readSchema({ [db.uuid]: schema })),
    /Cannot identify/,
  );
});
test("stops on missing or ambiguous Login databases", () => {
  const dbs = [
    { name: "buildawallet-auth", uuid: "first-id" },
    { name: "buildawallet-email-auth", uuid: "second-id" },
  ];
  assert.throws(() => findLoginDatabase(dbs, undefined, readSchema({})), /Cannot identify/);
  assert.throws(
    () =>
      findLoginDatabase(
        dbs,
        undefined,
        readSchema(Object.fromEntries(dbs.map((db) => [db.uuid, original]))),
      ),
    /Cannot identify/,
  );
});

test("uses real IDs and discovers the observed production database", () => {
  const db = { name: "buildawallet-production", uuid: "edd1c3e4-2c89-4910-9a01-a7360334afe5" };
  assert.equal(databaseId(db), db.uuid);
  assert.throws(() => databaseId({ name: "missing" }), /Missing Cloudflare D1 ID/);
  assert.equal(
    findLoginDatabase([db], undefined, readSchema({ [db.uuid]: original })).db.uuid,
    db.uuid,
  );
});

test("matches each original Login cookie contract and honors explicit overrides", () => {
  assert.equal(
    loginCookieName("human", { AUTH_COOKIE_NAME: "site_session" }, {}),
    "baw_human_session",
  );
  assert.equal(loginCookieName("auth", {}, {}), "site_session");
  assert.equal(
    loginCookieName("auth", { AUTH_COOKIE_NAME: "custom" }, { AUTH_COOKIE_NAME: "custom" }),
    "custom",
  );
  assert.throws(
    () => loginCookieName("human", { AUTH_COOKIE_NAME: "" }, { AUTH_COOKIE_NAME: "" }),
    /must not be empty/,
  );
});
