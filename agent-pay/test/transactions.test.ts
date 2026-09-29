import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";

const wallet = "0xBcCA6AED433d9020C50D44560F9679F1B5eB511d";
const recipient = "0x1111111111111111111111111111111111111111";
const solanaWallet = "Ew8mbrKwD6LGaSX28a6XGmXqeQSs2hykRibjXVhftTRC";
const solanaOther = "11111111111111111111111111111111";
const solanaToken = "Hp6uUt3RmYYVmeSYyf6LpimgddHbL9QJ1LG9TbK5pJiQ";
const key = `baw_live_${"a".repeat(64)}`;

function environment() {
  let spent = 0;
  const DB = { prepare: (sql: string) => ({ bind: (...args: any[]) => ({
    first: async () => {
      if (sql.includes("FROM human_api_keys")) return { chain: "base", wallet: wallet.toLowerCase(),
        expires_at: Math.floor(Date.now() / 1000) + 1000, plan_id: "builder" };
      if (sql.includes("FROM human_api_usage")) return { period_start: Math.floor(Date.now() / 1000), used: spent };
      if (sql.includes("RETURNING used")) { spent += args[0]; return { used: spent }; }
      throw Error(`Unexpected DB query: ${sql}`);
    },
    run: async () => ({ success: true }),
  }) }) };
  return {
    DB,
    BASE_RPC_URL: "https://base.example",
    SOLANA_RPC_URL: "https://solana.example",
    REQUEST_RATE_LIMITER: { limit: async () => ({ success: true }) },
    getSpent: () => spent,
  };
}

function auth(body: object) {
  return { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body) };
}

afterEach(() => vi.unstubAllGlobals());

describe("non-custodial transaction API", () => {
  it("prepares Base native and USDC transactions without signing", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const { method } = JSON.parse(init.body as string);
      const values: Record<string, any> = {
        eth_chainId: "0x2105",
        eth_getTransactionCount: "0x7",
        eth_estimateGas: "0x5208",
        eth_maxPriorityFeePerGas: "0x3b9aca00",
        eth_getBlockByNumber: { baseFeePerGas: "0x3b9aca00" },
      };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: values[method] }));
    }));
    const env = environment();
    const native = await app.request("/machine/v1/base/transaction/prepare", auth({
      from: wallet, to: recipient, asset: "native", amountAtomic: "1000000000000000",
    }), env);
    expect(native.status, await native.clone().text()).toBe(200);
    expect(await native.json()).toMatchObject({ chain: "base", asset: "native",
      unsignedTransaction: { chainId: "0x2105", to: recipient, nonce: "0x7", type: "0x2" } });
    const usdc = await app.request("/machine/v1/base/transaction/prepare", auth({
      from: wallet, to: recipient, asset: "usdc", amountAtomic: "1250000",
    }), env);
    expect(usdc.status, await usdc.clone().text()).toBe(200);
    const usdcBody = await usdc.json() as any;
    expect(usdcBody.asset).toBe("usdc");
    expect(usdcBody.unsignedTransaction.data).toMatch(/^0xa9059cbb/);
    expect(env.getSpent()).toBe(2);
  });

  it("prepares Solana native and USDC transactions with zero signature slots", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const { method } = JSON.parse(init.body as string);
      const result = method === "getGenesisHash" ? "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" :
        method === "getLatestBlockhash" ? { value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1 } } : null;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    }));
    const env = environment();
    const native = await app.request("/machine/v1/solana/transaction/prepare", auth({
      from: solanaWallet, to: solanaOther, asset: "native", amountAtomic: "1000000",
    }), env);
    expect(native.status, await native.clone().text()).toBe(200);
    const nativeBody = await native.json() as any;
    expect(nativeBody.chain).toBe("solana");
    expect(nativeBody.transactionBase64.length).toBeGreaterThan(100);
    expect(nativeBody.messageBase64.length).toBeGreaterThan(50);

    const usdc = await app.request("/machine/v1/solana/transaction/prepare", auth({
      from: solanaWallet, to: solanaOther, asset: "usdc", amountAtomic: "2500000",
      sourceTokenAccount: solanaToken, destinationTokenAccount: solanaWallet,
    }), env);
    expect(usdc.status, await usdc.clone().text()).toBe(200);
    expect(await usdc.json()).toMatchObject({ chain: "solana", asset: "usdc", amountAtomic: "2500000" });
    expect(env.getSpent()).toBe(2);
  });

  it("broadcasts only already-signed Base and Solana payloads", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const { method } = JSON.parse(init.body as string);
      const result = method === "eth_chainId" ? "0x2105" :
        method === "eth_sendRawTransaction" ? `0x${"b".repeat(64)}` :
        method === "getGenesisHash" ? "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" :
        method === "sendTransaction" ? "2".repeat(64) : null;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    }));
    const env = environment();
    const base = await app.request("/machine/v1/base/transaction/broadcast", auth({ signedTransaction: "0x01" }), env);
    expect(base.status, await base.clone().text()).toBe(200);
    expect(await base.json()).toMatchObject({ chain: "base", submitted: true, tx: `0x${"b".repeat(64)}` });

    const signedTransactionBase64 = Buffer.alloc(100, 7).toString("base64");
    const solana = await app.request("/machine/v1/solana/transaction/broadcast", auth({ signedTransactionBase64 }), env);
    expect(solana.status, await solana.clone().text()).toBe(200);
    expect(await solana.json()).toMatchObject({ chain: "solana", submitted: true, tx: "2".repeat(64) });
    expect(env.getSpent()).toBe(2);
  });

  it("rejects invalid transaction inputs without consuming quota", async () => {
    const env = environment();
    const bad = await app.request("/machine/v1/base/transaction/prepare", auth({
      from: "private-key-goes-here", to: recipient, asset: "native", amountAtomic: "1",
    }), env);
    expect(bad.status).toBe(400);
    expect(env.getSpent()).toBe(0);
    const raw = await bad.text();
    expect(raw.toLowerCase()).not.toContain("seed phrase");
  });
});
