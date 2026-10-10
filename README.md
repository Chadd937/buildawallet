> Current production source: `human-app/`. Billing uses prepaid API units, with prepaid income accumulated at the configured chain collectors and device-approved withdrawals. Per-call blockchain payments are retired. See [the current app guide](human-app/README.md). The older architecture described below is preserved for reference.

> Current production app source: `human-app/`. It includes the updated HUMAN and machine flows. Read [human-app/INTEGRATION.md](human-app/INTEGRATION.md) before deploying; first-party email authentication is provided by `Chadd937/cloudflare-email-auth`, while the billing data backend uses server-only Supabase/PostgreSQL access.

# BuildAWallet.xyz

BuildAWallet has a HUMAN wallet designer and a NON-HUMAN machine data API. The public website does **not** custody customer wallets or sign transactions; the machine API only relays transactions that the caller has already signed locally on supported chains.

| Surface | Current capability | Deployment |
| --- | --- | --- |
| HUMAN Pages site | Email-verified account, four-step onboarding, interactive Studio blueprint, release choice, crypto subscription handoff and build-status download screen | Cloudflare Pages serves `/human/*`; Cloudflare Access can guard account and release services |
| HUMAN API | Architect chat, saved designs, gallery and stats | `cloudflare-human/` Python Worker with D1, routes `/api/*` and `/healthz` |
| NON-HUMAN data | nine-network read API, composite snapshots, MCP tools, prepaid access, and locally signed transfers on EVM + Solana | `human-app/` machine routes; `agent-pay/` remains a separate worker |
| Agent wallet signer | Local prototype only | Not mounted on the public container or Cloudflare |

The optional Docker/see.io server in `main.py` serves the website and a read-only MCP preview. It deliberately does not mount `agent_protocol.py`. A `BAW_MASTER_KEY` environment variable does not turn the public server into a signer. Do not put signing keys or bootstrap credentials into either Cloudflare Worker.

## HUMAN flow

1. `/human` redirects to `/human/setup`. Four focused screens collect identity and theme, custody, chains and security. Choices persist in browser storage and can be edited by moving backward.
2. `/human/studio` provides the marketplace-style feature catalog, presets, skins, live phone concept and a prominent Deploy Wallet action.
3. `/human/release` is mainnet only. It checks entitlement and sends an unsubscribed user to the $1.99 monthly crypto-only `/human/pay` confirmation flow.
4. `/human/download` polls the build service and displays a QR code and APK link only after the API reports a completed signed artifact. `/human/live` remains available for free read-only Base or Solana mainnet balances.

The Android wallet includes custom ERC-20 import/send on the seven configured EVM networks plus Solana SPL Token and basic Token-2022 mint import/balance/send. Token-2022 mints with unsupported extensions are blocked from sending; arbitrary Solana dapp signing is not part of the current SPL send flow. The previously shared APK is a WebView wrapper, not a functional Android wallet. The download screen therefore stays locked unless the build API returns a completed signed artifact and its URL. HUMAN design remains a browser-local preview. The current API plans are Starter $15, Pro $49 and Scale $149 for 30 days. Prepaid checkout supports Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, Avalanche, Solana and Bitcoin. Wallet ownership, confirmed payment receipts, one-time transaction accounting and subscription expiry govern API access only. See [the Access setup](CLOUDFLARE_ACCESS.md), [deployment steps](DEPLOY_MAINNET.md), and [Android release gap](ANDROID_RELEASE.md).

## Legacy NON-HUMAN worker reference

The older `agent-pay/` Worker documentation below is retained for migration context and may not match the current `human-app/` production routes. The current app exposes nine configured mainnets, prepaid API units, native/stablecoin/transaction/snapshot reads, and locally signed EVM + Solana transaction preparation/broadcast. Bitcoin is read-only for transaction preparation/broadcast. See [the current app guide](human-app/README.md) and [integration guide](human-app/INTEGRATION.md) before deploying or relying on route behavior.

The legacy worker previously exposed `/machine/info`, `/machine/wallet`, `/machine/solana-wallet` and x402 challenges. Per-call x402 billing is retired in the current app. Do not use old route examples as current production instructions.

## Deploy

See [the mainnet deployment runbook](DEPLOY_MAINNET.md) for the three Cloudflare surfaces, Wrangler commands, checks and remaining release gates. Pushing `main` also triggers the separate see.io container build per `AGENTS.md`; the Cloudflare Workers require their own deployment commands. A Pages build must use `static/` as output and keep the repository root as project root for `functions/w/[code].js`.
