# October 4 BuildAWallet integration review

The uploaded full app is integrated into `human-app/` under the canonical repository. The legacy Cloudflare backend, D1 migrations, static site and native Android wallet remain available. Production publishing must use the new app's Worker bundle and documented backend cutover.

## Completed changes

- Removed editor metadata, proprietary build plugins, editor auth brokerage, editor telemetry hooks, gateway integrations, alternate lockfile and branded favicon. Current source and filenames pass a case-insensitive branding scan. The app uses the existing BuildAWallet wallet icon.
- Replaced the old static frontend with the full HUMAN and eight-page machine app. The uploaded artwork and wallet guide are included, with the Studio background on internal pages and the separate split landing artwork preserved.
- Corrected the public machine route prefix, included the existing legal-policy routes in the app, and redirected legacy documentation, pricing and payment pages to the new machine UI.
- Preserved Base and Solana collectors. The machine app's updated plan allowances are synchronized with a new PostgreSQL migration; the existing SQL meter had still enforced 500 / 5,000 / 25,000 units.
- Made receipt redemption and entitlement activation one database transaction, with a shared receipt ledger across both checkout flows. Fixed one-use challenge consumption. Exhausted credentials are refused before upstream reads or transaction dispatch, and broadcast attempts reserve their unit before dispatch.
- Replaced Byte's hardcoded separate Worker URL with same-origin `/api/human-ai`, and replaced its editor gateway with configurable provider credentials. Added client/server checks against recognizable wallet secrets entering chat. Removed heavyweight Markdown diagram/syntax plugins from the wallet guide while retaining Markdown and tables.
- Removed invented stablecoin prices and token balance fallbacks. Missing quotes remain unavailable; selected dollar-based send limits block sends when their quote is unavailable, and checks run again at confirmation.
- Kept wallet keys locally derived and encrypted. The first-party Cloudflare email UI requests a confirmation link back to setup, provides a six-digit fallback code and mentions spam; the web legal gate appears only on the landing, while Android uses its own acceptance record.
- Updated CI, build scripts, Cloudflare configuration, environment examples, backend readiness checks and cutover instructions. Server environment files are excluded from Git, and the browser receives no Supabase configuration.

## Checks completed locally

- Full application production build and strict TypeScript check.
- App tests include actual PostgreSQL migration execution via PGlite, receipt replay/rollback, quota enforcement, rate limiting, known-address derivation, server-wallet response/storage behavior, legal-gate and confirmation-link UI behavior, bounded JSON bodies, secret rejection and price failures.
- Legacy machine Worker typecheck and all 34 existing tests.
- Built Worker runtime dispatch checks: HTTP 200 on 23 page, discovery and free API routes; MCP lists 52 tools.
- Wrangler dry-run packaging succeeds. These are local runtime and code checks, not a mainnet payment or browser/phone visual review.

## Production work still blocked or unverified

This environment is not authenticated to Cloudflare and contains no deployment secrets. The app needs the server-side PostgreSQL key, AI configuration and the shared auth signing key. The separate email-auth Worker needs its D1 binding, Resend key, email-hash pepper and the same signing key. Both auth migrations and app migration `0006` must be applied before publishing.

The app uses PostgreSQL rather than the old D1 billing records. Any active legacy customer access requires reconciliation; the integration preserves the original databases and code but does not migrate live customer data automatically.

No real email link, funded USDC purchase, paid x402 response, signed mainnet transfer, configured production AI stream, or new owner-signed WebView APK was verified. The Android export is buildable source, not an installable APK. Do not describe those flows as fully tested on mainnet based on this review.

See `human-app/INTEGRATION.md` for the exact deployment sequence and configuration requirements.
