import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { publicPlans } from "../src/plans";

const wallet = "0xBcCA6AED433d9020C50D44560F9679F1B5eB511d";
const key = `baw_live_${"a".repeat(64)}`;
function environment(used = 0) {
  let spent = used;
  const DB = { prepare: (sql: string) => ({ bind: (...args: any[]) => ({
    first: async () => {
      if (sql.includes("FROM human_api_keys")) return { chain: "base", wallet: wallet.toLowerCase(),
        expires_at: Math.floor(Date.now() / 1000) + 1000, plan_id: "builder" };
      if (sql.includes("FROM human_api_usage")) return { period_start: Math.floor(Date.now() / 1000), used: spent };
      if (sql.includes("RETURNING used")) {
        if (spent + args[0] > args[4]) return null;
        spent += args[0]; return { used: spent };
      }
      throw Error("Unexpected DB query");
    },
    run: async () => ({ success: true }),
  }) }) };
  return { DB, BASE_RPC_URL: "https://base.example", SOLANA_RPC_URL: "https://solana.example",
    REQUEST_RATE_LIMITER: { limit: async () => ({ success: true }) }, getSpent: () => spent };
}
afterEach(() => vi.unstubAllGlobals());

describe("subscription API and machine discovery", () => {
  it("advertises exactly three unified plans and a schema for the available routes", async () => {
    expect(publicPlans().map(p => [p.id, p.priceUSDC, p.units])).toEqual([
      ["builder", "12.00", 500], ["pro", "39.00", 5000], ["scale", "99.00", 25000],
    ]);
    const spec = await (await app.request("/machine/openapi.json")).json() as any;
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.paths["/machine/v1/solana/usdc/{address}"].get.security).toEqual([{ ApiKey: [] }]);
    expect((await app.request("/.well-known/agent.json")).status).toBe(200);
    expect((await app.request("/api-docs")).status).toBe(200);
  });
  it("rejects missing credentials and invalid addresses before RPC or metering", async () => {
    const env = environment();
    expect((await app.request(`/machine/v1/base/wallet/${wallet}`, {}, env)).status).toBe(401);
    expect((await app.request("/machine/v1/base/wallet/invalid", { headers: { Authorization: `Bearer ${key}` } }, env)).status).toBe(400);
    expect(env.getSpent()).toBe(0);
  });
  it("charges successful reads once and leaves failed RPCs uncharged", async () => {
    const env = environment();
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const method = JSON.parse(init.body as string).method;
      const result: Record<string, unknown> = { eth_chainId: "0x2105", eth_getBalance: "0x10",
        eth_getTransactionCount: "0x2", eth_blockNumber: "0x21" };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: result[method] }));
    }));
    const response = await app.request(`/machine/v1/base/wallet/${wallet}`, { headers: { Authorization: `Bearer ${key}` } }, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("499");
    expect(env.getSpent()).toBe(1);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Unavailable", { status: 503 })));
    expect((await app.request(`/machine/v1/base/wallet/${wallet}`, { headers: { Authorization: `Bearer ${key}` } }, env)).status).toBe(503);
    expect(env.getSpent()).toBe(1);
  });
  it("rejects exhausted quotas before RPC and Builder batches", async () => {
    const env = environment(500);
    const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
    expect((await app.request(`/machine/v1/base/wallet/${wallet}`, { headers }, env)).status).toBe(429);
    expect((await app.request("/machine/v1/batch", { method: "POST", headers, body: JSON.stringify({ queries: [
      { chain: "base", kind: "wallet", address: wallet }, { chain: "base", kind: "usdc", address: wallet },
    ] }) }, env)).status).toBe(403);
  });
  it("exposes stateless MCP tools without leaking paid data", async () => {
    const req = { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Host: "buildawallet.xyz" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
        protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" },
      } }) };
    const response = await app.request("/mcp", req, environment());
    expect(response.status, await response.clone().text()).toBe(200);
    const payload = await response.text();
    expect(payload).toContain("buildawallet");
    const list = await app.request("/mcp", { method: "POST", headers: req.headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) }, environment());
    expect(list.status, await list.clone().text()).toBe(200);
    expect(await list.text()).toContain("base_wallet");
    const call = await app.request("/mcp", { method: "POST", headers: req.headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: {
        name: "base_wallet", arguments: { address: wallet },
      } }) }, environment());
    expect(call.status, await call.clone().text()).toBe(200);
    expect(await call.text()).toContain("Active plan and API key required");
  });
});
