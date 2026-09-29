import { createMcpHandler } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Env } from "./index";
import { quote, type Chain, type ReadKind, type AccessMode } from "./offer";

const base = "https://buildawallet.xyz";
const readResult = { chain: z.string() };
const transactionResult = { chain: z.string(), tx: z.string(), found: z.boolean() };
const snapshotResult = { chain: z.string(), address: z.string(), native: z.record(z.string(), z.unknown()),
  usdc: z.record(z.string(), z.unknown()), units: z.number(), observedAt: z.string(),
  context: z.record(z.string(), z.unknown()) };
const genericResult = { chain: z.string() };
const readonly = { readOnlyHint: true, idempotentHint: true, openWorldHint: true };
const prepareOnly = { readOnlyHint: true, idempotentHint: false, openWorldHint: true };
const broadcast = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };

function result(data: unknown) {
  const value = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : { value: data };
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: value };
}
function error(status: number, data: unknown) {
  return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ status, error: data }) }] };
}
function decodeHeader(value: string | null): Record<string, unknown> | null {
  if (!value || value.length > 16000) return null;
  try {
    const data: unknown = JSON.parse(atob(value));
    return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
  } catch { return null; }
}

export async function handleMcp(request: Request, env: Env, forward: (request: Request) => Promise<Response>) {
  const server = new McpServer({ name: "buildawallet", version: "1.2.0" });
  const clientIp = request.headers.get("CF-Connecting-IP");
  const invoke = async (path: string, body?: Record<string, unknown>) => {
    const headers = new Headers({ Authorization: request.headers.get("Authorization") ?? "" });
    if (clientIp) headers.set("CF-Connecting-IP", clientIp);
    if (body) headers.set("Content-Type", "application/json");
    const response = await forward(new Request(`${base}/machine/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }));
    const data = await response.json().catch(() => ({ error: "API response unavailable" }));
    return response.ok ? result(data) : error(response.status, data);
  };

  server.registerTool("service_quote", { title: "Price and access quote", description:
    "Free price and API-unit quote for one BuildAWallet read. x402 quotes require the live HTTP 402 challenge before payment.",
    annotations: readonly, inputSchema: { chain: z.enum(["base", "solana"]),
      kind: z.enum(["wallet", "usdc", "transaction", "snapshot"]), access: z.enum(["x402", "subscription"]) },
    outputSchema: { chain: z.string(), network: z.string(), kind: z.string(), access: z.string() } },
    ({ chain, kind, access }) => {
      const offered = quote(chain as Chain, kind as ReadKind, access as AccessMode);
      return offered ? result(offered) : error(400, "Only native wallet snapshots support x402 pay per call");
    });
  server.registerTool("api_usage", { title: "API quota", description:
    "Check remaining subscription units and expiry. Requires a bearer API key; consumes no units.",
    annotations: readonly, inputSchema: {}, outputSchema: { plan: z.string(), quota: z.number(),
      used: z.number(), remaining: z.number() } }, () => invoke("usage"));

  for (const chain of ["base", "solana"] as const) {
    server.registerTool(`${chain}_wallet`, { title: `${chain} wallet`,
      description: `Read native balance and chain progress on ${chain} mainnet. One subscribed API unit.`,
      annotations: readonly, inputSchema: { address: z.string().describe("Public wallet address") }, outputSchema: readResult },
      ({ address }) => invoke(`${chain}/wallet/${encodeURIComponent(address)}`));
    server.registerTool(`${chain}_usdc`, { title: `${chain} USDC balance`,
      description: `Read native USDC balance for a public ${chain} wallet. One subscribed API unit.`,
      annotations: readonly, inputSchema: { address: z.string().describe("Public wallet address") }, outputSchema: readResult },
      ({ address }) => invoke(`${chain}/usdc/${encodeURIComponent(address)}`));
    server.registerTool(`${chain}_transaction`, { title: `${chain} transaction status`,
      description: `Look up a public ${chain} transaction status. One subscribed API unit.`,
      annotations: readonly, inputSchema: { tx: z.string().describe("Transaction hash or signature") }, outputSchema: transactionResult },
      ({ tx }) => invoke(`${chain}/transaction/${encodeURIComponent(tx)}`));
    server.registerTool(`${chain}_snapshot`, { title: `${chain} account snapshot`,
      description: `Native and USDC balances with separate RPC context for ${chain}. Two subscribed API units, including Starter. Reads are not atomic.`,
      annotations: readonly, inputSchema: { address: z.string().describe("Public wallet address") }, outputSchema: snapshotResult },
      ({ address }) => invoke(`${chain}/snapshot/${encodeURIComponent(address)}`));

    server.registerTool(`${chain}_prepare_transaction`, { title: `${chain} prepare transaction`,
      description: `Prepare a non-custodial ${chain} mainnet native or USDC transaction. One API unit. BuildAWallet never receives a private key and does not sign.`,
      annotations: prepareOnly,
      inputSchema: chain === "base" ? {
        from: z.string(), to: z.string(), asset: z.enum(["native", "usdc"]), amountAtomic: z.string(), data: z.string().optional(),
      } : {
        from: z.string(), to: z.string(), asset: z.enum(["native", "usdc"]), amountAtomic: z.string(),
        sourceTokenAccount: z.string().optional(), destinationTokenAccount: z.string().optional(),
      }, outputSchema: genericResult },
      (args: any) => invoke(`${chain}/transaction/prepare`, args));

    server.registerTool(`${chain}_broadcast_transaction`, { title: `${chain} broadcast signed transaction`,
      description: `Broadcast an already-signed ${chain} mainnet transaction. One API unit. BuildAWallet does not sign and never accepts a private key.`,
      annotations: broadcast,
      inputSchema: chain === "base" ? { signedTransaction: z.string() } : { signedTransactionBase64: z.string() },
      outputSchema: genericResult },
      (args: any) => invoke(`${chain}/transaction/broadcast`, args));

    server.registerTool(`${chain}_wallet_payg`, { title: `${chain} wallet, pay per call`,
      description: `Native ${chain} snapshot for $0.01 USDC on Base or Solana, through x402. No API key. The payer signs locally.`,
      annotations: readonly, inputSchema: { address: z.string().describe("Public wallet address") },
      outputSchema: readResult, _meta: { "agents-x402/paymentRequired": true, "agents-x402/priceUSD": 0.01 } },
      async ({ address }, extra) => {
        const token = (extra as any)?._meta?.["x402/payment"] ?? request.headers.get("PAYMENT-SIGNATURE");
        if (token !== undefined && token !== null && (typeof token !== "string" || token.length > 16000))
          return error(400, "Invalid payment credential");
        const path = chain === "base" ? "/machine/wallet" : "/machine/solana-wallet";
        const headers = new Headers();
        if (clientIp) headers.set("CF-Connecting-IP", clientIp);
        if (token) headers.set("PAYMENT-SIGNATURE", token);
        const response = await forward(new Request(`${base}${path}?address=${encodeURIComponent(address)}`, { headers }));
        if (response.status === 402) {
          const challenge = decodeHeader(response.headers.get("payment-required"));
          if (!challenge) return error(503, "Payment challenge unavailable");
          return { isError: true, _meta: { "x402/error": challenge },
            content: [{ type: "text" as const, text: JSON.stringify(challenge) }] };
        }
        const data = await response.json().catch(() => ({ error: "Paid resource unavailable" }));
        if (!response.ok) return error(response.status, data);
        const receipt = decodeHeader(response.headers.get("payment-response"));
        return { ...result(data), ...(receipt ? { _meta: { "x402/payment-response": receipt } } : {}) };
      });
  }
  const handler = createMcpHandler(() => server, { route: "/mcp", corsOptions: false,
    allowedHostnames: ["buildawallet.xyz", "localhost", "127.0.0.1"] });
  return handler.fetch(request);
}
