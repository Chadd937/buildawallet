> Current production source: `human-app/`. Billing uses prepaid API units, with income accumulated at the owner collectors and device-approved withdrawals. Per-call blockchain payments are retired. See [the current app guide](human-app/README.md). The older architecture described below is preserved for reference.

> Current production app source: `human-app/`. It includes the updated HUMAN and machine flows. Read [human-app/INTEGRATION.md](human-app/INTEGRATION.md) before deploying; first-party email authentication is provided by `Chadd937/cloudflare-email-auth`, while the billing data backend uses server-only Supabase/PostgreSQL access.

# BuildAWallet.xyz

BuildAWallet has a HUMAN wallet designer and a NON-HUMAN read-only machine data API. The public website does **not** create custodial wallets or sign and broadcast transactions.

| Surface | Current capability | Deployment |
| --- | --- | --- |
| HUMAN Pages site | Email-verified account, four-step onboarding, interactive Studio blueprint, release choice, crypto subscription handoff and build-status download screen | Cloudflare Pages serves `/human/*`; Cloudflare Access can guard account and release services |
| HUMAN API | Architect chat, saved designs, gallery and stats | `cloudflare-human/` Python Worker with D1, routes `/api/*` and `/healthz` |
| NON-HUMAN data | Base and Solana read-only API, composite snapshots, MCP tools, and $0.01 USDC native snapshots through x402 | `agent-pay/` Worker, route `/machine/*` and `/mcp` |
| Agent wallet signer | Local prototype only | Not mounted on the public container or Cloudflare |

The optional Docker/see.io server in `main.py` serves the website and a read-only MCP preview. It deliberately does not mount `agent_protocol.py`. A `BAW_MASTER_KEY` environment variable does not turn the public server into a signer. Do not put signing keys or bootstrap credentials into either Cloudflare Worker.

## HUMAN flow

1. `/human` redirects to `/human/setup`. Four focused screens collect identity and theme, custody, chains and security. Choices persist in browser storage and can be edited by moving backward.
2. `/human/studio` provides the marketplace-style feature catalog, presets, skins, live phone concept and a prominent Deploy Wallet action.
3. `/human/release` is mainnet only. It checks entitlement and sends an unsubscribed user to the $1.99 monthly crypto-only `/human/pay` confirmation flow.
4. `/human/download` polls the build service and displays a QR code and APK link only after the API reports a completed signed artifact. `/human/live` remains available for free read-only Base or Solana mainnet balances.

The previously shared APK is a WebView wrapper, not a functional Android wallet. The download screen therefore stays locked unless the build API returns a completed signed artifact and its URL. HUMAN design remains a browser-local preview. The three read-only API plans are $12, $39 and $99 USDC for 30 days, payable on Base or Solana mainnet. Wallet ownership, confirmed payment receipts, one-time transaction accounting and subscription expiry govern API access only. See [the Access setup](CLOUDFLARE_ACCESS.md), [deployment steps](DEPLOY_MAINNET.md), and [Android release gap](ANDROID_RELEASE.md).

## NON-HUMAN payment flow

`GET /machine/info` is free discovery. `GET /machine/wallet?address=0x...` reads Base mainnet and `GET /machine/solana-wallet?address=...` reads Solana mainnet. A valid unpaid request gets an x402 HTTP 402 challenge for $0.01 USDC on either chain. Payments on Base go to `0xBcCA6AED433d9020C50D44560F9679F1B5eB511d`; payments on Solana go to `Ew8mbrKwD6LGaSX28a6XGmXqeQSs2hykRibjXVhftTRC`. The Worker needs separate mainnet RPC URLs and a production facilitator. See [the machine service README](agent-pay/README.md).

The free `/machine/quote` gives supported prices and API unit costs. Subscribed reads cover native balances, USDC and transaction status (one unit each), plus composite native and USDC snapshots (two units each, independent RPC reads). MCP exposes those reads, quota and quote tools, and x402 paid native wallet tools. The Worker returns a payment challenge to a compatible client; the payer signs locally.

## Deploy

See [the mainnet deployment runbook](DEPLOY_MAINNET.md) for the three Cloudflare surfaces, Wrangler commands, checks and remaining release gates. Pushing `main` also triggers the separate see.io container build per `AGENTS.md`; the Cloudflare Workers require their own deployment commands. A Pages build must use `static/` as output and keep the repository root as project root for `functions/w/[code].js`.
