import { Hono } from "hono";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { validAddress, walletSnapshot } from "./rpc";
import { solanaWalletSnapshot, validSolanaAddress } from "./solana";
import human from "./subscription";
import pages from "./human-pages";
import api from "./api";
import { handleMcp } from "./mcp";
import { openapi, swaggerHtml } from "./openapi";
import { publicPlans } from "./plans";

export interface Env {
  AI?: {
    run(
      model: string,
      input: unknown,
      options?: unknown
    ): Promise<unknown>;
  };
  BASE_RPC_URL?: string;
  SOLANA_RPC_URL?: string;
  REQUEST_RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  DB?: D1Database;
  HUMAN_API?: { fetch(request: Request): Promise<Response> };
}

type Snapshot = Awaited<ReturnType<typeof walletSnapshot>> | Awaited<ReturnType<typeof solanaWalletSnapshot>>;
const app = new Hono<{ Bindings: Env; Variables: { snapshot: Snapshot } }>();

for (const [path, html] of Object.entries(pages.html)) {
  app.get(path, (c) => c.html(html, 200, { "Cache-Control": "no-store" }));
}
app.get("/app.js", (c) => c.body(pages.script, 200, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" }));
app.get("/human.css", (c) => c.body(pages.style, 200, {
  "Content-Type": "text/css; charset=utf-8",
  "Cache-Control": "no-store",
}));

app.post("/machine/ai/chat", async (c) => {
  if (!c.env?.AI) {
    return c.json({ error: "AI service is not configured" }, 503);
  }

  if (c.env.REQUEST_RATE_LIMITER) {
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const result = await c.env.REQUEST_RATE_LIMITER.limit({
      key: `human-ai:${ip}`,
    });

    if (!result.success) {
      return c.json(
        { error: "AI request rate limit exceeded" },
        429,
        { "Retry-After": "60" },
      );
    }
  }

  let body: {
    messages?: Array<{
      role?: string;
      content?: string;
    }>;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "valid JSON body required" }, 400);
  }

  const supplied = Array.isArray(body.messages)
    ? body.messages
    : [];

  const cleaned = supplied
    .slice(-10)
    .map((message) => ({
      role:
        message.role === "assistant"
          ? "assistant"
          : "user",
      content: String(message.content ?? "")
        .trim()
        .slice(0, 1400),
    }))
    .filter((message) => message.content);

  if (!cleaned.length) {
    return c.json({ error: "message required" }, 400);
  }

  const system = {
    role: "system",
    content:
      "You are Build-a-Wallet's Wallet Architect AI. " +
      "Help users DESIGN human-controlled cryptocurrency wallets. " +
      "You are an architecture and product-design assistant, not a wallet signer or custodian. " +

      "Be concise, practical, technically accurate and security-first. " +
      "Discuss networks, custody models, hardware wallets, backups, recovery, authentication, privacy, UX and product features. " +

      "NEVER ask for, accept, reconstruct, repeat or encourage sharing seed phrases, private keys, passwords, recovery secrets, API keys or authentication tokens. " +
      "Never suggest pasting private keys or recovery phrases into a website, AI system or cloud service. " +

      "Do not recommend exporting raw private keys as a normal wallet feature. " +
      "Prefer standard mnemonic backup, hardware-wallet signing, watch-only architecture, descriptors and well-established recovery mechanisms when appropriate. " +
      "Do not recommend Shamir Secret Sharing unless the user specifically asks for split-backup or advanced recovery. " +

      "Do not invent blockchain privacy features. " +
      "For example, do not claim Litecoin uses RingCT. " +
      "Do not describe an authentication device such as a YubiKey as a Bitcoin or Litecoin transaction-signing hardware wallet unless discussing a separate authentication role. " +

      "Distinguish clearly between a product IDEA, a recommended architecture and something that is actually implemented. " +
      "Do not claim Build-a-Wallet has implemented custody, signing, swaps, bridges or transaction execution unless the current product explicitly provides it. " +

      "When recommending Bitcoin-family wallet architecture, prefer widely adopted standards and interoperable approaches rather than custom cryptography. " +
      "When suggesting hardware wallets, examples may include Ledger, Trezor, Coldcard or other chain-compatible signing devices, but avoid endorsements. " +

      "If a request could create meaningful security risk, explain the safer architecture instead of maximizing convenience. " +

      "When useful, end with a short proposed wallet blueprint containing: Networks, Custody, Security, Recovery and Features. " +
      "You may suggest the guided builder at /human/build."
  };
  try {
    const result = await c.env.AI.run(
      "@cf/meta/llama-3.1-8b-instruct-fast",
      {
        messages: [system, ...cleaned],
        max_tokens: 650,
      },
      {
        gateway: {
          id: "default",
          skipCache: true,
        },
      },
    );

    const candidate = result as {
      response?: unknown;
      result?: {
        response?: unknown;
      };
    };

    const response =
      typeof candidate?.response === "string"
        ? candidate.response
        : typeof candidate?.result?.response === "string"
          ? candidate.result.response
          : "";

    if (!response.trim()) {
      return c.json(
        { error: "AI returned an empty response" },
        502,
      );
    }

    return c.json({
      response: response.trim(),
      model: "@cf/meta/llama-3.1-8b-instruct-fast",
    });

  } catch (error) {
    console.error("Workers AI chat failed", error);

    return c.json(
      { error: "AI service temporarily unavailable" },
      503,
    );
  }
});

