import { publicPlans } from "./plans";

const response = (description: string, schema: object = { type: "object" }) => ({ description,
  content: { "application/json": { schema } } });
const errorResponses = {
  "400": response("Invalid chain, address, transaction, plan, or request body"),
  "401": response("Missing or expired wallet session or API key"),
  "402": response("Subscription required or x402 payment challenge"),
  "409": response("Pending receipt, replayed transaction, or used challenge"),
  "429": response("Rate or monthly usage limit reached"),
  "503": response("D1, rate limiter, service binding, or mainnet RPC unavailable"),
};
const pathParam = (name: string, description: string) => ({ name, in: "path", required: true,
  description, schema: { type: "string" } });
const securedRead = (summary: string, description: string, parameters: any[]) => ({ tags: ["Subscription API"],
  summary, description, security: [{ ApiKey: [] }], parameters,
  responses: { "200": response("Mainnet data; one API unit consumed"), ...errorResponses } });
const txBody = (chain: "base" | "solana") => ({ required: true, content: { "application/json": { schema: {
  type: "object", required: ["from", "to", "asset", "amountAtomic"], properties: {
    from: { type: "string" }, to: { type: "string" }, asset: { enum: ["native", "usdc"] },
    amountAtomic: { type: "string", pattern: "^[0-9]+$" },
    ...(chain === "base" ? { data: { type: "string", description: "Optional even-length hex data for native Base transfers" } } : {
      sourceTokenAccount: { type: "string", description: "Required for Solana USDC" },
      destinationTokenAccount: { type: "string", description: "Required for Solana USDC" },
    }),
  },
} } } });
const apiPaths: Record<string, object> = {};
for (const chain of ["base", "solana"] as const) {
  apiPaths[`/machine/v1/${chain}/wallet/{address}`] = { get: securedRead(`${chain} native wallet snapshot`,
    `Public ${chain} mainnet native balance and chain position.`, [pathParam("address", `${chain} public wallet address`)]) };
  apiPaths[`/machine/v1/${chain}/usdc/{address}`] = { get: securedRead(`${chain} USDC balance`,
    `Public native USDC token balance on ${chain} mainnet.`, [pathParam("address", `${chain} public wallet address`)]) };
  apiPaths[`/machine/v1/${chain}/transaction/{tx}`] = { get: securedRead(`${chain} transaction status`,
    "Public receipt or signature status. An unknown transaction returns found=false.",
    [pathParam("tx", `${chain} transaction hash or signature`)]) };
  apiPaths[`/machine/v1/${chain}/snapshot/{address}`] = { get: { tags: ["Subscription API"],
    summary: `${chain} native and USDC snapshot`, description: "Two API units. Native and USDC are independent RPC reads, not an atomic snapshot.",
    security: [{ ApiKey: [] }], parameters: [pathParam("address", `${chain} public wallet address`)],
    responses: { "200": response("Composite snapshot; two units consumed"), ...errorResponses } } };
  apiPaths[`/machine/v1/${chain}/transaction/prepare`] = { post: { tags: ["Transactions"],
    summary: `Prepare ${chain} native or USDC transaction`,
    description: chain === "base" ?
      "Returns an unsigned EIP-1559 Base mainnet transaction with current nonce, gas estimate and fee fields. The caller signs locally. BuildAWallet never accepts a private key." :
      "Returns a serialized unsigned Solana legacy transaction with a zeroed signature slot. For USDC, provide source and destination token accounts. The caller signs locally. BuildAWallet never accepts a private key.",
    security: [{ ApiKey: [] }], requestBody: txBody(chain),
    responses: { "200": response("Wallet-signable transaction preparation; one API unit consumed"), ...errorResponses } } };
  apiPaths[`/machine/v1/${chain}/transaction/broadcast`] = { post: { tags: ["Transactions"],
    summary: `Broadcast already-signed ${chain} transaction`,
    description: chain === "base" ?
      "Relays raw signed EVM transaction hex using eth_sendRawTransaction. Signing is external to BuildAWallet." :
      "Relays an already-signed base64 Solana transaction using sendTransaction with preflight enabled. Signing is external to BuildAWallet.",
    security: [{ ApiKey: [] }], requestBody: { required: true, content: { "application/json": { schema: {
      type: "object", required: [chain === "base" ? "signedTransaction" : "signedTransactionBase64"], properties:
        chain === "base" ? { signedTransaction: { type: "string" } } : { signedTransactionBase64: { type: "string" } },
    } } } }, responses: { "200": response("Submitted transaction ID; one API unit consumed"), ...errorResponses } } };
}

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "BuildAWallet mainnet API",
    version: "1.2.0",
    description: "Free HUMAN wallet design and configured signed-APK release, plus paid Base and Solana machine API/MCP services. Subscribed callers can read public chain data, prepare wallet-signable native/USDC transactions, and broadcast already-signed transactions. BuildAWallet does not accept private keys, seed phrases, or sign transactions for callers.",
    contact: { url: "https://buildawallet.xyz/pay" },
  },
  servers: [{ url: "https://buildawallet.xyz", description: "Mainnet production" }],
  tags: [
    { name: "Discovery", description: "Public machine-readable service information" },
    { name: "HUMAN design", description: "Free HUMAN design and release flow" },
    { name: "Wallet subscription", description: "Wallet-authenticated USDC API subscription management" },
    { name: "Subscription API", description: "Bearer-key metered Base/Solana reads" },
    { name: "Transactions", description: "Bearer-key non-custodial preparation and signed-transaction broadcast" },
    { name: "Pay per request", description: "x402 native-wallet snapshots" },
  ],
  "x-buildawallet-plans": publicPlans(),
  "x-mcp-server": "https://buildawallet.xyz/mcp",
  paths: {
    "/machine/info": { get: { tags: ["Discovery"], summary: "Capabilities and configured networks", responses: { "200": response("Service information") } } },
    "/machine/quote": { get: { tags: ["Discovery"], summary: "Free read price and API-unit quote",
      parameters: ["chain", "kind", "access"].map(name => ({ name, in: "query", required: true, schema: { type: "string" } })),
      responses: { "200": response("Supported resource quote"), "400": errorResponses["400"] } } },
    "/machine/human/subscription": { get: { tags: ["Wallet subscription"], summary: "Current API plans and collectors",
      responses: { "200": response("Plans, token contracts/mints and collectors") } } },
    "/machine/human/challenge": { post: { tags: ["Wallet subscription"], summary: "Request one-use login challenge",
      responses: { "200": response("Message and nonce"), ...errorResponses } } },
    "/machine/human/login": { post: { tags: ["Wallet subscription"], summary: "Exchange wallet signature for session",
      responses: { "200": response("Wallet session token"), ...errorResponses } } },
    "/machine/human/confirm": { post: { tags: ["Wallet subscription"], summary: "Verify exact onchain API-plan payment",
      security: [{ WalletSession: [] }], responses: { "200": response("Paid plan and expiration"), ...errorResponses } } },
    "/machine/human/status": { get: { tags: ["Wallet subscription"], summary: "Wallet plan status", security: [{ WalletSession: [] }],
      responses: { "200": response("Plan status"), ...errorResponses } } },
    "/machine/human/payments": { get: { tags: ["Wallet subscription"], summary: "Verified API subscription payments", security: [{ WalletSession: [] }],
      responses: { "200": response("Payment history"), ...errorResponses } } },
    "/machine/human/api-key": { post: { tags: ["Wallet subscription"], summary: "Issue or rotate API key", security: [{ WalletSession: [] }],
      responses: { "200": response("One-time API key"), ...errorResponses } },
      delete: { tags: ["Wallet subscription"], summary: "Revoke API key", security: [{ WalletSession: [] }], responses: { "200": response("Revoked"), ...errorResponses } } },
    "/machine/human/blueprint": { post: { tags: ["HUMAN design"], summary: "Free HUMAN implementation blueprint",
      security: [{ AccessSession: [] }], responses: { "200": response("Implementation blueprint"), ...errorResponses } } },
    "/human/account": { get: { tags: ["HUMAN design"], summary: "Verified HUMAN account bootstrap", security: [{ AccessSession: [] }],
      responses: { "200": response("Verified account"), "403": response("Cloudflare Access sign-in required"), "503": response("Account storage unavailable") } } },
    "/machine/v1/usage": { get: { tags: ["Subscription API"], summary: "Quota and renewal window", security: [{ ApiKey: [] }],
      responses: { "200": response("Used and remaining units; no unit charged"), ...errorResponses } } },
    ...apiPaths,
    "/machine/v1/batch": { post: { tags: ["Subscription API"], summary: "Batch wallet and USDC reads", security: [{ ApiKey: [] }],
      responses: { "200": response("Ordered results and units used"), ...errorResponses } } },
    "/machine/wallet": { get: { tags: ["Pay per request"], summary: "x402 Base native wallet snapshot", responses: { "200": response("Paid Base snapshot"), ...errorResponses } } },
    "/machine/solana-wallet": { get: { tags: ["Pay per request"], summary: "x402 Solana native wallet snapshot", responses: { "200": response("Paid Solana snapshot"), ...errorResponses } } },
  },
  components: { securitySchemes: {
    ApiKey: { type: "http", scheme: "bearer", bearerFormat: "baw_live_ API key", description: "Paid machine API key" },
    WalletSession: { type: "http", scheme: "bearer", description: "Wallet-signature login session" },
    AccessSession: { type: "apiKey", in: "cookie", name: "CF_Authorization", description: "Cloudflare Access HUMAN session" },
  } },
} as const;

