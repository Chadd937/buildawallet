import { afterEach, describe, expect, it, vi } from "vitest";
import app, { BASE_COLLECTOR, SOLANA_COLLECTOR } from "../src/index";
import { SOLANA_COLLECTOR_ATA, verifyBaseReceipt, verifySolanaReceipt } from "../src/receipts";
import { PLANS } from "../src/plans";
import { challengeMessage, normalizedWallet } from "../src/subscription";

const basePayer = "0x6e57597d15e7069e60b2b98f136b1e109c23cbf2";
const solPayer = "2dZsyviNQRVx1rqK6NyPTJRJfkq5FRzkovpEyT46AoAC";
const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const txBase = "0x" + "a".repeat(64), txSol = "3".repeat(87);
const timestamp = 1_800_000_000;
const PRICE_ATOMIC = PLANS.pro.amountAtomic;

function baseRpc(override: Record<string, any> = {}) {
  const transfer = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const values: Record<string, unknown> = {
    eth_chainId: "0x2105",
    eth_getTransactionReceipt: { status: "0x1", blockNumber: "0x20", logs: [{
      address: usdc, topics: [transfer, "0x" + basePayer.slice(2).padStart(64, "0"),
        "0x" + BASE_COLLECTOR.slice(2).toLowerCase().padStart(64, "0")], data: "0x" + PRICE_ATOMIC.toString(16),
    }] },
    eth_getTransactionByHash: { from: basePayer, to: usdc },
    eth_blockNumber: "0x23",
    eth_getBlockByNumber: { timestamp: "0x" + timestamp.toString(16) },
    ...override,
  };
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => new Response(JSON.stringify({
    jsonrpc: "2.0", id: 1, result: values[JSON.parse(init.body as string).method],
  }))));
}

function solanaRpc(override: Record<string, any> = {}) {
  const source = "6".repeat(44);
  const result = {
    blockTime: timestamp, meta: {
      err: null,
      preTokenBalances: [
        { accountIndex: 1, mint, owner: solPayer, uiTokenAmount: { amount: "50000000" } },
        { accountIndex: 2, mint, owner: SOLANA_COLLECTOR, uiTokenAmount: { amount: "0" } },
      ],
      postTokenBalances: [
        { accountIndex: 1, mint, owner: solPayer, uiTokenAmount: { amount: "11000000" } },
        { accountIndex: 2, mint, owner: SOLANA_COLLECTOR, uiTokenAmount: { amount: PRICE_ATOMIC.toString() } },
      ],
      innerInstructions: [],
    },
    transaction: { signatures: [txSol], message: {
      accountKeys: [{ pubkey: solPayer, signer: true }, { pubkey: source }, { pubkey: SOLANA_COLLECTOR_ATA }],
      instructions: [{ program: "spl-token", parsed: { type: "transferChecked", info: {
        source, destination: SOLANA_COLLECTOR_ATA, authority: solPayer, mint,
        tokenAmount: { amount: PRICE_ATOMIC.toString() },
      } } }],
    } },
    ...override,
  };
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const method = JSON.parse(init.body as string).method;
    return new Response(JSON.stringify({ result: method === "getGenesisHash" ?
      "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" : result }));
  }));
  return result;
}

afterEach(() => vi.unstubAllGlobals());

describe("human subscription payment verification", () => {
  it("validates a direct Base USDC transfer after two confirmations", async () => {
    baseRpc();
    expect(await verifyBaseReceipt("https://base.example", txBase, basePayer, timestamp, PRICE_ATOMIC)).toBe(timestamp);
  });
  it("rejects wrong Base payer, short confirmation and older payment", async () => {
    baseRpc();
    await expect(verifyBaseReceipt("https://base.example", txBase, BASE_COLLECTOR.toLowerCase(), timestamp, PRICE_ATOMIC)).rejects.toThrow();
    await expect(verifyBaseReceipt("https://base.example", txBase, basePayer, timestamp + 100, PRICE_ATOMIC)).rejects.toThrow();
    baseRpc({ eth_blockNumber: "0x20" });
    await expect(verifyBaseReceipt("https://base.example", txBase, basePayer, timestamp, PRICE_ATOMIC)).rejects.toThrow("confirmations");
  });
  it("validates finalized Solana token deltas, owner, and transferChecked instruction", async () => {
    solanaRpc();
    expect(await verifySolanaReceipt("https://sol.example", txSol, solPayer, timestamp, PRICE_ATOMIC)).toBe(timestamp);
  });
  it("rejects a Solana transfer that does not credit the collector", async () => {
    const receipt = solanaRpc();
    receipt.meta.postTokenBalances[1].uiTokenAmount.amount = "0";
    await expect(verifySolanaReceipt("https://sol.example", txSol, solPayer, timestamp, PRICE_ATOMIC)).rejects.toThrow();
  });
  it("rejects a Solana transfer with a different authority", async () => {
    const receipt = solanaRpc();
    receipt.transaction.message.instructions[0].parsed.info.authority = SOLANA_COLLECTOR;
    await expect(verifySolanaReceipt("https://sol.example", txSol, solPayer, timestamp, PRICE_ATOMIC)).rejects.toThrow();
  });
  it("requires wallet proof and an active entitlement before a premium export", async () => {
    const env = { REQUEST_RATE_LIMITER: { limit: async () => ({ success: true }) } };
    expect((await app.request("/machine/human/confirm", { method: "POST", body: JSON.stringify({ tx: txBase }) }, env)).status).toBe(401);
    expect((await app.request("/machine/human/blueprint", { method: "POST", body: "{}" }, env)).status).toBe(401);
    expect((await app.request("/machine/human/subscription", {}, {})).status).toBe(200);
    expect((await app.request("/pay", {}, {})).status).toBe(200);
    expect((await app.request("/human/studio", {}, {})).status).toBe(200);
    expect((await app.request("/app.js", {}, {})).status).toBe(200);
  });
  it("normalizes wallet identity and binds challenges to the domain", () => {
    expect(normalizedWallet("base", basePayer.toUpperCase().replace("0X", "0x"))).toBe(basePayer);
    expect(normalizedWallet("solana", solPayer)).toBe(solPayer);
    expect(normalizedWallet("solana", "not-a-key")).toBeNull();
    expect(challengeMessage("base", basePayer, "nonce", 1)).toContain("BuildAWallet.xyz");
  });
  it("uses the service binding for the builder catalog", async () => {
    const fetch = vi.fn(async (request: Request) => new Response(JSON.stringify({ url: request.url })));
    const result = await app.request("/machine/human/catalog", {}, { HUMAN_API: { fetch } });
    expect(result.status).toBe(200);
    expect((await result.json() as { url: string }).url).toBe("https://buildawallet.xyz/api/catalog");
    const wallet = await app.request("/machine/human/wallet/abcdefghjkmnpqrstuvwxyz234", {}, { HUMAN_API: { fetch } });
    expect(wallet.status).toBe(200);
    expect((await wallet.json() as { url: string }).url).toContain("/api/wallet/");
  });
});
