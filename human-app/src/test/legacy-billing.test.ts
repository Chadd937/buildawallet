// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  entitlement: { chain: "base", wallet: "0xabc", plan_id: "builder", expires_at: 0 },
  periodStart: 0, used: 0, increments: 0,
}));
vi.mock("@/lib/db/context.server", () => ({
  appDatabase: () => ({
    prepare(sql: string) {
      return {
        bind(...args: any[]) {
          return {
            async first() {
              if (sql.includes("FROM human_api_keys")) {
                return state.entitlement.expires_at > args[1] ? state.entitlement : null;
              }
              if (sql.includes("UPDATE human_api_usage SET used=used+?")) {
                if (state.used + args[0] > args[4]) return null;
                state.used += args[0];
                state.increments++;
                return { used: state.used };
              }
              if (sql.includes("SELECT used FROM human_api_usage")) return { used: state.used };
              throw new Error("Unexpected read-only SQL");
            },
            async run() {
              if (!sql.includes("INSERT INTO human_api_usage"))
                throw new Error("Unexpected write SQL");
              if (state.periodStart + args[3] <= args[4]) {
                state.periodStart = args[2];
                state.used = 0;
              }
              return { success: true };
            },
          };
        },
      };
    },
  }),
}));
import { consumeLegacyKey } from "@/lib/machine/legacy-billing.server";

beforeEach(() => {
  const now = Math.floor(Date.now()/1000);
  state.entitlement = { chain: "base", wallet: "0xabc", plan_id: "builder", expires_at: now+3600 };
  state.periodStart = now;
  state.used = 499;
  state.increments = 0;
});

describe("existing customer key preservation", () => {
  it("never gives old Starter customers the new 100,000-unit quota", async () => {
    const lastUnit = await consumeLegacyKey("legacy_hash",1);
    expect(lastUnit).toMatchObject({ plan_id:"builder",quota:500,used:500,remaining:0,allowed:true });
    const overLimit = await consumeLegacyKey("legacy_hash",1);
    expect(overLimit).toMatchObject({ quota:500,used:500,remaining:0,allowed:false });
    expect(state.increments).toBe(1);
  });
  it("rejects expired legacy keys without changing usage", async () => {
    state.entitlement.expires_at = Math.floor(Date.now()/1000)-1;
    expect(await consumeLegacyKey("legacy_hash",1)).toBeNull();
    expect(state.increments).toBe(0);
    expect(state.used).toBe(499);
  });
  it("honors renewal of an expired usage period but not an active period", async () => {
    const current=Math.floor(Date.now()/1000);
    state.periodStart = current-31*86400;
    const result = await consumeLegacyKey("legacy_hash",2);
    expect(result).toMatchObject({ used:2,allowed:true,quota:500,remaining:498 });
    expect(state.periodStart).toBeGreaterThan(current-30*86400);
  });
});
