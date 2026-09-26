# BuildAWallet mainnet deployment

The HUMAN Python Worker owns the builder brain and D1 database. The `agent-pay` Worker serves the HUMAN pages, a service-bound API proxy, the $19.99 USDC premium blueprint subscription, and the existing $0.01 USDC machine data routes. The static origin can also serve the pages from `static/`; the Worker routes make the HUMAN release independent of a pending static-site rebuild.

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

## 2. Deploy the human backend and shared D1 database

```bash
cd ~/buildawallet-paid-test
./cloudflare-human/deploy.sh
```

The script finds or creates the `buildawallet` D1 database, applies migrations including the one-time payment ledger and entitlement tables, deploys `buildawallet-human-api`, and checks `/api/start`, `/healthz` and `/api/stats`. The public `/api/*` zone route has previously returned 404 despite a successful upload. If its final `curl` check still fails, the Worker may still have deployed. Continue to step 3 to check the service binding at `/machine/human/catalog`; do not accept payments unless that check and subscription readiness both pass.

## 3. Deploy the HUMAN pages and payment Worker

```bash
cd ~/buildawallet-paid-test/agent-pay
npm run deploy
```

This script resolves the real D1 ID from Wrangler, applies pending shared migrations, typechecks, runs tests, deploys `buildawallet-agent-pay`, and checks the public machine info, HUMAN catalog, HUMAN pages, `/pay`, and subscription readiness. It uses `--config wrangler.deploy.jsonc`, avoiding the stale `../../dist/server/wrangler.json` redirect. The generated config and D1 listing are ignored by Git.

The Worker route list includes `/machine/*`, `/human`, `/human/*`, `/pay` and `/app.js`. The service binding `HUMAN_API` calls the Python Worker directly, which bypasses the currently failing public `/api/*` route. D1 and both RPC secrets must be present for the subscription endpoint to report `available: true`. If the deploy script stops on a public check, inspect that result before inviting anyone to pay.

## 4. Verify before promoting payment links

```bash
curl -fsS https://buildawallet.xyz/machine/human/catalog
curl -fsS https://buildawallet.xyz/machine/human/subscription
curl -fsS https://buildawallet.xyz/human
curl -fsS https://buildawallet.xyz/human/build
curl -fsS https://buildawallet.xyz/human/studio
curl -fsS https://buildawallet.xyz/pay
```

Confirm `subscription.available` is `true`, `priceUSDC` is `19.99`, and the Base and Solana collectors match `0xBcCA6AED433d9020C50D44560F9679F1B5eB511d` and `Ew8mbrKwD6LGaSX28a6XGmXqeQSs2hykRibjXVhftTRC`. Test an unauthenticated premium export returns 401. Then use a separate funded payer wallet to make **one** controlled $19.99 USDC purchase per chain when ready, checking the explorer transaction, unlock, expiry and premium download. A transaction ID can only be redeemed once. If a response is lost, inspect the payment ledger and on-chain transfer before sending again.

The earlier $0.01 machine mainnet payments have already been settled and verified on both rails (Base transaction `0x3a5017d77b1e40b7154f77a6f8863e033acf3e1a84c32fdb929fb143396f9086`, Solana transaction `5CBKCF7ffHaZ8sRVdj2W5ihtsQGjfkHj5FQr7h1YGCEJNYwt4h9dhgH9KajMHHGZ6aoUorPzDGwigR86P1MiM4eF`). These do not test the new $19.99 HUMAN confirmation path.

## Scope

The paid HUMAN feature is a detailed implementation blueprint export for a wallet design, with manual 30-day renewal. Free design and JSON export remain available. The public product does not create custody wallets, sign or send user transactions, or package an APK. The local `agent_protocol.py` signer and `/v1` routes remain unmounted.
