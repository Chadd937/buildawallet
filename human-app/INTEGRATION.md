# BuildAWallet production integration

## Current release

`human-app/` is the full TanStack Start application for `/`, `/human/*`, `/nonhuman/*`, machine APIs, MCP, discovery and legal pages. It includes the supplied Human/Machine homepage and shared footer. The production Worker is `buildawallet-agent-pay`.

The original HUMAN email login in `human_worker.py` remains the exclusive login provider. Its existing `buildawallet-human-api` Worker owns the more-specific `buildawallet.xyz/api/*` route. This app owns `buildawallet.xyz/*` plus `/api/public/*` and `/api/human-ai`, leaving `/api/human/account` and its `/email`, `/verify` and `/logout` endpoints with the original Worker. Existing Cloudflare Access policies must allow the intended public entry and email-code flow.

## Login and storage

The Login project uses a Secure, HttpOnly, SameSite=Lax browser cookie with a random token. Only its hash is stored in D1. This app reads that existing session through its `AUTH_DB` binding, checks expiry and the verified account, and uses the stable protected email hash to scope account data. Unsafe requests also require the same origin. Login does not require a second token or shared signing key. Login tables, account records, email pepper and Resend secrets stay with the existing Login Worker.

October 5 production schema inspection confirmed that the `buildawallet` database (`f9bc91c2-f66f-4fbe-a099-8913952584e3`) holds `human_sessions` and `human_email_accounts`, matching the original HUMAN email login. `buildawallet-production` has no login tables. Source bindings now point `DB` and `AUTH_DB` at `buildawallet`, with `AUTH_TABLE_PREFIX=human` and `AUTH_COOKIE_NAME=baw_human_session`.

`AUTH_COOKIE_NAME` must match the existing Worker. Deployment selects the schema's cookie default unless you explicitly override it locally. `AUTH_DATABASE_NAME` can select a different existing D1 database; automatic discovery still checks the account for a unique matching schema. The session validator also understands the extracted `auth_*` schema, but this release's frontend calls the original HUMAN endpoints above. No login table-reset migration is executed by this app.

Application billing, quotas, rate counters, API keys and Byte history use the app's `DB` D1 binding. `APP_DATABASE_NAME` defaults to `buildawallet`. `migrations/baw_0001_app_data.sql` only adds app tables and triggers, with the separate `baw_app_migrations` journal. Payment receipt reservation, quote consumption and plan activation are atomic; one receipt cannot activate both purchase flows. Quota decisions and account usage audit events are also atomic.

Original `agent-pay/`, `cloudflare-human/`, static site and native Android sources and their D1 tables remain preserved. Imported PostgreSQL migration source is retained only under `archive/imported-postgres/` for reference. It is not part of the deployed app. Existing legacy paid entitlements and API keys are not automatically mapped into the new app tables; reconcile active access before a billing cutover. No old database or external service is deleted by this change.

## AI guide and wallet secrets

Byte uses same-origin `/api/human-ai` with the existing login cookie. Its default `AI_PROVIDER=workers-ai` uses the original Cloudflare AI binding and `AI_MODEL=@cf/meta/llama-3.1-8b-instruct-fast`. Provider SSE is translated into the app's streaming chat protocol; completed conversations retain their existing D1 account scope, and failed or aborted answers are not saved. The original 60 requests per minute AI limiter is retained and keyed by the verified account. No OpenAI key is required.

An optional OpenAI-compatible provider requires an explicit `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_MODEL` and optionally an HTTPS `OPENAI_BASE_URL`. Authentication remains independent of that selection. Actual inference and provider quotas still require a live check.

Wallet keys remain locally derived and encrypted. Recognizable recovery phrases and labeled private keys are refused in chat on both client and server. Detection cannot recognize every possible secret format. Conversation history is scoped to the verified Login account in D1.

## Deploy

On your Cloudflare-authenticated machine, the Cloudflare AI defaults work without a local `.env`. Keep any existing optional RPC settings private, using `.env.example` as a guide. Do not overwrite existing settings or commit secret values.

```sh
cd ~/buildawallet
npm --prefix human-app ci --legacy-peer-deps --no-audit --no-fund
npm run deploy
```

Deployment resolves real D1 IDs from the account, verifies the existing Login schema, creates the app database only if missing, and applies app migrations before publishing. Pending migrations and their `baw_app_migrations` journal entries are sent together through `wrangler d1 execute --remote --file`, using D1's SQL-file import parser to avoid the remote query splitter's trigger errors. Applied migration names are checked before and after import, and existing migrations are skipped. The temporary schema-only SQL file is removed afterwards. Do not manually use `d1 migrations apply` for these trigger-bearing app migrations.

Deployment uploads supplied optional provider/RPC secrets through stdin, skipping that step if there are none. Generated bindings are written only to ignored `dist/server/wrangler.json`. Cookie name and database selection must correspond to the existing deployed Login Worker. App deployment does not deploy or change that separate Worker.

Use this deployment script for publishing. Running Wrangler directly against a fresh build skips binding resolution and migrations. Cloudflare Pages publishing only `static/` continues to publish the legacy site and cannot run the new app's server functions. The old `agent-pay` deployment script also restores the earlier backend.

Base and Solana collectors are preserved. Supplied optional RPC secrets do not change those addresses.

## Verification and remaining live checks

Tests execute the production migration and queries against SQLite with the same D1 batch transaction boundary. They check original cookie sessions, expiry/revocation, cross-site write refusal, account isolation, payment rollback/replay prevention, quotas, rate limiting, key derivation and one-time opt-in wallet generation. Production build, strict typecheck and Wrangler dry-run check packaging; controlled RPC tests do not prove mainnet operation.

A real email-code login on the production domain, D1 binding configuration, funded USDC purchase, paid x402 call, signed wallet transfers, live Byte streaming and installation of a newly signed Android APK still need production verification. A downloaded WebView project is not an APK. The existing native Android project remains separate.
