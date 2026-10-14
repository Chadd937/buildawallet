import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";

const address = "0xBcCA6AED433d9020C50D44560F9679F1B5eB511d";
const btc = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
const env = { REQUEST_RATE_LIMITER: { limit: async () => ({ success: true }) } };
afterEach(() => vi.unstubAllGlobals());

describe("public multichain inspection", () => {
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
