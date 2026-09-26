import { publicPlans } from "./plans";

const response = (description: string, schema: object = { type: "object" }) => ({ description,
  content: { "application/json": { schema } } });
const errorResponses = {
  "400": response("Invalid chain, address, signature, plan, or request body"),
  "401": response("Missing or expired wallet session or API key"),
  "402": response("Subscription required or x402 payment challenge"),
  "409": response("Pending receipt, replayed transaction, or used challenge"),
  "429": response("Rate or monthly usage limit reached"),
  "503": response("D1, rate limiter, service binding, or mainnet RPC unavailable"),
};
const pathParam = (name: string, description: string) => ({ name, in: "path", required: true,
  description, schema: { type: "string" } });
const secured = (summary: string, description: string, parameters: any[]) => ({ tags: ["Subscription API"],
  summary, description, security: [{ ApiKey: [] }], parameters,
  responses: { "200": response("Read-only mainnet data; one API unit consumed", { oneOf: [
    { $ref: "#/components/schemas/WalletSnapshot" }, { $ref: "#/components/schemas/UsdcBalance" },
    { $ref: "#/components/schemas/TransactionStatus" },
  ] }), ...errorResponses } });
const apiPaths: Record<string, object> = {};
for (const chain of ["base", "solana"]) {
  apiPaths[`/machine/v1/${chain}/wallet/{address}`] = { get: secured(`${chain} native wallet snapshot`,
    `Public ${chain} mainnet native balance and chain position. No signing or custody.`,
    [pathParam("address", `${chain} public wallet address`)]) };
  apiPaths[`/machine/v1/${chain}/usdc/{address}`] = { get: secured(`${chain} USDC balance`,
    `Public native USDC token balance on ${chain} mainnet (6 decimals).`,
    [pathParam("address", `${chain} public wallet address`)]) };
  apiPaths[`/machine/v1/${chain}/transaction/{tx}`] = { get: secured(`${chain} transaction status`,
    `Public receipt or signature status. An unknown transaction returns found=false; no submission occurs.`,
    [pathParam("tx", `${chain} transaction hash or signature`)]) };
}

