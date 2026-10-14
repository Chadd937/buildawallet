import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";

const address = "0xBcCA6AED433d9020C50D44560F9679F1B5eB511d";
const btc = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
const env = { REQUEST_RATE_LIMITER: { limit: async () => ({ success: true }) } };
afterEach(() => vi.unstubAllGlobals());

describe("public multichain inspection", () => {
  it("serves the wallet inspector and its terminal/API guide without authentication", async () => {
    const response = await app.request("/machine/inspector");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Wallet Inspector");
    expect(html).toContain("Use the same service from your terminal or app");
    expect(html).toContain("/machine/public/portfolio/");
    expect(html).toContain("/machine/public/solana/");
    expect(html).toContain("curl -sS");
    expect(html).not.toContain("Enter seed phrase");
    expect(response.headers.get("content-security-policy")).toContain("connect-src 'self'");
  });
  it("lists supported public chains", async () => {
    const r = await app.request("/machine/public/chains");
    expect(r.status).toBe(200);
    const body = await r.json() as any;
    expect(body.chains).toContain("polygon");
    expect(body.chains).toContain("bitcoin");
    expect(body.chains).toContain("solana");
  });
  it("checks EVM chain ID and reports base native and USDC", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const method = JSON.parse(init.body as string).method;
      const values: Record<string, string> = {
        eth_chainId: "0x2105", eth_getBalance: "0xde0b6b3a7640000",
        eth_getTransactionCount: "0x1", eth_blockNumber: "0x10",
        eth_call: "0xf4240",
      };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: values[method] }));
    }));
    const r = await app.request("/machine/public/base/" + address, {}, env);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.json()).toMatchObject({ native: { balance: "1" },
      stablecoin: { balance: "1" }, complete: false });
  });
  it("tries a second chain-verified RPC for USDC when the native provider blocks eth_call", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      const method = JSON.parse(init.body as string).method;
      if (method === "eth_call" && url === "https://mainnet.base.org")
        return new Response("blocked", { status: 403 });
      const values: Record<string, string> = {
        eth_chainId: "0x2105", eth_getBalance: "0x0",
        eth_getTransactionCount: "0x0", eth_blockNumber: "0x10",
        eth_call: "0xf4240",
      };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: values[method] }));
    }));
    const r = await app.request("/machine/public/base/" + address, {}, env);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.json()).toMatchObject({ stablecoin: { balance: "1" } });
  });
  it("uses valid 20-byte USDC contract addresses on every EVM chain", async () => {
    const ids: Record<string, string> = {
      ethereum: "0x1", base: "0x2105", arbitrum: "0xa4b1",
      optimism: "0xa", polygon: "0x89", bnb: "0x38", avalanche: "0xa86a",
    };
    for (const [chain, chainId] of Object.entries(ids)) {
      const observed: string[] = [];
      vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
        const request = JSON.parse(init.body as string);
        const values: Record<string, string> = {
          eth_chainId: chainId, eth_getBalance: "0x0",
          eth_getTransactionCount: "0x0", eth_blockNumber: "0x10",
          eth_call: "0x0",
        };
        if (request.method === "eth_call") {
          observed.push(request.params[0].to);
          expect(request.params[0].to).toMatch(/^0x[0-9a-fA-F]{40}$/);
        }
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: values[request.method] }));
      }));
      const response = await app.request("/machine/public/" + chain + "/" + address, {}, env);
      expect(response.status, chain + ": " + await response.clone().text()).toBe(200);
      expect(observed.length, chain + " did not read USDC").toBeGreaterThan(0);
      vi.unstubAllGlobals();
    }
  });
  it("reads a supplied ERC-20 contract balance and metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(init.body as string);
      const selector = payload.params?.[0]?.data?.slice(0, 10);
      const symbol = "55534443"; // USDC
      const encoded = "0x" + (32n).toString(16).padStart(64, "0")
        + (4n).toString(16).padStart(64, "0") + symbol.padEnd(64, "0");
      const value = payload.method === "eth_chainId" ? "0x2105"
        : selector === "0x70a08231" ? "0xf4240"
        : selector === "0x313ce567" ? "0x06"
        : selector === "0x95d89b41" ? encoded : "0x0";
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: value }));
    }));
    const token = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    const res = await app.request("/machine/public/base/" + address + "/token/" + token, {}, env);
    expect(res.status, await res.clone().text()).toBe(200);
    expect(await res.json()).toMatchObject({ symbol: "USDC", decimals: 6,
      balanceAtomic: "1000000", balance: "1", complete: true });
  });
  it("rejects invalid contract addresses without contacting public RPC", async () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    const res = await app.request("/machine/public/base/" + address + "/token/not-a-contract", {}, env);
    expect(res.status).toBe(400);
    expect(mock).not.toHaveBeenCalled();
  });
  it("provides Bitcoin UTXOs separately from ordinal indexing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      { txid: "a", vout: 1, value: 9000, status: { confirmed: true, block_height: 100 } },
    ]))));
    const res = await app.request("/machine/public/bitcoin/" + btc + "/utxos", {}, env);
    expect(res.status, await res.clone().text()).toBe(200);
    expect(await res.json()).toMatchObject({ utxos: [{ valueSats: 9000 }], truncated: false });
  });
  it("returns per-network partial errors for unified EVM portfolio", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("blocked", { status: 503 })));
    const res = await app.request("/machine/public/portfolio/" + address, {}, env);
    expect(res.status).toBe(200);
    const payload = await res.json() as any;
    expect(payload.chainsQueried).toBe(7);
    expect(payload.networks.every((item: any) => item.ok === false)).toBe(true);
    expect(payload.complete).toBe(false);
  });
  it("does not return an incorrect zero on public RPC failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("blocked", { status: 403 })));
    const r = await app.request("/machine/public/polygon/" + address, {}, env);
    expect(r.status).toBe(503);
    expect((await r.json() as any).native).toBeUndefined();
  });
  it("returns bitcoin satoshi balance and history", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(
      url.endsWith("/txs") ? [{ txid: "abc", fee: 55, status: { confirmed: true } }] : {
        chain_stats: { funded_txo_sum: 9000, spent_txo_sum: 1000, tx_count: 2 },
        mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
      }))));
    const r = await app.request("/machine/public/bitcoin/" + btc, {}, env);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.json()).toMatchObject({ native: { balanceAtomic: "8000" },
      complete: true });
  });
});
