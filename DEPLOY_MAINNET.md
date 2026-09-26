# BuildAWallet mainnet deployment

The HUMAN Python Worker owns the builder brain and D1 database. The `agent-pay` Worker serves the HUMAN pages, a service-bound API proxy, three shared HUMAN blueprint and read-only API plans, MCP tools, and the existing $0.01 USDC x402 machine data routes. The static origin can also serve the pages from `static/`; the Worker routes make the HUMAN release independent of a pending static-site rebuild.

## 1. Get the release on the authenticated machine

```bash
cd ~/buildawallet-paid-test
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
cd ~/buildawallet-paid-test
./cloudflare-human/deploy.sh
```

The script finds or creates the `buildawallet` D1 database, applies migrations including the one-time payment ledger, three plan tiers and API key tables, deploys `buildawallet-human-api`, and checks `/api/start`, `/healthz` and `/api/stats`. When Wrangler asks to apply pending migrations, approve the changes after reviewing them. Declining now stops the deploy before upload. The public `/api/*` zone route has previously returned 404 despite a successful upload. If its final `curl` check still fails, the Worker may still have deployed. Continue to step 3 to check the service binding at `/machine/human/catalog`; do not accept payments unless that check and subscription readiness both pass.

## 3. Deploy the HUMAN pages and payment Worker

```bash
cd ~/buildawallet-paid-test/agent-pay
npm run deploy
```

This script resolves the real D1 ID from Wrangler, applies pending shared migrations, verifies the plan schema, typechecks, runs the Worker tests using its own Vitest config, deploys `buildawallet-agent-pay`, and checks public machine info, HUMAN catalog, pages, plans, OpenAPI and discovery. It uses `--config wrangler.deploy.jsonc`, avoiding the stale `../../dist/server/wrangler.json` redirect. The generated config and D1 listing are ignored by Git.

The Worker route list includes `/machine/*`, `/human`, `/human/*`, `/pay`, `/mcp`, `/api-docs` and its same-origin Swagger assets, legal pages, and machine-readable discovery. The root landing page keeps its existing split HUMAN / NON-HUMAN layout and is served by the site origin. The service binding `HUMAN_API` calls the Python Worker directly, which bypasses the currently failing public `/api/*` route. D1 and both RPC secrets must be present for the subscription endpoint to report `available: true`. The deploy script checks the landing page, legal pages, API docs assets and docs links. If it stops on a public check, inspect that result before inviting anyone to pay.

## 4. Verify before promoting payment links

```bash
curl -fsS https://buildawallet.xyz/machine/human/catalog
curl -fsS https://buildawallet.xyz/machine/human/subscription
curl -fsS https://buildawallet.xyz/human
curl -fsS https://buildawallet.xyz/human/build
curl -fsS https://buildawallet.xyz/human/studio
curl -fsS https://buildawallet.xyz/pay
curl -fsS https://buildawallet.xyz/machine/openapi.json
curl -fsS https://buildawallet.xyz/api-docs
curl -fsS https://buildawallet.xyz/api-docs/swagger-ui.css >/dev/null
curl -fsS https://buildawallet.xyz/api-docs/swagger-ui-bundle.js >/dev/null
curl -fsS https://buildawallet.xyz/terms
curl -fsS https://buildawallet.xyz/privacy
```

Confirm `subscription.available` is `true`, and that `plans` lists Builder $12 / 500 units, Pro $39 / 5,000 units and Scale $99 / 25,000 units for 30 days. The Base and Solana collectors must match `0xBcCA6AED433d9020C50D44560F9679F1B5eB511d` and `Ew8mbrKwD6LGaSX28a6XGmXqeQSs2hykRibjXVhftTRC`. Test an unauthenticated premium export and subscribed API read return 401. Then use a separate funded payer wallet for **one** controlled plan purchase on a chosen chain, checking the explorer transaction, unlock, expiry, blueprint download, API key and a metered read. A transaction ID can only be redeemed once. If a response is lost, inspect the payment ledger and on-chain transfer before sending again.

The earlier $0.01 machine mainnet payments have already been settled and verified on both rails (Base transaction `0x3a5017d77b1e40b7154f77a6f8863e033acf3e1a84c32fdb929fb143396f9086`, Solana transaction `5CBKCF7ffHaZ8sRVdj2W5ihtsQGjfkHj5FQr7h1YGCEJNYwt4h9dhgH9KajMHHGZ6aoUorPzDGwigR86P1MiM4eF`). They do not test a purchase of one of the new plans.

## Scope

The paid HUMAN feature is a detailed implementation blueprint export for a wallet design plus a shared, metered read-only mainnet API, with manual 30-day renewal. Free design and JSON export remain available. The public product does not create custody wallets, sign or send user transactions, or package an APK. The local `agent_protocol.py` signer and `/v1` routes remain unmounted.
