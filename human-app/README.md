# BuildAWallet app

The full TanStack Start app for the HUMAN wallet, machine dashboard, prepaid API and MCP service. Canonical source: `Chadd937/buildawallet`, branch `main`.

```sh
cd human-app
npm ci --legacy-peer-deps --no-audit --no-fund
npm run build
npm run typecheck
npm test
```

The app uses Cloudflare Workers and D1. Your original HUMAN login (`human_worker.py`, deployed as `buildawallet-human-api`) owns `/api/human/account` and its `/email`, `/verify` and `/logout` endpoints, email delivery, accounts and HttpOnly login cookies. The app calls that existing Worker and validates its D1 sessions directly. It does not introduce a separate authentication token or signing secret.

Production schema inspection confirmed that `buildawallet` contains the existing `human_sessions` and `human_email_accounts` tables. Both app and login bindings use that database, with `AUTH_TABLE_PREFIX=human` and `AUTH_COOKIE_NAME=baw_human_session`. `buildawallet-production` does not contain these login tables.

Byte uses the existing Cloudflare Workers AI binding and `@cf/meta/llama-3.1-8b-instruct-fast` model by default. No OpenAI key or local `.env` is required for that provider. Optional RPC settings can still go in an ignored `.env` inside `human-app`. `APP_DATABASE_NAME` defaults to the existing `buildawallet` D1 database. Only override `AUTH_DATABASE_NAME` or `AUTH_COOKIE_NAME` if the existing Login Worker actually changes. Do not commit or share secret values.

`npm run deploy` checks settings, types and tests, builds the app, resolves real D1 IDs, applies additive app migrations, uploads AI/RPC secrets, deploys `buildawallet-agent-pay` and runs HTTP smoke checks. The login tables and the Login Worker's secrets are not reset. Public settings resolve from the shell, then `.dev.vars`, then `.env`, then `wrangler.jsonc`.

See `INTEGRATION.md` for the production cutover, migration boundaries and release limitations. The production bundle is `dist/server/wrangler.json`, with assets in `dist/client`. Publish using `npm run deploy`, which verifies the account's current database IDs and applies additive app migrations first.

Use `npm run inspect:login` to print database names, table names and Login table definitions from the existing account. It reads schema metadata only and does not create, reset or migrate any table.
# Owner treasury

The private `/owner` page uses the original HUMAN verified email session and a
server-only owner identity. It is absent from public navigation, sitemap,
OpenAPI and MCP. An unconfigured owner setting or any other account receives
HTTP 404. Owner responses are private, non-cacheable and non-indexable.

On your authenticated deployment machine:

```bash
cd ~/buildawallet/human-app
npm run configure:owner
npm run deploy
```

Enter the email you use with the original HUMAN login. Setup saves only its
normalized SHA-256 identity in an ignored, mode-0600 environment file. Deployment
uploads `OWNER_EMAIL_HASH` as a Cloudflare secret. Sign in normally through
`/human/setup`, then open `https://buildawallet.xyz/owner` directly.

Collectors are configured in the authoritative payment registry: the shared EVM collector for Ethereum/Base/Arbitrum/Optimism/Polygon/BNB/Avalanche, the Solana collector, the Bitcoin collector and the Tron collector. The page reads live
USDC and ETH/SOL balances and reports current account subscriptions, agent
subscriptions and preserved legacy payments. Per-call blockchain payments are retired. Historical x402 receipts remain
visible; older unrecorded receipts are not reconstructed. Collector balances
include all on-chain activity and are separate from recorded income.

To withdraw, connect the existing collector account in an EIP-1193 Ethereum
wallet for Base or Phantom for Solana. The app reviews the address, amount and
fees; your device checks the exact transaction and your wallet signs and
broadcasts only after approval. No treasury seed phrase or private key is
accepted, stored or returned by the backend. Solana USDC withdrawals use the
configured collection token account and can create the destination's USDC
account, with its rent shown in the review. Leave ETH/SOL for fees.

This does not add a new fee, change payment destinations, create new collector
keys, or custody customer wallets. Receiving addresses and on-chain transfers
remain public. A new collector requires a separate explicit payment-routing
change after its device-held keys are backed up.

## Prepaid collection

Customers pay once for service units, then requests deduct those units in D1.
No facilitator settlement or customer wallet debit occurs per API request.
Income stays at the existing Base/Solana collectors until the owner approves
a withdrawal in `/owner`. Units are service credits, not customer custody or
a cryptocurrency balance. The current plan prices in `config.ts` are preserved.

`/nonhuman/prepaid` explains setup. Old `/nonhuman/pay-per-call` bookmarks
redirect there. Retired `/machine/x402/*` routes return HTTP 410 with prepaid
migration guidance, even if a payment signature is supplied. `wallet_payg` is
removed from MCP discovery; old callers get the same retirement guidance.

The additive `baw_0003_prepaid_plans.sql` migration aligns activation with the
current 15/49/149 USDC prices. Historical receipts, login data, existing keys,
entitlements, quota usage and global receipt replay reservations remain intact.
Plan purchases are enabled only for configured Base and Solana collectors;
reads still cover all ten networks. Create a fresh checkout before paying.
