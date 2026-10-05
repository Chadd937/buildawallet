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
