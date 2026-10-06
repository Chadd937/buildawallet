// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TestD1 } from "./d1-fixture";
import { withWorkerEnvironment } from "@/lib/db/context.server";
import { handleOwnerRequest } from "@/lib/owner/http.server";
import { recordX402Receipt } from "@/lib/owner/receipts.server";
import { treasuryLedger } from "@/lib/owner/treasury.server";
import { BASE_MAINNET, BASE_COLLECTOR, BASE_USDC } from "@/lib/machine/config";

vi.mock("@/lib/machine/data.server", () => ({
  readWallet: vi.fn(async () => ({ balanceAtomic: "9000" })),
  readStablecoin: vi.fn(async () => ({ balanceAtomic: "12000000" })),
  readTransaction: vi.fn(),
}));
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const owner = hash("owner@example.test");
const other = hash("other@example.test");
const ownerToken = "owner-session-".padEnd(43, "a");
const otherToken = "other-session-".padEnd(43, "b");
let db: TestD1;
const request = (
  path = "/owner",
  token = ownerToken,
  method = "GET",
  headers: Record<string, string> = {},
) =>
  new Request("https://buildawallet.xyz" + path, {
    method,
    headers: { cookie: `baw_human_session=${token}`, ...headers },
  });
const env = () => ({
  DB: db,
  AUTH_DB: db,
  AUTH_TABLE_PREFIX: "human",
  AUTH_COOKIE_NAME: "baw_human_session",
  OWNER_EMAIL_HASH: owner,
});
const handle = (req = request()) => withWorkerEnvironment(env(), () => handleOwnerRequest(req));
beforeEach(() => {
  db = new TestD1();
  db.sqlite.exec(readFileSync("migrations/baw_0001_app_data.sql", "utf8"));
  db.sqlite.exec(readFileSync("migrations/baw_0002_treasury_receipts.sql", "utf8"));
  db.sqlite.exec(readFileSync("migrations/baw_0003_prepaid_plans.sql", "utf8"));
  db.sqlite.exec(
    "CREATE TABLE human_email_accounts(email_hash TEXT PRIMARY KEY, verified_at INTEGER); CREATE TABLE human_sessions(token_hash TEXT PRIMARY KEY,email_hash TEXT,expires_at INTEGER);",
  );
  for (const [identity, token] of [
    [owner, ownerToken],
    [other, otherToken],
  ]) {
    db.sqlite.prepare("INSERT INTO human_email_accounts VALUES(?,1)").run(identity!);
    db.sqlite
      .prepare("INSERT INTO human_sessions VALUES(?,?,?)")
      .run(hash(token!), identity!, Math.floor(Date.now() / 1000) + 3600);
  }
});
afterEach(() => db.close());

it("fails closed without owner configuration, and rejects normal accounts and agent bearer keys", async () => {
  expect(
    (
      await withWorkerEnvironment({ ...env(), OWNER_EMAIL_HASH: "" }, () =>
        handleOwnerRequest(request()),
      )
    )?.status,
  ).toBe(404);
  expect((await handle(request("/owner/treasury", otherToken)))?.status).toBe(404);
  const agent = new Request("https://buildawallet.xyz/owner/treasury", {
    headers: { authorization: "Bearer baw_live_example" },
  });
  expect((await handle(agent))?.status).toBe(404);
});
it("checks expiration, verification and revocation on every owner request", async () => {
  expect(await handle()).toBeNull();
  db.sqlite.prepare("UPDATE human_sessions SET expires_at=1 WHERE email_hash=?").run(owner);
  expect((await handle())?.status).toBe(404);
  db.sqlite
    .prepare("UPDATE human_sessions SET expires_at=? WHERE email_hash=?")
    .run(Math.floor(Date.now() / 1000) + 3600, owner);
  db.sqlite.prepare("UPDATE human_email_accounts SET verified_at=0 WHERE email_hash=?").run(owner);
  expect((await handle())?.status).toBe(404);
  db.sqlite.prepare("UPDATE human_email_accounts SET verified_at=1 WHERE email_hash=?").run(owner);
  db.sqlite.prepare("DELETE FROM human_sessions WHERE email_hash=?").run(owner);
  expect((await handle())?.status).toBe(404);
});
it("does not expose a write route to a cross-site or originless owner session", async () => {
  for (const headers of [{}, { origin: "https://evil.example" }])
    expect(
      (await handle(request("/owner/withdrawal/prepare", ownerToken, "POST", headers)))?.status,
    ).toBe(404);
  expect(
    (await handle(request("/owner/access", ownerToken, "GET", { "sec-fetch-site": "cross-site" })))
      ?.status,
  ).toBe(404);
});
it("returns private non-indexable responses, without CORS or owner identifiers", async () => {
  for (const token of [ownerToken, otherToken]) {
    const response = (await handle(request("/owner/access", token)))!;
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(await response.text()).not.toContain(owner);
  }
  expect((await handle(request("/owner/treasury")))?.status).toBe(200);
});
it("records only settled exact fees to the configured collectors and deduplicates a transaction", async () => {
  const tx = "0x" + "a".repeat(64);
  const settlement = { success: true, network: BASE_MAINNET, transaction: tx, payer: "0xpayer" };
  const requirements = {
    network: BASE_MAINNET,
    payTo: BASE_COLLECTOR,
    asset: BASE_USDC,
    amount: "10000",
  };
  const run = <T>(fn: () => T) => withWorkerEnvironment(env(), fn);
  expect(await run(() => recordX402Receipt({ ...settlement, success: false }, requirements))).toBe(
    false,
  );
  expect(
    await run(() => recordX402Receipt(settlement, { ...requirements, payTo: "0xwrong" })),
  ).toBe(false);
  expect(
    await run(() => recordX402Receipt(settlement, { ...requirements, amount: "1000000" })),
  ).toBe(false);
  expect(
    await run(() => recordX402Receipt({ ...settlement, network: "wrong" }, requirements)),
  ).toBe(false);
  expect(await run(() => recordX402Receipt(settlement, requirements))).toBe(true);
  expect(await run(() => recordX402Receipt(settlement, requirements))).toBe(true);
  const ledger = await run(treasuryLedger);
  expect(ledger.receipts).toHaveLength(1);
  expect(ledger.totals).toEqual([
    { source: "Historical pay per call", chain: "base", count: 1, amountAtomic: "10000" },
  ]);
});
it("retains legacy subscription receipts and exact atomic totals above JS integer precision", async () => {
  db.sqlite.exec(
    "CREATE TABLE human_payments(chain TEXT,tx TEXT,wallet TEXT,amount_atomic TEXT,paid_at INTEGER)",
  );
  db.sqlite
    .prepare("INSERT INTO human_payments VALUES('base','legacy','payer',?,1700000000)")
    .run("9007199254740993");
  const ledger = await withWorkerEnvironment(env(), treasuryLedger);
  expect(ledger.totals[0]?.amountAtomic).toBe("9007199254740993");
  expect(ledger.receipts[0]?.paidAt).toBe("2023-11-14T22:13:20.000Z");
});
