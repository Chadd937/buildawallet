// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, expect, it, beforeAll, afterAll } from "vitest";

let db: PGlite;
const user = "00000000-0000-4000-8000-000000000099";
async function quote() {
  const r = await db.query<{ id: string }>("INSERT INTO api_checkout_quotes(user_id,plan_id,chain,payer,expires_at) VALUES($1,'builder','base','0xabc',now()+interval '1 day') RETURNING id", [user]);
  return r.rows[0]!.id;
}
const activate = (id: string, tx: string) => db.query("SELECT activate_api_checkout($1,$2,$3,now()) AS result", [user, id, tx]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;");
  for (const file of ["0000_create_machine_api_billing.sql", "0001_add_atomic_machine_api_meter_v2.sql", "0002_machine_human_api_accounts.sql", "0003_create_human_ai_conversation.sql", "0004_match_plan_allowances.sql", "0005_atomic_payment_redemption.sql", "0006_external_email_auth.sql"]) {
    await db.exec(readFileSync(`drizzle/migrations/${file}`, "utf8"));
  }
}, 30_000);
afterAll(async () => { await db?.close(); });

describe("Payment and quota database", () => {
  it("activates one checkout, rejects a replay, and blocks cross-flow reuse", async () => {
    const id = await quote();
    await activate(id, "0xPAYMENT1");
    const account = await db.query<{quota:number}>("SELECT quota FROM api_accounts WHERE user_id=$1", [user]);
    expect(account.rows[0]!.quota).toBe(100_000);
    await expect(activate(id, "0xPAYMENT1")).rejects.toThrow();
    await expect(db.query("SELECT activate_machine_payment('base','0xpayer','builder','0xpayment1',now(),12000000)")).rejects.toThrow();
    const receipts = await db.query<{count:number}>("SELECT count(*)::int AS count FROM api_payment_redemptions WHERE tx='0xpayment1'");
    expect(receipts.rows[0]!.count).toBe(1);
  });
  it("rolls back the receipt and quote when activation fails, allowing retry", async () => {
    const id = await quote();
    await db.exec("CREATE FUNCTION reject_activation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test outage'; END; $$; CREATE TRIGGER fail_activation BEFORE UPDATE ON api_accounts FOR EACH ROW EXECUTE FUNCTION reject_activation();");
    await expect(activate(id, "0xpayment2")).rejects.toThrow("test outage");
    const receipts = await db.query<{count:number}>("SELECT count(*)::int AS count FROM api_payment_redemptions WHERE tx='0xpayment2'");
    expect(receipts.rows[0]!.count).toBe(0);
    const q = await db.query<{consumed_at:null}>("SELECT consumed_at FROM api_checkout_quotes WHERE id=$1", [id]);
    expect(q.rows[0]!.consumed_at).toBeNull();
    await db.exec("DROP TRIGGER fail_activation ON api_accounts; DROP FUNCTION reject_activation();");
    await activate(id, "0xpayment2");
  });
  it("grants the advertised allowance to wallet-session keys and denies overspending", async () => {
    await db.query("SELECT activate_machine_payment('base','0xquota','scale','0xpayment3',now(),99000000)");
    await db.exec("INSERT INTO machine_api_keys(chain,wallet,token_hash) VALUES('base','0xquota','test-key');");
    const quota = await db.query<{quota:number;allowed:boolean}>("SELECT * FROM consume_machine_api_units_v2('test-key',0)");
    expect(quota.rows[0]!.quota).toBe(2_000_000);
    const spent = await db.query<{allowed:boolean}>("SELECT * FROM consume_machine_api_units_v2('test-key',2000000)");
    expect(spent.rows[0]!.allowed).toBe(true);
    const denied = await db.query<{allowed:boolean}>("SELECT * FROM consume_machine_api_units_v2('test-key',1)");
    expect(denied.rows[0]!.allowed).toBe(false);
  });
  it("only permits five wallet-generation requests per hour", async () => {
    for (let i=0;i<5;i++) {
      const r=await db.query<{allowed:boolean}>("SELECT hit_api_rate_limit('test-bucket',5,3600) AS allowed");
      expect(r.rows[0]!.allowed).toBe(true);
    }
    const r=await db.query<{allowed:boolean}>("SELECT hit_api_rate_limit('test-bucket',5,3600) AS allowed");
    expect(r.rows[0]!.allowed).toBe(false);
  });
});
