import { MACHINE_CHAINS } from "./chains";
import { BASE_COLLECTOR, BASE_MAINNET, BASE_USDC, ORIGIN, SOLANA_COLLECTOR, SOLANA_MAINNET, SOLANA_USDC, publicPlans } from "./config";
import { ENDPOINTS } from "./catalog";

const chainEnum = MACHINE_CHAINS.map((chain) => chain.id);
const chainParam = { name: "chain", in: "path", required: true, schema: { type: "string", enum: chainEnum } };
const settleParam = { name: "chain", in: "path", required: true, schema: { type: "string", enum: ["base", "solana"] } };
const addressParam = { name: "address", in: "path", required: true, schema: { type: "string" }, description: "Public address for the chosen network" };
const ok = (description: string) => ({ "200": { description, content: { "application/json": { schema: { type: "object" } } } } });
const keyed = { security: [{ bearerAuth: [] }] };
const errors = { "401": { description: "Missing or invalid API key" }, "429": { description: "Unit quota exhausted" } };
const body = (properties: Record<string, unknown>, required: string[], example: Record<string, unknown>) => ({ required: true, content: { "application/json": { schema: { type: "object", properties, required }, example } } });

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "BuildAWallet Machine API",
    version: "3.0.0",
    description: "Non-custodial multichain infrastructure for AI agents and developers. Read ten mainnets, get a wallet, prepare and broadcast locally-signed transfers. Pay per call with x402 USDC, or subscribe with a metered API key (baw_acct_ from the dashboard, or baw_live_ from a wallet-signed session). BuildAWallet never signs for callers.",
    contact: { url: `${ORIGIN}/nonhuman` },
  },
  servers: [{ url: ORIGIN }],
  externalDocs: { url: `${ORIGIN}/nonhuman`, description: "Guides for agents and humans" },
  tags: [...new Set(ENDPOINTS.map((e) => e.tag))].map((name) => ({ name })),
  paths: {
    "/machine/v1/chains": { get: { tags: ["Discovery"], summary: "Supported networks", responses: ok("Network registry") } },
    "/machine/v1/plans": { get: { tags: ["Discovery"], summary: "Plans and payment addresses", responses: ok("Plans") } },
    "/machine/v1/wallets/kit": { get: { tags: ["Agent wallets"], summary: "Local wallet kit manifest", responses: ok("Kit manifest") } },
    "/machine/v1/wallets/kit.mjs": { get: { tags: ["Agent wallets"], summary: "Download the local wallet script", responses: { "200": { description: "JavaScript module", content: { "text/javascript": {} } } } } },
    "/machine/v1/wallets/validate": { post: { tags: ["Agent wallets"], summary: "Which networks accept this address", requestBody: body({ address: { type: "string" } }, ["address"], { address: "0x0000000000000000000000000000000000000000" }), responses: ok("Validation result") } },
    "/machine/v1/wallets/generate": { post: { tags: ["Agent wallets"], summary: "Opt-in server-made wallet (phrase returned once, never stored)", requestBody: body({ acknowledgeCustodyRisk: { type: "boolean", const: true }, words: { type: "integer", enum: [12, 24] } }, ["acknowledgeCustodyRisk"], { acknowledgeCustodyRisk: true, words: 12 }), responses: { "201": { description: "Phrase and public addresses" }, "400": { description: "Risk not acknowledged" }, "429": { description: "5 per hour per client" } } } },
    "/machine/v1/usage": { get: { tags: ["Subscribed API"], ...keyed, summary: "Check API units", responses: { ...ok("Quota"), ...errors } } },
    "/machine/v1/{chain}/wallet/{address}": { get: { tags: ["Subscribed API"], ...keyed, summary: "Native balance (1 unit)", parameters: [chainParam, addressParam], responses: { ...ok("Live chain read"), ...errors } } },
    "/machine/v1/{chain}/stablecoin/{address}": { get: { tags: ["Subscribed API"], ...keyed, summary: "Stablecoin balance (1 unit)", parameters: [chainParam, addressParam], responses: { ...ok("Stablecoin read"), ...errors } } },
    "/machine/v1/{chain}/transaction/{tx}": { get: { tags: ["Subscribed API"], ...keyed, summary: "Transaction status (1 unit)", parameters: [chainParam, { name: "tx", in: "path", required: true, schema: { type: "string" } }], responses: { ...ok("Transaction status"), ...errors } } },
    "/machine/v1/{chain}/snapshot/{address}": { get: { tags: ["Subscribed API"], ...keyed, summary: "Native + stablecoin (1 unit)", parameters: [chainParam, addressParam], responses: { ...ok("Snapshot"), ...errors } } },
    "/machine/v1/portfolio/{address}": { get: { tags: ["Subscribed API"], ...keyed, summary: "Full multichain portfolio query (1 unit)", parameters: [addressParam], responses: { ...ok("Every compatible network"), ...errors } } },
    "/machine/v1/{chain}/transaction/prepare": { post: { tags: ["Transactions"], ...keyed, summary: "Build unsigned transfer (1 unit)", parameters: [settleParam], requestBody: body({ from: { type: "string" }, to: { type: "string" }, asset: { type: "string", enum: ["native", "usdc"] }, amountAtomic: { type: "string", description: "Integer amount in the asset's smallest unit (USDC 6 decimals)" } }, ["from", "to", "asset", "amountAtomic"], { from: "0x…", to: "0x…", asset: "usdc", amountAtomic: "1500000" }), responses: { ...ok("Unsigned transaction"), ...errors } } },
    "/machine/v1/{chain}/transaction/broadcast": { post: { tags: ["Transactions"], ...keyed, summary: "Broadcast locally-signed bytes (1 unit)", parameters: [settleParam], requestBody: body({ signedTransaction: { type: "string", description: "Base: 0x-hex" }, signedTransactionBase64: { type: "string", description: "Solana: base64" } }, [], { signedTransaction: "0x02f8…" }), responses: { ...ok("Broadcast hash"), ...errors } } },
    "/machine/x402/wallet": { get: { tags: ["x402"], summary: "$0.01 USDC native-balance read", parameters: [{ name: "chain", in: "query", required: true, schema: { type: "string", enum: chainEnum } }, { name: "address", in: "query", required: true, schema: { type: "string" } }, { name: "PAYMENT-SIGNATURE", in: "header", required: false, schema: { type: "string" }, description: "x402 payment payload (base64) for the retry" }], responses: { ...ok("Paid data; PAYMENT-RESPONSE header carries settlement"), "402": { description: "x402 challenge in PAYMENT-REQUIRED header" } } } },
    "/machine/v1/auth/challenge": { post: { tags: ["Wallet subscription"], summary: "One-use login message", requestBody: body({ chain: { type: "string", enum: ["base", "solana"] }, wallet: { type: "string" } }, ["chain", "wallet"], { chain: "base", wallet: "0x…" }), responses: ok("Nonce and message") } },
    "/machine/v1/auth/verify": { post: { tags: ["Wallet subscription"], summary: "Exchange signature for a session", requestBody: body({ nonce: { type: "string" }, signature: { type: "string" } }, ["nonce", "signature"], { nonce: "…", signature: "0x…" }), responses: ok("Session token") } },
    "/machine/v1/subscription": { get: { tags: ["Wallet subscription"], security: [{ sessionAuth: [] }], summary: "Session plan status", responses: ok("Status") } },
    "/machine/v1/subscription/confirm": { post: { tags: ["Wallet subscription"], security: [{ sessionAuth: [] }], summary: "Activate plan with exact USDC tx", requestBody: body({ planId: { type: "string", enum: ["builder", "pro", "scale"] }, tx: { type: "string" } }, ["planId", "tx"], { planId: "pro", tx: "0x…" }), responses: { ...ok("Unlocked"), "202": { description: "Receipt not final yet ,  retry" } } } },
    "/machine/v1/subscription/key": { post: { tags: ["Wallet subscription"], security: [{ sessionAuth: [] }], summary: "Mint API key", responses: { "201": { description: "baw_live_ key, shown once" } } }, delete: { tags: ["Wallet subscription"], security: [{ sessionAuth: [] }], summary: "Revoke API key", responses: ok("Revoked") } },
  },
  components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "baw_acct_… or baw_live_…" }, sessionAuth: { type: "http", scheme: "bearer", bearerFormat: "64-hex session token" } } },
};

