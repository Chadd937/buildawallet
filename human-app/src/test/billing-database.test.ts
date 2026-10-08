// @vitest-environment node
import { readFileSync } from "node:fs";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { TestD1 } from "./d1-fixture";
import { withWorkerEnvironment } from "@/lib/db/context.server";
import {
  accountOverview,
  activateCheckout,
  activateWalletPayment,
  claimWelcomeUnits,
  consumeUnits,
  hitRateLimit,
  storeAccountKey,
  revokeStoredAccountKey,
  storeCheckoutQuote,
  conversation,
  saveConversation,
  clearConversation,
} from "@/lib/db/storage.server";
import { PLANS } from "@/lib/machine/config";
import { createSession, issueChallenge, sha256 } from "@/lib/machine/billing.server";
let db: TestD1;
const user = "login-account-hash";
const run = <T>(fn: () => T) => withWorkerEnvironment({ DB: db }, fn);
const quote = (owner = user) => run(() => storeCheckoutQuote(owner, "builder", "base", "0xabc"));
const activate = (id: string, tx: string, owner = user) =>
  run(() => activateCheckout(owner, id, tx, new Date().toISOString()));
beforeEach(() => {
  db = new TestD1();
  db.sqlite.exec(readFileSync("migrations/baw_0001_app_data.sql", "utf8"));
  db.sqlite.exec(readFileSync("migrations/baw_0003_prepaid_plans.sql", "utf8"));
  db.sqlite.exec(readFileSync("migrations/baw_0005_agent_accounts.sql", "utf8"));
  db.sqlite.exec(readFileSync("migrations/baw_0006_multichain_payments.sql", "utf8"));
});
afterEach(() => db.close());