export const openapi = {
  openapi: "3.1.0",
  info: { title: "BuildAWallet mainnet read API", version: "1.0.0",
    description: `Read-only Base and Solana mainnet data for people and agents. Three manual 30-day plans include the premium HUMAN wallet blueprint and a shared API quota. Subscribe with a wallet signature and exact USDC transfer, then issue a bearer API key. The per-request x402 endpoints remain available separately. No private keys, wallet custody, transaction submission, swap, or signing service is offered.`,
    contact: { url: "https://buildawallet.xyz/pay" } },
  servers: [{ url: "https://buildawallet.xyz", description: "Mainnet production" }],
  tags: [
    { name: "Discovery", description: "Public machine-readable service information" },
    { name: "Wallet subscription", description: "Sign a wallet message, pay exact USDC, verify onchain receipt, manage API key" },
    { name: "Subscription API", description: "Bearer key and metered, read-only mainnet data" },
    { name: "Pay per request", description: "x402 HTTP 402 USDC challenge on either Base or Solana" },
  ],
  "x-buildawallet-plans": publicPlans(),
  "x-mcp-server": "https://buildawallet.xyz/mcp",
  paths: {
    "/machine/info": { get: { tags: ["Discovery"], summary: "Capabilities and configured networks",
      responses: { "200": response("Service information") } } },
    "/machine/human/subscription": { get: { tags: ["Wallet subscription"], summary: "Prices and collector details",
      description: "Always check available=true and read current collectors before paying. Prices are exact native USDC on the chosen network; renewals are manual.",
      responses: { "200": response("Plans, token mints/contracts and official collector wallets") } } },
    "/machine/human/challenge": { post: { tags: ["Wallet subscription"], summary: "Request a one-use login challenge",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["chain", "wallet"],
        properties: { chain: { enum: ["base", "solana"] }, wallet: { type: "string" } } } } } },
      responses: { "200": response("Exact message and nonce; sign the message, not a transaction"), ...errorResponses } } },
    "/machine/human/login": { post: { tags: ["Wallet subscription"], summary: "Exchange signature for a wallet session",
      description: "Base uses personal_sign; Solana signs the UTF-8 challenge with Ed25519, signature encoded in base64. Session token expires after 30 days.",
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["nonce", "signature"],
        properties: { nonce: { type: "string", pattern: "^[0-9a-f]{64}$" }, signature: { type: "string" } } } } } },
      responses: { "200": response("Bearer wallet session token"), ...errorResponses } } },
    "/machine/human/confirm": { post: { tags: ["Wallet subscription"], summary: "Verify exact onchain payment and unlock",
      description: "Requires a wallet session from the paying wallet. The receipt must be confirmed, sent from that wallet, in native USDC, to the configured chain collector, for the selected plan's exact amount, and unused. Verification does not initiate a payment. Reusing a transaction is rejected.",
      security: [{ WalletSession: [] }],
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["plan", "tx"],
        properties: { plan: { enum: ["builder", "pro", "scale"] }, tx: { type: "string" } } } } } },
      responses: { "200": response("Paid plan and expiration"), ...errorResponses } } },
    "/machine/human/status": { get: { tags: ["Wallet subscription"], summary: "Wallet plan status",
      security: [{ WalletSession: [] }], responses: { "200": response("Plan, expiry and API key existence"), ...errorResponses } } },
    "/machine/human/api-key": { post: { tags: ["Wallet subscription"], summary: "Issue or rotate API key",
      description: "Requires an active plan. The key is returned once; save it securely. Rotating immediately revokes the previous key. API keys are stored as SHA-256 hashes.",
      security: [{ WalletSession: [] }], responses: { "200": response("One-time API key; never returned again"), ...errorResponses } },
      delete: { tags: ["Wallet subscription"], summary: "Revoke API key", security: [{ WalletSession: [] }],
        responses: { "200": response("Revoked"), ...errorResponses } } },
    "/machine/human/blueprint": { post: { tags: ["Wallet subscription"], summary: "Premium HUMAN design blueprint",
      description: "Returns a staged implementation design based on your saved spec. It is a planning document, not wallet code.",
      security: [{ WalletSession: [] }], requestBody: { required: true, content: { "application/json": {
        schema: { type: "object", properties: { spec: { type: "object", additionalProperties: true } }, required: ["spec"] } } } },
      responses: { "200": response("Implementation blueprint"), ...errorResponses } } },
    "/machine/v1/usage": { get: { tags: ["Subscription API"], summary: "Quota and renewal window",
      security: [{ ApiKey: [] }], responses: { "200": response("Used and remaining units; no unit charged"), ...errorResponses } } },
    ...apiPaths,
    "/machine/v1/batch": { post: { tags: ["Subscription API"], summary: "Batch wallet and USDC balances",
      description: "Pro supports at most 10 queries, Scale at most 50. Builder does not include batching. Each successful query costs one API unit; the batch is all-or-nothing for metering. Invalid input and upstream failure do not consume units.",
      security: [{ ApiKey: [] }], requestBody: { required: true, content: { "application/json": {
        schema: { type: "object", required: ["queries"], properties: { queries: { type: "array", minItems: 1, maxItems: 50,
          items: { type: "object", required: ["chain", "kind", "address"], properties: {
            chain: { enum: ["base", "solana"] }, kind: { enum: ["wallet", "usdc"] }, address: { type: "string" } } } } } },
        example: { queries: [{ chain: "base", kind: "wallet", address: "0xBcCA6AED433d9020C50D44560F9679F1B5eB511d" }] } } } },
      responses: { "200": response("Ordered results and units used"), ...errorResponses } } },
    "/machine/wallet": { get: { tags: ["Pay per request"], summary: "x402 Base native wallet snapshot",
      description: "$0.01 USDC via Base or Solana x402 exact scheme. HTTP 402 provides payment requirements; retry with payment signature. RPC snapshot is fetched before payment challenge.",
      parameters: [{ name: "address", in: "query", required: true, schema: { type: "string" } }],
      responses: { "200": response("Paid Base snapshot"), ...errorResponses } } },
    "/machine/solana-wallet": { get: { tags: ["Pay per request"], summary: "x402 Solana SOL snapshot",
      description: "$0.01 USDC via Base or Solana x402 exact scheme. HTTP 402 provides payment requirements.",
      parameters: [{ name: "address", in: "query", required: true, schema: { type: "string" } }],
      responses: { "200": response("Paid Solana snapshot"), ...errorResponses } } },
  },
  components: { securitySchemes: {
    ApiKey: { type: "http", scheme: "bearer", bearerFormat: "baw_live_ API key", description: "Issue via wallet session after payment" },
    WalletSession: { type: "http", scheme: "bearer", description: "One-use wallet signature login session" },
  }, schemas: {
    WalletSnapshot: { type: "object", properties: { chain: { type: "string" }, address: { type: "string" },
      balanceWei: { type: "string" }, balanceEth: { type: "string" }, balanceLamports: { type: "string" },
      balanceSol: { type: "string" }, transactionCount: { type: "integer" }, blockNumber: { type: "integer" }, slot: { type: "integer" } } },
    UsdcBalance: { type: "object", required: ["chain", "address", "token", "balanceAtomic", "balanceUSDC"], properties: {
      chain: { enum: ["base", "solana"] }, address: { type: "string" }, token: { type: "string" },
      symbol: { const: "USDC" }, decimals: { const: 6 }, balanceAtomic: { type: "string" }, balanceUSDC: { type: "string" } } },
    TransactionStatus: { type: "object", properties: { chain: { enum: ["base", "solana"] }, tx: { type: "string" },
      found: { type: "boolean" }, success: { type: "boolean" }, blockNumber: { type: "integer" },
      slot: { type: "integer" }, confirmationStatus: { type: "string" }, explorer: { type: "string", format: "uri" } } },
  } },
} as const;

