# BuildAWallet app

The full TanStack Start app for the HUMAN wallet, machine dashboard, API, MCP and x402 service. Canonical source: `Chadd937/buildawallet`, branch `main`.

```sh
cd human-app
npm ci --legacy-peer-deps --no-audit --no-fund
npm run build
npm run typecheck
npm test
npm run preview
```

The app uses the standard Cloudflare Vite plugin. Its production bundle is `dist/server/wrangler.json`, with assets in `dist/client`.

See `INTEGRATION.md` for the Cloudflare cutover, database migrations, first-party sign-in configuration and release limitations. Server secrets are excluded from Git. The browser does not receive a Supabase key; PostgreSQL access remains server-only.

To deploy, copy `.env.example` to `.env` inside `human-app` and fill `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SESSION_SIGNING_KEY`, `OPENAI_API_KEY` and `OPENAI_MODEL`. The signing key must match the separate `cloudflare-email-auth` Worker. Do not commit or share the filled file. Keep any existing `.env` rather than overwriting it with the example.

`npm run deploy` checks the database, builds and tests the app, uploads server secrets and deploys `buildawallet-agent-pay` to `buildawallet.xyz`. Settings resolve from the shell, then `.dev.vars`, then `.env`, then the public values in `wrangler.jsonc`. The Supabase URL already defaults to the configured project. Public overrides are also written to the generated deployment config, so readiness checks and the deployed Worker use the same values. No secret values are written to public Worker vars.