app.get("/machine/openapi.json", (c) => c.json(openapi));
app.get("/openapi.json", (c) => c.json(openapi));
app.get("/api-docs", (c) => c.html(swaggerHtml));
app.get("/docs/api", (c) => c.html(swaggerHtml));
app.get("/.well-known/agent.json", (c) => c.json({ name: "BuildAWallet", homepage: "https://buildawallet.xyz/",
  description: "Read-only Base and Solana mainnet wallet data; no signing or custody",
  openapi: "https://buildawallet.xyz/machine/openapi.json", mcp: "https://buildawallet.xyz/mcp",
  capabilities: ["wallet balances", "USDC balances", "transaction status", "premium wallet design blueprint"],
  payments: { subscriptions: "https://buildawallet.xyz/machine/human/subscription", x402: "https://buildawallet.xyz/machine/info" } }));
app.get("/agent-offer.json", (c) => c.json({ name: "BuildAWallet", version: "1.0.0", plans: publicPlans(),
  api: "https://buildawallet.xyz/machine/openapi.json", mcp: "https://buildawallet.xyz/mcp",
  payPerCall: ["https://buildawallet.xyz/machine/wallet", "https://buildawallet.xyz/machine/solana-wallet"],
  paymentProtocol: "x402", supportedPaymentNetworks: ["eip155:8453", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
  custody: false, signing: false }));
app.get("/llms.txt", (c) => c.text(`# BuildAWallet\nRead-only Base and Solana mainnet wallet data and a premium HUMAN wallet design blueprint.\nOpenAPI: https://buildawallet.xyz/machine/openapi.json\nMCP (API key required for calls): https://buildawallet.xyz/mcp\nPlans and wallet payment: https://buildawallet.xyz/pay\nx402 pay-per-request: https://buildawallet.xyz/machine/info\nNo custody, key management, signing or transaction submission.\n`));
app.all("/mcp", (c) => handleMcp(c.req.raw, c.env, async (request) => app.fetch(request, c.env)));
export const SOLANA_COLLECTOR = "Ew8mbrKwD6LGaSX28a6XGmXqeQSs2hykRibjXVhftTRC";
export const BASE_COLLECTOR = "0xBcCA6AED433d9020C50D44560F9679F1B5eB511d";
export const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
export const BASE_MAINNET = "eip155:8453";
const facilitator = new HTTPFacilitatorClient({ url: "https://facilitator.payai.network" });
const resourceServer = new x402ResourceServer(facilitator);
resourceServer.register(SOLANA_MAINNET, new ExactSvmScheme());
resourceServer.register(BASE_MAINNET, new ExactEvmScheme());

app.get("/machine/info", (c) => c.json({
  name: "BuildAWallet machine services",
  status: "read-only mainnet data; check configuredNetworks before use",
  configuredNetworks: {
    base: Boolean(c.env?.BASE_RPC_URL && c.env?.REQUEST_RATE_LIMITER),
    solana: Boolean(c.env?.SOLANA_RPC_URL && c.env?.REQUEST_RATE_LIMITER),
  },
  paidEndpoints: ["/machine/wallet?address=0x...", "/machine/solana-wallet?address=..."],
  subscriptionApi: "/machine/v1/usage",
  documentation: "/machine/openapi.json",
  mcp: "/mcp",
  plans: publicPlans(),
  price: "$0.01 USDC per request",
  paymentOptions: [
    { network: "base", collector: BASE_COLLECTOR },
    { network: "solana", collector: SOLANA_COLLECTOR },
  ],
  capabilities: ["read-only Base native balance and transaction count", "read-only Solana SOL balance"],
  custody: false,
}));

const routeConfig: Parameters<typeof paymentMiddleware>[0] = {
  "GET /machine/wallet": {
    accepts: [
      { scheme: "exact", price: "$0.01", network: BASE_MAINNET, payTo: BASE_COLLECTOR },
      { scheme: "exact", price: "$0.01", network: SOLANA_MAINNET, payTo: SOLANA_COLLECTOR },
    ],
    description: "Base mainnet native balance, transaction count and block number",
    mimeType: "application/json",
  },
  "GET /machine/solana-wallet": {
    accepts: [
      { scheme: "exact", price: "$0.01", network: BASE_MAINNET, payTo: BASE_COLLECTOR },
      { scheme: "exact", price: "$0.01", network: SOLANA_MAINNET, payTo: SOLANA_COLLECTOR },
    ],
    description: "Solana mainnet SOL balance and slot",
    mimeType: "application/json",
  },
};

// Validate and obtain data before the challenge. A failed lookup never incurs a payment.
app.use("/machine/wallet", async (c, next) => {
  const address = c.req.query("address");
  if (!validAddress(address)) return c.json({ error: "valid EVM address required" }, 400);
  if (!c.env?.BASE_RPC_URL || !c.env.REQUEST_RATE_LIMITER) {
    return c.json({ error: "payment service is not configured" }, 503);
  }
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { success } = await c.env.REQUEST_RATE_LIMITER.limit({ key: `machine-wallet:${ip}` });
  if (!success) return c.json({ error: "request rate limit exceeded" }, 429, { "Retry-After": "60" });
  try {
    // Fetch the whole result before asking for payment so an RPC error cannot charge a buyer.
    c.set("snapshot", await walletSnapshot(c.env.BASE_RPC_URL, address));
  } catch {
    return c.json({ error: "Base mainnet RPC unavailable or misconfigured" }, 503);
  }
  return paymentMiddleware(routeConfig, resourceServer)(c, next);
});

app.get("/machine/wallet", (c) => c.json(c.get("snapshot")));

app.use("/machine/solana-wallet", async (c, next) => {
  const address = c.req.query("address");
  if (!validSolanaAddress(address)) return c.json({ error: "valid Solana address required" }, 400);
  if (!c.env?.SOLANA_RPC_URL || !c.env.REQUEST_RATE_LIMITER) {
    return c.json({ error: "payment service is not configured" }, 503);
  }
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { success } = await c.env.REQUEST_RATE_LIMITER.limit({ key: `solana-wallet:${ip}` });
  if (!success) return c.json({ error: "request rate limit exceeded" }, 429, { "Retry-After": "60" });
  try {
    c.set("snapshot", await solanaWalletSnapshot(c.env.SOLANA_RPC_URL, address));
  } catch {
    return c.json({ error: "Solana mainnet RPC unavailable or misconfigured" }, 503);
  }
  return paymentMiddleware(routeConfig, resourceServer)(c, next);
});

app.get("/machine/solana-wallet", (c) => c.json(c.get("snapshot")));

app.route("/machine/human", human);
app.route("/machine/v1", api);

export default app;