export const swaggerHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BuildAWallet API reference</title><link rel="stylesheet" href="/api-docs/swagger-ui.css"><style>body{margin:0;background:#f7fbf7;color:#12231a;font:16px system-ui}header{background:#092113;color:#e7ffdd;padding:20px 5%}header a{color:#9cf391;margin-right:20px}header h1{margin:10px 0 0}main{max-width:1100px;margin:20px auto;padding:0 20px}.intro{padding:24px;background:#e8f7e4;border-radius:16px}.intro code{word-break:break-all}#swagger-ui{margin-top:24px}</style></head><body><header><a href="/">BuildAWallet</a><a href="/pay">Plans</a><a href="/machine/openapi.json">OpenAPI JSON</a><h1>Mainnet API reference</h1></header><main><div class="intro"><p>Read-only Base and Solana wallet data. Builder $12 / 500 calls, Pro $39 / 5,000, Scale $99 / 25,000, each for 30 days with the premium HUMAN blueprint. Pay USDC on either chain, confirm the receipt, issue an API key, then use the endpoints below. x402 pay-per-request remains $0.01 for native wallet snapshots.</p><p>Example: <code>curl -H &quot;Authorization: Bearer $BAW_API_KEY&quot; https://buildawallet.xyz/machine/v1/base/usdc/0xBcCA6AED433d9020C50D44560F9679F1B5eB511d</code></p><p>MCP endpoint: <code>https://buildawallet.xyz/mcp</code> (same API key). The API observes public chain state. It does not sign or submit transactions.</p></div><div id="swagger-ui"><p>Loading Swagger UI... You can also read the <a href="/machine/openapi.json">OpenAPI JSON</a>.</p></div></main><script src="/api-docs/swagger-ui-bundle.js"></script><script>if(window.SwaggerUIBundle)SwaggerUIBundle({url:'/machine/openapi.json',dom_id:'#swagger-ui',deepLinking:true,displayRequestDuration:true,persistAuthorization:false});</script></body></html>`;
