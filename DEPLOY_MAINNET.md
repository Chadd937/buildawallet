# BuildAWallet mainnet deployment

The HUMAN Python Worker owns the builder brain and D1 database. The `agent-pay` Worker serves the free HUMAN pages and implementation plan, a service-bound API proxy, three paid read-only API plans, MCP tools, and the existing $0.01 USDC x402 machine data routes. The static origin can also serve the pages from `static/`; the Worker routes make the HUMAN release independent of a pending static-site rebuild.

## 0. Configure HUMAN sign-in

Follow the complete path table in [CLOUDFLARE_ACCESS.md](CLOUDFLARE_ACCESS.md) to create one Cloudflare Access application for HUMAN pages, direct HUMAN APIs, payment and saved designs. Keep `/`, docs, pricing, `/machine/info`, `/machine/v1/*`, `/mcp` and x402 endpoints public. Copy the Access team domain and application AUD into the `agent-pay` Worker secrets. The payment flow still requires its separate wallet signature and verified USDC transfer. The machine subscription endpoints retain wallet-based authentication for programmatic clients.

## 1. Get the release on the authenticated machine

```bash
cd ~/buildawallet
git pull --ff-only origin main
cd agent-pay
npm ci
npm run typecheck
npm test
```

Use the Cloudflare account that owns `buildawallet.xyz`. Keep RPC credentials in Wrangler secrets, never in the Git checkout. The existing Base and Solana mainnet RPC secrets remain attached to `buildawallet-agent-pay` when deploying a new version. To set or replace one, use `npx wrangler secret put BASE_RPC_URL --config wrangler.jsonc` or the corresponding `SOLANA_RPC_URL` command, entering only the URL at the prompt.

If `wrangler d1 list` returns Cloudflare authentication error 10000, run `npx wrangler logout`, then `npx wrangler login` and complete the browser authorization. Check `npx wrangler d1 list` before retrying either deploy script. A successful `whoami` alone does not prove D1 access. Do not paste an OAuth token or RPC secret into chat.

## 2. Deploy the human backend and shared D1 database

```bash
cd ~/buildawallet
./cloudflare-human/deploy.sh
```

The script finds or creates the `buildawallet` D1 database, applies migrations including the one-time payment ledger, API key tables and pseudonymous HUMAN account records, deploys `buildawallet-human-api`, and checks `/healthz`. When Wrangler asks to apply pending migrations, approve the changes after reviewing them. Declining now stops the deploy before upload. Direct `/api/*` routes require Access sign-in; the service binding at `/machine/human/catalog` is checked in step 3. Do not accept payments unless that check and subscription readiness both pass.

## 3. Deploy the HUMAN pages and payment Worker

```bash
cd ~/buildawallet/agent-pay
npm run deploy
```

This script resolves the real D1 ID from Wrangler, applies pending shared migrations, verifies the plan schema, typechecks, runs the Worker tests using its own Vitest config, deploys `buildawallet-agent-pay`, and checks public machine info, HUMAN catalog, pages, plans, OpenAPI and discovery. It uses `--config wrangler.deploy.jsonc`, avoiding the stale `../../dist/server/wrangler.json` redirect. The generated config and D1 listing are ignored by Git.

The Worker route list includes `/`, `/machine/*`, `/human`, `/human/*`, `/pay`, `/mcp`, `/api-docs` and its same-origin Swagger assets, legal pages, and machine-readable discovery. The root landing page keeps its existing split HUMAN / NON-HUMAN layout and is served by the Worker from the unchanged static landing file. The service binding `HUMAN_API` calls the Python Worker directly, which bypasses the currently failing public `/api/*` route. D1 and both RPC secrets must be present for the subscription endpoint to report `available: true`. The deploy script refuses to upload without the Access secrets and correct edge scope; it checks that HUMAN pages redirect anonymous visitors to Access and public machine routes remain open. If it stops on a public check, inspect that result before inviting anyone to pay.

## 4. Verify before promoting payment links

```bash
curl -fsS https://buildawallet.xyz/machine/human/catalog
curl -fsS https://buildawallet.xyz/machine/human/subscription
cd ~/buildawallet/agent-pay && node scripts/check-human-access.mjs
curl -fsS https://buildawallet.xyz/machine/openapi.json
curl -fsS https://buildawallet.xyz/api-docs
curl -fsS https://buildawallet.xyz/api-docs/swagger-ui.css >/dev/null
curl -fsS https://buildawallet.xyz/api-docs/swagger-ui-bundle.js >/dev/null
curl -fsS https://buildawallet.xyz/terms
curl -fsS https://buildawallet.xyz/privacy
```

Confirm `subscription.available` is `true`, and that `plans` lists Starter $12 / 500 units, Pro $39 / 5,000 units and Scale $99 / 25,000 units for 30 days. The Base and Solana collectors must match `0xBcCA6AED433d9020C50D44560F9679F1B5eB511d` and `Ew8mbrKwD6LGaSX28a6XGmXqeQSs2hykRibjXVhftTRC`. An unauthenticated blueprint POST should redirect to Access at the edge; an authenticated visitor should be able to download a plan without wallet payment. A subscribed API read without a key should return 401. For plan purchase, use a separate funded payer wallet for **one** controlled payment on a chosen chain, checking the explorer transaction, expiry, API key and a metered read. A transaction ID can only be redeemed once. If a response is lost, inspect the payment ledger and on-chain transfer before sending again.

The earlier $0.01 machine mainnet payments have already been settled and verified on both rails (Base transaction `0x3a5017d77b1e40b7154f77a6f8863e033acf3e1a84c32fdb929fb143396f9086`, Solana transaction `5CBKCF7ffHaZ8sRVdj2W5ihtsQGjfkHj5FQr7h1YGCEJNYwt4h9dhgH9KajMHHGZ6aoUorPzDGwigR86P1MiM4eF`). They do not test a purchase of one of the new plans.

## Scope

Cloudflare Access verifies the email, then /human/account creates a pseudonymous HUMAN account. Two onboarding steps carry the wallet name, networks, style and custody choices into Studio. The HUMAN designer and its JSON and detailed implementation plan exports are free after Cloudflare Access sign-in. Paid plans meter the read-only mainnet API with manual 30-day renewal. The public product does not create custody wallets, sign or send user transactions, or package an APK. The local `agent_protocol.py` signer and `/v1` routes remain unmounted. [Android release work](ANDROID_RELEASE.md) is still required for a functional wallet APK.
