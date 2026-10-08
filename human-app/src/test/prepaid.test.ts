// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TestD1 } from "./d1-fixture";
import { withWorkerEnvironment } from "@/lib/db/context.server";
import {
  activateCheckout,
  activateWalletPayment,
  storeAccountKey,
  storeCheckoutQuote,
} from "@/lib/db/storage.server";
import { sha256 } from "@/lib/machine/billing.server";
import { handleMachineRequest } from "@/lib/machine/router.server";
import { handleMcp } from "@/lib/machine/mcp.server";
import { treasuryLedger } from "@/lib/owner/treasury.server";
import { offer, llms, openapi } from "@/lib/machine/spec";
import { PLANS, paymentCollector } from "@/lib/machine/config";
import { readWallet } from "@/lib/machine/data.server";

vi.mock("@/lib/machine/data.server", () => ({
  readWallet: vi.fn(async () => ({ balanceAtomic: "123" })),
  readStablecoin: vi.fn(),
  readTransaction: vi.fn(),
  snapshot: vi.fn(),
  portfolio: vi.fn(),
  configuredNetworks: vi.fn(),
}));
let db: TestD1;
const accountKey = "baw_acct_" + "a".repeat(64);
const walletKey = "baw_live_" + "b".repeat(64);
const payer = "0x" + "1".repeat(40);
const run = <T>(fn: () => T) => withWorkerEnvironment({ DB: db }, fn);
const migration = (name: string) => db.sqlite.exec(readFileSync(`migrations/${name}`, "utf8"));
const request = (path: string, key = accountKey) =>
  new Request("https://buildawallet.xyz" + path, { headers: { authorization: `Bearer ${key}` } });
const mcp = (method: string, params?: unknown, key = accountKey) =>
  run(() =>
    handleMcp(
      new Request("https://buildawallet.xyz/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
          "payment-signature": "old-signed-payment",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }),
    ),
  );
beforeEach(() => {
  db = new TestD1();
  vi.clearAllMocks();
  migration("baw_0001_app_data.sql");
  migration("baw_0002_treasury_receipts.sql");
  migration("baw_0003_prepaid_plans.sql");
  migration("baw_0005_agent_accounts.sql");
  migration("baw_0006_multichain_payments.sql");
});
afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

it("refuses old payment routes even with signatures or valid keys, without settlement or metering", async () => {
  const network = vi.spyOn(globalThis, "fetch");
  for (const path of [
    "/machine/x402/wallet",
    "/api/public/machine/x402/wallet",
    "/machine/wallet",
    "/machine/solana-wallet",
  ]) {
    for (const method of ["GET", "POST"]) {
      const response = await run(() =>
        handleMachineRequest(
          new Request("https://buildawallet.xyz" + path, {
            method,
            headers: { "payment-signature": "signed", authorization: `Bearer ${accountKey}` },
          }),
        ),
      );
      expect(response.status).toBe(410);
      expect(response.headers.get("payment-required")).toBeNull();
      expect(response.headers.get("payment-response")).toBeNull();
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(await response.json()).toMatchObject({
        paymentAccepted: false,
        billing: { mode: "prepaid", perRequestOnchainPayment: true },
      });
    }
  }
  expect(network).not.toHaveBeenCalled();
  expect(readWallet).not.toHaveBeenCalled();
  expect(
    db.sqlite.prepare("SELECT count(*) AS n FROM api_payment_redemptions").get(),
  ).toMatchObject({ n: 0 });
});

it("one account purchase funds repeated reads with one unchanged payment receipt and no settlement requests", async () => {
  const quote = await run(() => storeCheckoutQuote("owner", "builder", "base", payer));
  await run(() => activateCheckout("owner", quote.id, "0xfunded", new Date().toISOString()));
  await run(() => storeAccountKey("owner", "test", sha256(accountKey), "hint"));
  const network = vi.spyOn(globalThis, "fetch");
  for (let i = 0; i < 20; i++) {
    const response = await run(() =>
      handleMachineRequest(request(`/machine/v1/base/wallet/${payer}`)),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).usage.used).toBe(i + 1);
  }
  expect(network).not.toHaveBeenCalled();
  expect(db.sqlite.prepare("SELECT amount_atomic FROM api_account_payments").get()).toMatchObject({
    amount_atomic: PLANS.builder.amountAtomic.toString(),
  });
  expect(
    db.sqlite.prepare("SELECT count(*) AS n FROM api_payment_redemptions").get(),
  ).toMatchObject({ n: 1 });
  expect(db.sqlite.prepare("SELECT count(*) AS n FROM api_usage_events").get()).toMatchObject({
    n: 20,
  });
  expect((await run(treasuryLedger)).totals).toEqual([
    {
      source: "Account subscription",
      chain: "base",
      count: 1,
      amountAtomic: PLANS.builder.amountAtomic.toString(),
    },
  ]);
  db.sqlite.prepare("UPDATE api_accounts SET used=quota WHERE user_id='owner'").run();
  vi.mocked(readWallet).mockClear();
  expect(
    (await run(() => handleMachineRequest(request(`/machine/v1/base/wallet/${payer}`)))).status,
  ).toBe(429);
  expect(readWallet).not.toHaveBeenCalled();
});

