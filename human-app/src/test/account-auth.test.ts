// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, afterEach, expect, it } from "vitest";
import { accountFromRequest } from "@/integrations/auth/account.server";
import { withWorkerEnvironment, workerEnvironment } from "@/lib/db/context.server";
import { TestD1 } from "./d1-fixture";
let db: TestD1;
const token = "original-login-session-token-".padEnd(43, "a");
const hash = createHash("sha256").update(token).digest("hex");
const request = (headers: Record<string, string> = {}, method = "GET") =>
  new Request("https://buildawallet.xyz/api/human-ai", {
    method,
    headers: { cookie: `site_session=${token}`, ...headers },
  });
const account = (req = request()) =>
  withWorkerEnvironment({ AUTH_DB: db }, () => accountFromRequest(req));
beforeEach(() => {
  db = new TestD1();
  // Schema and epoch-seconds contract from Chadd937/cloudflare-email-auth.
  db.sqlite.exec(
    "CREATE TABLE auth_email_accounts(email_hash TEXT PRIMARY KEY,created_at INTEGER,verified_at INTEGER,last_seen_at INTEGER); CREATE TABLE auth_sessions(token_hash TEXT PRIMARY KEY,email_hash TEXT,created_at INTEGER,expires_at INTEGER,last_seen_at INTEGER);",
  );
  db.sqlite.prepare("INSERT INTO auth_email_accounts VALUES('email-hash',1,1,1)").run();
  db.sqlite
    .prepare("INSERT INTO auth_sessions VALUES(?,'email-hash',1,?,1)")
    .run(hash, Math.floor(Date.now() / 1000) + 3600);
});
afterEach(() => db.close());
it("accepts the original Login cookie and uses its stable account identity", async () => {
  await expect(account()).resolves.toEqual({ userId: "email-hash" });
});
it("rejects expired, revoked and unverified sessions", async () => {
  db.sqlite.exec("UPDATE auth_sessions SET expires_at=1");
  await expect(account()).rejects.toThrow("expired");
  db.sqlite
    .prepare("UPDATE auth_sessions SET expires_at=?")
    .run(Math.floor(Date.now() / 1000) + 3600);
  db.sqlite.exec("UPDATE auth_email_accounts SET verified_at=0");
  await expect(account()).rejects.toThrow();
  db.sqlite.exec("DELETE FROM auth_sessions");
  await expect(account()).rejects.toThrow();
});
it("does not trust browser account flags or unrelated bearer credentials", async () => {
  await expect(
    account(
      request({ cookie: "authenticated=true; verified=true", authorization: "Bearer invented" }),
    ),
  ).rejects.toThrow();
});
it("honors the configured original cookie name", async () => {
  await expect(
    withWorkerEnvironment({ AUTH_DB: db, AUTH_COOKIE_NAME: "baw_session" }, () =>
      accountFromRequest(request({ cookie: `baw_session=${token}` })),
    ),
  ).resolves.toEqual({ userId: "email-hash" });
});
it("validates the production HUMAN schema and baw_human_session cookie", async () => {
  db.sqlite.exec(
    "CREATE TABLE human_email_accounts(email_hash TEXT PRIMARY KEY,created_at INTEGER NOT NULL,verified_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL); CREATE TABLE human_sessions(token_hash TEXT PRIMARY KEY,email_hash TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL);",
  );
  db.sqlite.prepare("INSERT INTO human_email_accounts VALUES('human-email-hash',1,1,1)").run();
  db.sqlite.prepare("INSERT INTO human_sessions VALUES(?,'human-email-hash',1,?,1)")
    .run(hash, Math.floor(Date.now() / 1000) + 3600);
  const humanAccount = () => withWorkerEnvironment(
    { AUTH_DB: db, AUTH_TABLE_PREFIX: "human", AUTH_COOKIE_NAME: "baw_human_session" },
    () => accountFromRequest(request({ cookie: `baw_human_session=${token}` })),
  );
  await expect(humanAccount()).resolves.toEqual({ userId: "human-email-hash" });
  db.sqlite.exec("DELETE FROM human_sessions");
  await expect(humanAccount()).rejects.toThrow("expired");
});
it("rejects cross-site writes and accepts same-origin writes", async () => {
  await expect(account(request({ origin: "https://other.example" }, "POST"))).rejects.toThrow(
    "same-origin",
  );
  await expect(account(request({}, "DELETE"))).rejects.toThrow("same-origin");
  await expect(account(request({ origin: "https://buildawallet.xyz" }, "POST"))).resolves.toEqual({
    userId: "email-hash",
  });
});
it("isolates Worker bindings between asynchronous requests", async () => {
  const values = await Promise.all(
    ["first", "second"].map((name) =>
      withWorkerEnvironment({ AUTH_COOKIE_NAME: name }, async () => {
        await Promise.resolve();
        return workerEnvironment().AUTH_COOKIE_NAME;
      }),
    ),
  );
  expect(values).toEqual(["first", "second"]);
});
