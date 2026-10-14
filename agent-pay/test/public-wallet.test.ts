import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";

const address = "Ew8mbrKwD6LGaSX28a6XGmXqeQSs2hykRibjXVhftTRC";
const env = {
  SOLANA_RPC_URL: "https://solana.example",
  REQUEST_RATE_LIMITER: { limit: async () => ({ success: true }) },
};

afterEach(() => vi.unstubAllGlobals());

describe("public Solana lookup", () => {
  it("pages Solana signatures using a public genesis-verified RPC", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(init.body as string);
      const result = payload.method === "getGenesisHash"
        ? "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
        : [{ signature: "3iFnuNMJqoGsCSEntBP1G4Ztr4dFkWhEC81cyTmnqvq8f87Ad5mkV99yS1CibBxxPdQqNiB6sxGkCiGoYK224a6P",
            slot: 456872600, blockTime: 1791988315, err: null, confirmationStatus: "finalized" }];
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    }));
    const r = await app.request("/machine/public/solana/" + address + "/history?limit=1", {}, env);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.json()).toMatchObject({ completeHistory: false,
      transactions: [{ success: true }] });
  });
  it("rejects invalid addresses before touching RPC", async () => {
    const res = await app.request("/machine/public/solana/not-a-key", {}, env);
    expect(res.status).toBe(400);
  });
  it("reports SOL, token holdings and recent signatures without a key", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      const program = body.params?.[1]?.programId;
      let result: unknown;
      if (body.method === "getGenesisHash") result = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
      else if (body.method === "getBalance") result = { value: 5611784, context: { slot: 456962350 } };
      else if (body.method === "getTokenAccountsByOwner") result = {
        value: program?.startsWith("Tokenkeg") ? [{
          pubkey: "example", account: { data: { parsed: { info: {
            mint: "ExampleMint", owner: address, tokenAmount: {
              amount: "1250000", decimals: 6, uiAmountString: "1.25"
            }
          } } } }
        }] : []
      };
      else if (body.method === "getSignaturesForAddress") result = [
        { signature: "exampleSig", slot: 456962300, blockTime: null, err: null }
      ];
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    }));
    const res = await app.request("/machine/public/solana/" + address, {}, env);
    expect(res.status, await res.clone().text()).toBe(200);
    expect(await res.json()).toMatchObject({
      balanceSol: "0.005611784", slot: 456962350,
      tokenAccountCount: 1, complete: true,
    });
  });
  it("never returns an empty wallet when upstream balance fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
    const res = await app.request("/machine/public/solana/" + address, {}, env);
    expect(res.status).toBe(503);
    expect((await res.json() as any).balanceSol).toBeUndefined();
  });
  it("returns partial results with warnings when token queries fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const method = JSON.parse(init.body as string).method;
      if (method === "getTokenAccountsByOwner" || method === "getSignaturesForAddress")
        return new Response("bad gateway", { status: 502 });
      const result = method === "getGenesisHash" ? "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
        : { value: 5611784, context: { slot: 456962350 } };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    }));
    const res = await app.request("/machine/public/solana/" + address, {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ balanceSol: "0.005611784", complete: false });
  });
  it("falls back to a verified mainnet RPC when configured endpoint fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (url === "https://solana.example") return new Response("blocked", { status: 403 });
      const method = JSON.parse(init.body as string).method;
      let result: unknown;
      if (method === "getGenesisHash") result = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
      else if (method === "getBalance") result = { value: 5611784, context: { slot: 456962350 } };
      else if (method === "getTokenAccountsByOwner") result = { value: [] };
      else if (method === "getSignaturesForAddress") result = [];
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    }));
    const res = await app.request("/machine/public/solana/" + address, {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ balanceSol: "0.005611784", complete: true });
  });

});
