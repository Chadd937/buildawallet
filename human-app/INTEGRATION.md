# BuildAWallet production integration

## Current release

`human-app/` is the full TanStack Start application for `/`, `/human/*`, `/nonhuman/*`, machine APIs, MCP, discovery and legal pages. It includes the supplied Human/Machine homepage and shared footer. The production Worker is `buildawallet-agent-pay`.

The separate `Chadd937/cloudflare-email-auth` software remains the exclusive login provider. Its Worker must own the more-specific `buildawallet.xyz/auth/*` route, while this app owns `buildawallet.xyz/*`. Existing Cloudflare Access policies must allow the intended public entry and email-code flow.

## Login and storage

The Login project uses a Secure, HttpOnly, SameSite=Lax browser cookie with a random token. Only its hash is stored in D1. This app reads that existing session through its `AUTH_DB` binding, checks expiry and the verified account, and uses the stable protected email hash to scope account data. Unsafe requests also require the same origin. Login does not require a second token or shared signing key. Login tables, account records, email pepper and Resend secrets stay with the existing Login Worker.

`AUTH_COOKIE_NAME` must match that Worker. The extracted `auth_*` repository defaults to `site_session`; the original `human_*` HUMAN login uses `baw_human_session`. Deployment selects that schema default unless you explicitly override the cookie name locally. `AUTH_DATABASE_NAME` selects its existing D1 database. Deployment can discover a unique Login database among `buildawallet-auth`, `buildawallet-email-auth`, `buildawallet` and `buildawallet-production`; set the exact name if different or ambiguous. Both the extracted `auth_*` schema and the original `human_*` email-login schema are supported. No login table-reset migration is executed by this app.

Application billing, quotas, rate counters, API keys and Byte history use the app's `DB` D1 binding. `APP_DATABASE_NAME` defaults to `buildawallet`. `migrations/baw_0001_app_data.sql` only adds app tables and triggers, with the separate `baw_app_migrations` journal. Payment receipt reservation, quote consumption and plan activation are atomic; one receipt cannot activate both purchase flows. Quota decisions and account usage audit events are also atomic.

Original `agent-pay/`, `cloudflare-human/`, static site and native Android sources and their D1 tables remain preserved. Imported PostgreSQL migration source is retained only under `archive/imported-postgres/` for reference. It is not part of the deployed app. Existing legacy paid entitlements and API keys are not automatically mapped into the new app tables; reconcile active access before a billing cutover. No old database or external service is deleted by this change.

## AI guide and wallet secrets

Byte uses same-origin `/api/human-ai` with the existing login cookie. Configure `OPENAI_API_KEY` and `OPENAI_MODEL` in the server environment, optionally `OPENAI_BASE_URL` for an HTTPS Responses API-compatible endpoint. These settings are for the guide, independently of authentication. Provider compatibility and paid inference still require a live check.

Wallet keys remain locally derived and encrypted. Recognizable recovery phrases and labeled private keys are refused in chat on both client and server. Detection cannot recognize every possible secret format. Conversation history is scoped to the verified Login account in D1.

## Deploy

On your Cloudflare-authenticated machine, keep or create local `human-app/.env` using `.env.example` as a guide. Do not overwrite existing settings or commit secret values.

```sh
cd ~/buildawallet
npm --prefix human-app ci --legacy-peer-deps --no-audit --no-fund
npm run deploy
```

Deployment resolves real D1 IDs from the account, verifies the existing Login schema, creates the app database only if missing, and applies app migrations before publishing. It uploads AI/RPC secrets through stdin. Generated bindings are written only to ignored `dist/server/wrangler.json`. Cookie name and database selection must correspond to the existing deployed Login Worker. App deployment does not deploy or change that separate Worker.

Use this deployment script for publishing. Running Wrangler directly against a fresh build skips binding resolution and migrations. Cloudflare Pages publishing only `static/` continues to publish the legacy site and cannot run the new app's server functions. The old `agent-pay` deployment script also restores the earlier backend.

Base and Solana collectors are preserved. Supplied optional RPC secrets do not change those addresses.

## Verification and remaining live checks

Tests execute the production migration and queries against SQLite with the same D1 batch transaction boundary. They check original cookie sessions, expiry/revocation, cross-site write refusal, account isolation, payment rollback/replay prevention, quotas, rate limiting, key derivation and one-time opt-in wallet generation. Production build, strict typecheck and Wrangler dry-run check packaging; controlled RPC tests do not prove mainnet operation.

A real email-code login on the production domain, D1 binding configuration, funded USDC purchase, paid x402 call, signed wallet transfers, live Byte streaming and installation of a newly signed Android APK still need production verification. A downloaded WebView project is not an APK. The existing native Android project remains separate.