export const offer = {
  name: "BuildAWallet Machine API", version: "3.0.0", description: "Wallets, multichain reads and locally-signed transactions for AI agents.",
  api: `${ORIGIN}/machine/v1`, mcp: `${ORIGIN}/mcp`, openapi: `${ORIGIN}/openapi.json`, llms: `${ORIGIN}/llms.txt`, docs: `${ORIGIN}/nonhuman`, dashboard: `${ORIGIN}/nonhuman/dashboard`,
  custody: "none by default", signing: "local-only", chains: chainEnum,
  wallets: { local: `${ORIGIN}/machine/v1/wallets/kit`, serverGenerated: { endpoint: `${ORIGIN}/machine/v1/wallets/generate`, optIn: true, stored: false } },
  plans: publicPlans(), unitCosts: Object.fromEntries(ENDPOINTS.filter((e) => e.units > 0).map((e) => [`${e.method} ${e.path}`, e.units])),
  payment: { base: { asset: BASE_USDC, collector: BASE_COLLECTOR }, solana: { asset: SOLANA_USDC, collector: SOLANA_COLLECTOR } },
  x402: { endpoint: `${ORIGIN}/machine/x402/wallet`, price: "$0.01", accepts: [{ network: BASE_MAINNET, payTo: BASE_COLLECTOR, asset: "USDC" }, { network: SOLANA_MAINNET, payTo: SOLANA_COLLECTOR, asset: "USDC" }] },
};

