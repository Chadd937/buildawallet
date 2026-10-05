# BuildAWallet production integration

## Current release

`human-app/` is now the full TanStack Start application, including `/`, `/human/*`, `/nonhuman/*`, machine APIs, MCP, discovery and legal pages. It replaces the earlier static HUMAN bundle when its Cloudflare Worker is deployed. The original `agent-pay/`, `cloudflare-human/`, static site and native Android sources remain available for legacy support; their deployment scripts do not deploy this new application.

The new Worker configuration retains the production Worker name `buildawallet-agent-pay`. It covers `buildawallet.xyz/*`, plus more-specific `/api/public/*` and `/api/human-ai` routes. The separate `Chadd937/cloudflare-email-auth` Worker must own the more-specific `buildawallet.xyz/auth/*` route. The deployment requires a proxied origin on this hostname. Check the actual dashboard routes and Cloudflare Access policies after deployment so edge policies do not intercept the email-confirmation return.

## Backend change and data preservation

Accounts and sessions use the first-party Cloudflare Email Auth Worker and D1. The browser receives a first-party HttpOnly cookie and a short-lived signed account token; it does not use Supabase Auth or receive a Supabase key. PostgreSQL remains the server-only store for billing, metering and Byte conversations. The old databases are not deleted, and this source integration does not automatically transfer existing subscriptions or bearer keys. Reconcile any active legacy customer access before cutting production over to the new billing backend.

A **server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`** are still required for application data. Do not put the service-role key in a `VITE_` variable or source control.

For a new PostgreSQL project, apply SQL files `drizzle/migrations/0000` through `0006` in order. Existing installations must also apply `0006_external_email_auth.sql`, which lets the first-party account subject own Byte history without a Supabase Auth record. Do not rerun table creation migrations against an existing database. Apply migrations before deploying the app. `0005` refuses conflicting previously redeemed receipts and should be applied as a transaction. The SQL files, rather than `drizzle-kit push`, are authoritative for the policies, functions and triggers.

Migration 0004 aligns wallet-session quotas to Starter 100,000, Pro 500,000 and Scale 2,000,000 units. Migration 0005 makes receipt reservation, quote consumption and plan activation transactional and prevents one receipt from funding both purchase flows.

Deploy `Chadd937/cloudflare-email-auth` with its BuildAWallet Wrangler example, both D1 migrations, `RESEND_API_KEY`, `AUTH_EMAIL_PEPPER` and `AUTH_SESSION_SIGNING_KEY`. Configure the same signing key on this app Worker. The auth Worker only accepts HUMAN paths and `/nonhuman/dashboard` as confirmation destinations; other values fall back to `/human/setup`. The email contains both a one-click link and a six-digit fallback code.

## AI guide

Byte now calls same-origin `/api/human-ai`. Configure `OPENAI_API_KEY` and `OPENAI_MODEL` in the server environment. Optionally set `OPENAI_BASE_URL` to an HTTPS Responses API-compatible endpoint. These replace the editor gateway; no gateway dependency or editor telemetry remains. No provider/model compatibility or paid inference was tested against a live configured account in this integration.

Human keys remain locally derived and encrypted. Recognizable recovery phrases and labeled private keys are refused in chat on both client and server. Detection is not a guarantee that every possible secret format will be recognized.

## Deploy

On a machine authenticated to the Cloudflare account that owns the domain, put the server values in local `human-app/.env` or the process environment. See `.env.example`; local `.env` is ignored by Git.

```sh
cd ~/buildawallet/human-app
npm ci --legacy-peer-deps --no-audit --no-fund
npm run deploy
```

The deploy script checks backend readiness first, then builds, checks types and tests, uploads server configuration using Wrangler's stdin interface, deploys the generated Worker configuration and runs HTTP smoke checks. It does not apply PostgreSQL migrations or create an email provider. Base and Solana collectors are preserved; optional RPC secrets can be supplied without changing the collector addresses. The legacy deployment script in `agent-pay/` will restore the earlier backend if run, so use this release's deployment command for the new app.

For Cloudflare Workers Git builds, use this repo's root `npm run build` and deploy with `npx wrangler deploy --config human-app/dist/server/wrangler.json`. Run the backend readiness check before publishing. Cloudflare Pages publishing only `static/` will continue to publish the legacy site and cannot run this app's server functions.

## Android

The existing `android-studio/` native wallet remains separate. The new app offers a hardened Android WebView project ZIP, with file import, HTTPS-only loading, biometric protection and release-signing requirements. Downloading that project is not downloading an APK. A new owner-signed WebView APK has not yet been built or installed as part of this integration. Its wallet depends on the deployed HTTPS web app; it should not be released until the app is working on the production domain.

## Verification and remaining checks

Production build, strict typecheck, app tests and Wrangler dry-run packaging are covered locally. The tests execute the PostgreSQL migrations with PGlite, verify payment rollback/replay prevention, quotas, rate limiting, key derivation against a public test vector, invalid-key refusal, and one-time opt-in server wallet behavior. RPC responses in these tests are controlled test inputs; they do not prove live network or payment operation.

A real emailed-link return, funded USDC plan purchase, paid x402 call, signed web-wallet transfers across the chosen networks, production AI streaming, and installation/use of a newly signed Android APK remain unverified. The release must not be described as tested end to end on mainnet based on these code checks alone.