describe("D1 payment and quota database", () => {
  it("activates a checkout once and prevents normalized cross-flow receipt reuse", async () => {
    const q = await quote();
    const result = await activate(q.id, "0xPAYMENT1");
    expect(result.units).toBe(100_000);
    await expect(activate(q.id, "0xPAYMENT1")).rejects.toThrow();
    await expect(
      run(() =>
        activateWalletPayment(
          "base",
          "0xpayer",
          "builder",
          "0xpayment1",
          new Date().toISOString(),
          PLANS.builder.amountAtomic,
        ),
      ),
    ).rejects.toThrow();
    expect(
      db.sqlite.prepare("SELECT count(*) AS n FROM api_payment_redemptions").get(),
    ).toMatchObject({ n: 1 });
  });
  it("rolls back the receipt and quote on activation failure, allowing a retry", async () => {
    const q = await quote();
    db.sqlite.exec(
      "CREATE TRIGGER fail_activation BEFORE INSERT ON api_accounts BEGIN SELECT RAISE(ABORT,'test outage'); END;",
    );
    await expect(activate(q.id, "0xpayment2")).rejects.toThrow("test outage");
    expect(
      db.sqlite.prepare("SELECT count(*) AS n FROM api_payment_redemptions").get(),
    ).toMatchObject({ n: 0 });
    expect(
      db.sqlite.prepare("SELECT consumed_at FROM api_checkout_quotes WHERE id=?").get(q.id),
    ).toMatchObject({ consumed_at: null });
    db.sqlite.exec("DROP TRIGGER fail_activation");
    await activate(q.id, "0xpayment2");
  });
  it("does not activate another account's quote or an expired quote", async () => {
    const q = await quote();
    await expect(activate(q.id, "0xwrong", "other-login-account")).rejects.toThrow();
    db.sqlite
      .prepare("UPDATE api_checkout_quotes SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?")
      .run(q.id);
    await expect(activate(q.id, "0xexpired")).rejects.toThrow();
    expect(
      db.sqlite.prepare("SELECT count(*) AS n FROM api_payment_redemptions").get(),
    ).toMatchObject({ n: 0 });
  });
  it("carries unused account units into a renewed plan", async () => {
    const q = await quote();
    const first = await activate(q.id, "0xfirst");
    db.sqlite.prepare("UPDATE api_accounts SET used=100 WHERE user_id=?").run(user);
    const second = await activate((await quote()).id, "0xsecond");
    expect(second.units).toBe(199_900);
    expect(new Date(second.expiresAt).getTime() - new Date(first.expiresAt).getTime()).toBe(
      30 * 86400_000,
    );
  });
  it("grants advertised wallet quotas and denies overspending without consuming units", async () => {
    await run(() =>
      activateWalletPayment(
        "base",
        "0xquota",
        "scale",
        "0xpayment3",
        new Date().toISOString(),
        PLANS.scale.amountAtomic,
      ),
    );
    db.sqlite
      .prepare(
        "INSERT INTO machine_api_keys(chain,wallet,token_hash,created_at) VALUES('base','0xquota','test-key',?)",
      )
      .run(new Date().toISOString());
    expect(await run(() => consumeUnits("wallet", "test-key", 0, "/usage", "base"))).toMatchObject({
      quota: 2_000_000,
      used: 0,
      allowed: true,
    });
    expect(
      await run(() => consumeUnits("wallet", "test-key", 2_000_000, "/wallet", "base")),
    ).toMatchObject({ allowed: true, remaining: 0 });
    expect(await run(() => consumeUnits("wallet", "test-key", 1, "/wallet", "base"))).toMatchObject(
      { allowed: false, used: 2_000_000 },
    );
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM api_meter_requests").get()).toMatchObject({
      n: 0,
    });
  });
  it("meters account calls atomically, records denials and rejects revoked keys", async () => {
    await run(() => claimWelcomeUnits(user));
    await run(() => storeAccountKey(user, "test", "test-account-key", "hint"));
    for (let i = 0; i < 5; i++)
      expect(
        await run(() => consumeUnits("account", "test-account-key", 200, "/wallet", "base")),
      ).toMatchObject({ allowed: true });
    expect(
      await run(() => consumeUnits("account", "test-account-key", 1, "/wallet", "base")),
    ).toMatchObject({ allowed: false, used: 1000 });
    const overview = await run(() => accountOverview(user));
    expect(overview.account?.used).toBe(1000);
    expect(overview.usage).toHaveLength(6);
    expect(overview.usage.filter((u) => !u.allowed)).toHaveLength(1);
    await run(() => revokeStoredAccountKey(user, overview.keys[0]!.id));
    expect(
      await run(() => consumeUnits("account", "test-account-key", 1, "/wallet", "base")),
    ).toBeNull();
    expect(await run(() => accountOverview("other-account"))).toMatchObject({
      account: null,
      keys: [],
      usage: [],
      payments: [],
      quotes: [],
    });
  });
  it("makes the welcome allowance one-time and enforces the 10-key limit", async () => {
    await run(() => claimWelcomeUnits(user));
    await expect(run(() => claimWelcomeUnits(user))).rejects.toThrow();
    for (let i = 0; i < 10; i++)
      await run(() => storeAccountKey(user, String(i), `hash-${i}`, "hint"));
    await expect(run(() => storeAccountKey(user, "extra", "extra-hash", "hint"))).rejects.toThrow(
      "10 active",
    );
  });
  it("only permits five generation requests per hour", async () => {
    for (let i = 0; i < 5; i++) expect(await run(() => hitRateLimit("bucket", 5, 3600))).toBe(true);
    expect(await run(() => hitRateLimit("bucket", 5, 3600))).toBe(false);
  });
  it("consumes each wallet challenge once and binds it to the signed wallet", async () => {
    const q = await run(() => issueChallenge("base", "0xowner"));
    await expect(run(() => createSession(q.nonce, "base", "0xother"))).rejects.toThrow();
    const session = await run(() => createSession(q.nonce, "base", "0xowner"));
    expect(db.sqlite.prepare("SELECT token_hash FROM machine_sessions").get()).toMatchObject({
      token_hash: sha256(session.accessToken),
    });
    await expect(run(() => createSession(q.nonce, "base", "0xowner"))).rejects.toThrow();
  });
  it("persists conversations by Login account and clears only the current account", async () => {
    await run(() => saveConversation(user, [{ id: "a", role: "user" }]));
    await run(() => saveConversation("other", [{ id: "b", role: "assistant" }]));
    expect(await run(() => conversation(user))).toEqual([{ id: "a", role: "user" }]);
    await run(() => clearConversation(user));
    expect(await run(() => conversation(user))).toEqual([]);
    expect(await run(() => conversation("other"))).toEqual([{ id: "b", role: "assistant" }]);
  });
});