export const llms = `# BuildAWallet.xyz

> Non-custodial wallet software for humans and machine-native wallet + chain infrastructure for AI agents.

## For agents ,  start here
- MCP (streamable HTTP, JSON-RPC): ${ORIGIN}/mcp
- OpenAPI 3.1: ${ORIGIN}/openapi.json
- Offer manifest: ${ORIGIN}/.well-known/agent.json
- Human-readable docs: ${ORIGIN}/nonhuman

## Get a wallet
- Local (recommended, keys never leave you): GET ${ORIGIN}/machine/v1/wallets/kit then run ${ORIGIN}/machine/v1/wallets/kit.mjs
- Server-made (opt-in): POST ${ORIGIN}/machine/v1/wallets/generate {"acknowledgeCustodyRisk":true}. Phrase returned once, never stored.

## Pay
- Pay per call, no account: GET ${ORIGIN}/machine/x402/wallet?chain={chain}&address={address} → HTTP 402 → sign USDC (Base or Solana) → retry with PAYMENT-SIGNATURE. $0.01 per read.
- Subscribe: humans buy plans at ${ORIGIN}/nonhuman/dashboard (baw_acct_ keys). Agents can self-subscribe by wallet signature: POST /machine/v1/auth/challenge → /auth/verify → pay exact USDC → /subscription/confirm → /subscription/key (baw_live_ key).
- Free: 1,000 units once for every new dashboard account.
- Plans: ${publicPlans().map((p) => `${p.name} $${p.priceUSDC}/30d ${p.units} units`).join("; ")}.

## Endpoints
${ENDPOINTS.map((e) => `- ${e.method} ${e.path} ,  ${e.summary}${e.units ? ` (${e.units} unit${e.units > 1 ? "s" : ""})` : ""}`).join("\n")}

## Networks
${MACHINE_CHAINS.map((c) => `- ${c.id}: ${c.name} (${c.symbol})${c.stablecoin ? `, ${c.stablecoin.symbol}` : ""}`).join("\n")}

## Safety
BuildAWallet never asks for seed phrases or private keys, and never signs for callers. Transactions are prepared unsigned and broadcast only after you sign locally.
`;