it("wallet-authenticated purchases use prepaid units and retain global receipt replay protection", async () => {
  await run(() =>
    activateWalletPayment(
      "base",
      payer,
      "builder",
      "0xwallet-funded",
      new Date().toISOString(),
      PLANS.builder.amountAtomic,
    ),
  );
  db.sqlite
    .prepare(
      "INSERT INTO machine_api_keys(chain,wallet,token_hash,created_at) VALUES('base',?,?,?)",
    )
    .run(payer, sha256(walletKey), new Date().toISOString());
  const response = await run(() =>
    handleMachineRequest(request(`/machine/v1/base/wallet/${payer}`, walletKey)),
  );
  expect(response.status).toBe(200);
  expect((await response.json()).usage.used).toBe(1);
  const quote = await run(() => storeCheckoutQuote("other", "builder", "base", payer));
  await expect(
    run(() => activateCheckout("other", quote.id, "0xwallet-funded", new Date().toISOString())),
  ).rejects.toThrow();
  expect((await run(treasuryLedger)).totals).toEqual([
    {
      source: "Agent subscription",
      chain: "base",
      count: 1,
      amountAtomic: PLANS.builder.amountAtomic.toString(),
    },
  ]);
});

it("migration preserves historical receipts, API keys and used quotas", async () => {
  db.close();
  db = new TestD1();
  migration("baw_0001_app_data.sql");
  migration("baw_0002_treasury_receipts.sql");
  db.sqlite
    .prepare(
      "INSERT INTO machine_payments(id,chain,tx,wallet,plan_id,amount_atomic,paid_at) VALUES('old','base','0xold',?,'builder','12000000',?)",
    )
    .run(payer, new Date().toISOString());
  db.sqlite
    .prepare(
      "INSERT INTO machine_api_keys(chain,wallet,token_hash,created_at) VALUES('base',?,?,?)",
    )
    .run(payer, sha256(walletKey), new Date().toISOString());
  expect(
    (await run(() => handleMachineRequest(request(`/machine/v1/base/wallet/${payer}`, walletKey))))
      .status,
  ).toBe(200);
  migration("baw_0003_prepaid_plans.sql");
  const next = await run(() =>
    handleMachineRequest(request(`/machine/v1/base/wallet/${payer}`, walletKey)),
  );
  expect(next.status).toBe(200);
  expect((await next.json()).usage.used).toBe(2);
  expect((await run(treasuryLedger)).totals[0]).toMatchObject({ amountAtomic: "12000000" });
  await expect(
    run(() =>
      activateWalletPayment(
        "base",
        payer,
        "builder",
        "0xold",
        new Date().toISOString(),
        PLANS.builder.amountAtomic,
      ),
    ),
  ).rejects.toThrow();
});

it("rejects underpayment at the database boundary for every current plan", async () => {
  for (const plan of Object.values(PLANS)) {
    const quote = await run(() => storeCheckoutQuote("test", plan.id, "base", payer));
    expect(() =>
      db.sqlite
        .prepare(
          "INSERT INTO api_account_payments(id,user_id,quote_id,chain,tx,payer,plan_id,amount_atomic,paid_at) VALUES(?,'test',?,'base',?,?,?,?,?)",
        )
        .run(
          plan.id,
          quote.id,
          plan.id,
          payer,
          plan.id,
          (plan.amountAtomic - 1n).toString(),
          new Date().toISOString(),
        ),
    ).toThrow();
    expect(() =>
      db.sqlite
        .prepare(
          "INSERT INTO machine_prepaid_payments(id,chain,tx,wallet,plan_id,amount_atomic,paid_at) VALUES(?,'base',?,?,?,?,?)",
        )
        .run(
          plan.id,
          plan.id,
          payer,
          plan.id,
          (plan.amountAtomic - 1n).toString(),
          new Date().toISOString(),
        ),
    ).toThrow();
    await run(() => activateCheckout("test", quote.id, plan.id, new Date().toISOString()));
    expect(
      db.sqlite
        .prepare(
          "SELECT amount_atomic FROM api_account_payments WHERE id IS NOT NULL AND quote_id=?",
        )
        .get(quote.id),
    ).toMatchObject({ amount_atomic: plan.amountAtomic.toString() });
  }
});

it("publishes prepaid + x402 discovery and returns migration guidance to old MCP callers", async () => {
  expect(
    (await (await run(() => handleMachineRequest(request("/machine/v1/plans")))).json()).billing,
  ).toMatchObject({ mode: "prepaid", perRequestOnchainPayment: true });
  const tools = (await (await mcp("tools/list")).json()).result.tools;
  expect(tools.some((tool: { name: string }) => tool.name === "wallet_payg")).toBe(false);
  const retired = (
    await (
      await mcp("tools/call", {
        name: "wallet_payg",
        arguments: { _meta: { "x402/payment": "signed" } },
      })
    ).json()
  ).result;
  expect(retired.isError).toBe(true);
  expect(retired.structuredContent.paymentAccepted).toBe(false);
  expect(retired._meta).toBeUndefined();
  expect(
    (await (await mcp("tools/call", { name: "service_quote" })).json()).result.structuredContent
      .billing.mode,
  ).toBe("prepaid");
  expect(JSON.stringify({ offer, openapi, llms })).toMatch(/x402|PAYMENT-SIGNATURE|\$0\.01/);
  expect(paymentCollector("tron")).toBe("TY5CSu6UyMYvQNjBApfhxwSN4QHhW2n48u");
});