export const swaggerHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BuildAWallet API reference</title><link rel="stylesheet" href="/api-docs/swagger-ui.css"><style>body{margin:0;background:#f7fbf7;color:#12231a;font:16px system-ui}header{background:#092113;color:#e7ffdd;padding:20px 5%}header a{color:#9cf391;margin-right:20px}header h1{margin:10px 0 0}main{max-width:1100px;margin:20px auto;padding:0 20px}.intro{padding:24px;background:#e8f7e4;border-radius:16px}code{word-break:break-all}</style></head><body><header><a href="/">BuildAWallet</a><a href="/pay">Machine API plans</a><a href="/machine/openapi.json">OpenAPI JSON</a><h1>Mainnet API reference</h1></header><main><div class="intro"><p>HUMAN wallet creation and configured Android release are free. Paid plans cover machine API/MCP usage. Base and Solana callers can read public data, prepare wallet-signable native or USDC transactions, and broadcast already-signed transactions. Private keys and seed phrases never belong in this API.</p><p>Example read: <code>curl -H &quot;Authorization: Bearer $BAW_API_KEY&quot; https://buildawallet.xyz/machine/v1/base/snapshot/0xBcCA6AED433d9020C50D44560F9679F1B5eB511d</code></p></div><div id="swagger-ui"><p>Loading Swagger UI...</p></div></main><script src="/api-docs/swagger-ui-bundle.js"></script><script>if(window.SwaggerUIBundle)SwaggerUIBundle({url:'/machine/openapi.json',dom_id:'#swagger-ui',deepLinking:true,displayRequestDuration:true,persistAuthorization:false});</script></body></html>`;
