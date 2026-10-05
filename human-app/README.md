# BuildAWallet app

The full TanStack Start app for the HUMAN wallet, machine dashboard, API, MCP and x402 service. Canonical source: `Chadd937/buildawallet`, branch `main`.

```sh
cd human-app
npm ci --legacy-peer-deps --no-audit --no-fund
npm run build
npm run typecheck
npm test
```

The app uses Cloudflare Workers and D1. Your original HUMAN login (`human_worker.py`, deployed as `buildawallet-human-api`) owns `/api/human/account` and its `/email`, `/verify` and `/logout` endpoints, email delivery, accounts and HttpOnly login cookies. The app calls that existing Worker and validates its D1 sessions directly. It does not introduce a separate authentication token or signing secret.

Production schema inspection confirmed that `buildawallet` contains the existing `human_sessions` and `human_email_accounts` tables. Both app and login bindings use that database, with `AUTH_TABLE_PREFIX=human` and `AUTH_COOKIE_NAME=baw_human_session`. `buildawallet-production` does not contain these login tables.

To deploy, keep or create an ignored `.env` inside `human-app`. Set `OPENAI_API_KEY` and `OPENAI_MODEL` for Byte. `APP_DATABASE_NAME` defaults to the existing `buildawallet` D1 database. Only override `AUTH_DATABASE_NAME` or `AUTH_COOKIE_NAME` if the existing Login Worker actually changes. Do not commit or share the filled file.

`npm run deploy` checks settings, types and tests, builds the app, resolves real D1 IDs, applies additive app migrations, uploads AI/RPC secrets, deploys `buildawallet-agent-pay` and runs HTTP smoke checks. The login tables and the Login Worker's secrets are not reset. Public settings resolve from the shell, then `.dev.vars`, then `.env`, then `wrangler.jsonc`.

See `INTEGRATION.md` for the production cutover, migration boundaries and release limitations. The production bundle is `dist/server/wrangler.json`, with assets in `dist/client`. Publish using `npm run deploy`, which verifies the account's current database IDs and applies additive app migrations first.

Use `npm run inspect:login` to print database names, table names and Login table definitions from the existing account. It reads schema metadata only and does not create, reset or migrate any table.
