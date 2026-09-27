import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { publicPlans } from "../src/plans";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

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
  it("gates HUMAN pages with a signed Cloudflare Access identity while machine discovery stays public", async () => {
    for (const path of ["/human", "/human/build", "/human/studio", "/human/live", "/human/pay", "/pay",
      "/machine/ai/chat", "/machine/human/gallery", "/machine/human/blueprint", "/machine/human/wallet/abcdefghjkmnpqrstuvwxyz234"]) {
      expect((await app.request(path)).status).toBe(503);
    }
    const env = { CF_ACCESS_TEAM_DOMAIN: "https://baw-test.cloudflareaccess.com", CF_ACCESS_AUD: "test-human-app" };
    expect((await app.request("/human", {}, env)).status).toBe(403);
    expect((await app.request("/machine/info", {}, env)).status).toBe(200);
    expect((await app.request("/.well-known/agent.json", {}, env)).status).toBe(200);

    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = { ...await exportJWK(publicKey), kid: "test-key", alg: "RS256", use: "sig" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] }),
      { status: 200, headers: { "Content-Type": "application/json" } })));
    const signed = await new SignJWT({ type: "app", email: "visitor@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(env.CF_ACCESS_TEAM_DOMAIN).setAudience(env.CF_ACCESS_AUD)
      .setSubject("verified-user")
      .setIssuedAt().setExpirationTime("5m").sign(privateKey);
    const headers = { "Cf-Access-Jwt-Assertion": signed };
    expect((await app.request("/human", { headers }, env)).status).toBe(200);
    const bound: unknown[][] = [];
    let createdAt: number | null = null;
    const DB = { prepare: (sql: string) => ({ bind: (...args: unknown[]) => ({
      first: async () => sql.includes("SELECT created_at FROM human_accounts") &&
        createdAt !== null ? { created_at: createdAt } : null,
      run: async () => { bound.push(args); createdAt ??= args[1] as number; return { success: true }; },
    }) }) };
    const first = await app.request("/human/account", { headers }, { ...env, DB });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ email: "visitor@example.com", newAccount: true });
    const again = await app.request("/human/account", { headers }, { ...env, DB });
    expect(await again.json()).toMatchObject({ newAccount: false });
    expect(JSON.stringify(bound)).not.toContain("visitor@example.com");
    expect((await app.request("/human/account", {}, { ...env, DB })).status).toBe(403);
    expect((await app.request("/human/pay", { headers }, env)).status).toBe(200);
    expect((await app.request("/pay", { headers }, env)).status).toBe(200);
    const plan = await app.request("/machine/human/blueprint", { method: "POST", headers: {
      ...headers, "Content-Type": "application/json",
    }, body: JSON.stringify({ spec: { name: "Free design", networks: ["n_base"], features: ["f_send"] } }) }, {
      ...env, REQUEST_RATE_LIMITER: { limit: async () => ({ success: true }) },
    });
    expect(plan.status).toBe(200);
    const exportBody = await plan.json() as any;
    expect(exportBody.format).toBe("buildawallet-implementation-blueprint");
    expect(exportBody.subscriptionExpiresAt).toBeUndefined();
    expect(exportBody.implementationPlan.length).toBeGreaterThan(0);
    expect((await app.request("/human", { headers: { "Cf-Access-Jwt-Assertion": signed + "a" } }, env)).status).toBe(403);
  });
  it("advertises exactly three unified plans and a schema for the available routes", async () => {
    expect(publicPlans().map(p => [p.id, p.priceUSDC, p.units])).toEqual([
      ["builder", "12.00", 500], ["pro", "39.00", 5000], ["scale", "99.00", 25000],
    ]);
    const spec = await (await app.request("/machine/openapi.json")).json() as any;
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.paths["/machine/v1/solana/usdc/{address}"].get.security).toEqual([{ ApiKey: [] }]);
    expect(spec.paths["/machine/human/blueprint"].post.security).toEqual([{ AccessSession: [] }]);
    expect(spec.paths["/human/account"].get.security).toEqual([{ AccessSession: [] }]);
    expect(publicPlans().every(p => !("humanBlueprint" in p))).toBe(true);
    expect((await app.request("/.well-known/agent.json")).status).toBe(200);
    expect((await app.request("/api-docs")).status).toBe(200);
  });
  it("serves API documentation assets and legal pages from this origin", async () => {
    const page = await (await app.request("/api-docs")).text();
    expect(page).toContain('/api-docs/swagger-ui-bundle.js');
    expect(page).not.toContain('unpkg.com');
    const css = await app.request('/api-docs/swagger-ui.css');
    const js = await app.request('/api-docs/swagger-ui-bundle.js');
    expect(css.status).toBe(200);
    expect(css.headers.get('content-type')).toContain('text/css');
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toContain('application/javascript');
    expect((await (await app.request('/privacy')).text())).toContain('does not include advertising cookies');
    expect((await (await app.request('/terms')).text())).toContain('Starter costs $12 USDC');
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
  it("meters a composite snapshot as two units on Starter and identifies independent reads", async () => {
    const env = environment();
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const method = JSON.parse(init.body as string).method;
      const value: Record<string, string> = { eth_chainId: "0x2105", eth_getBalance: "0x10",
        eth_getTransactionCount: "0x2", eth_blockNumber: "0x21", eth_call: "0x2710" };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: value[method] }));
    }));
    const res = await app.request(`/machine/v1/base/snapshot/${wallet}`,
      { headers: { Authorization: `Bearer ${key}` } }, env);
    expect(res.status, await res.clone().text()).toBe(200);
    expect(res.headers.get("X-Units-Charged")).toBe("2");
    expect(env.getSpent()).toBe(2);
    expect(await res.json()).toMatchObject({ chain: "base", units: 2,
      context: { nativeBlock: 33, consistency: "independent confirmed or latest RPC reads" },
      usdc: { balanceAtomic: "10000" } });
    const exhausted = environment(499);
    const failed = await app.request(`/machine/v1/base/snapshot/${wallet}`,
      { headers: { Authorization: `Bearer ${key}` } }, exhausted);
    expect(failed.status).toBe(429);
    expect(exhausted.getSpent()).toBe(499);
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
    const tools = await (await app.request("/mcp", { method: "POST", headers: req.headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/list", params: {} }) }, environment())).text();
    expect(tools).toContain("solana_wallet_payg");
    expect(tools).toContain("base_snapshot");
    expect(tools).toContain("service_quote");
    const call = await app.request("/mcp", { method: "POST", headers: req.headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: {
        name: "base_wallet", arguments: { address: wallet },
      } }) }, environment());
    expect(call.status, await call.clone().text()).toBe(200);
    expect(await call.text()).toContain("Active plan and API key required");
    const quote = await app.request("/mcp", { method: "POST", headers: req.headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: {
        name: "service_quote", arguments: { chain: "base", kind: "wallet", access: "x402" },
      } }) }, environment());
    expect(quote.status).toBe(200);
    const quoteText = await quote.text();
    const quotePayload = JSON.parse(quoteText.startsWith("event:") ? quoteText.split("data: ")[1] : quoteText);
    expect(quotePayload).toMatchObject({ result: {
      structuredContent: { price: { amountAtomic: "10000" } } } });
  });
});
