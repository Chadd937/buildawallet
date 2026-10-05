# BuildAWallet app

The full TanStack Start app for the HUMAN wallet, machine dashboard, API, MCP and x402 service. Canonical source: `Chadd937/buildawallet`, branch `main`.

```sh
cd human-app
npm ci --legacy-peer-deps --no-audit --no-fund
npm run build
npm run typecheck
npm test
```

The app uses Cloudflare Workers and D1. Your existing `Chadd937/cloudflare-email-auth` software exclusively owns `/auth/*`, email delivery, accounts and HttpOnly login cookies. The app validates those existing D1 sessions directly. It does not introduce a separate authentication token or signing secret.

To deploy, keep or create an ignored `.env` inside `human-app`. Set `AUTH_DATABASE_NAME` to your existing Login D1 database name if it cannot be discovered automatically, and `AUTH_COOKIE_NAME` to the cookie configured on that Login Worker (the extracted `auth_*` login defaults to `site_session`; the original `human_*` login uses `baw_human_session`). Set `OPENAI_API_KEY` and `OPENAI_MODEL` for Byte. `APP_DATABASE_NAME` defaults to the existing `buildawallet` D1 database. Do not commit or share the filled file.

`npm run deploy` checks settings, types and tests, builds the app, resolves real D1 IDs, applies additive app migrations, uploads AI/RPC secrets, deploys `buildawallet-agent-pay` and runs HTTP smoke checks. The login tables and the Login Worker's secrets are not reset. Public settings resolve from the shell, then `.dev.vars`, then `.env`, then `wrangler.jsonc`.

See `INTEGRATION.md` for the production cutover, migration boundaries and release limitations. The production bundle is `dist/server/wrangler.json`, with assets in `dist/client`. Build-only bundles contain development database IDs; publish using `npm run deploy`, which resolves the actual databases first.

Use `npm run inspect:login` to print database names, table names and Login table definitions from the existing account. It reads schema metadata only and does not create, reset or migrate any table.
