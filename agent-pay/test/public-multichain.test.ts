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
      stablecoin: { balance: "1" }, complete: true });
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
