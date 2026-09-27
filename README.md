# BuildAWallet.xyz

BuildAWallet has a HUMAN wallet designer and a NON-HUMAN read-only machine data API. The public website does **not** create custodial wallets or sign and broadcast transactions.

| Surface | Current capability | Deployment |
| --- | --- | --- |
| HUMAN Pages site | Email-verified account, two-step onboarding, interactive Studio blueprint, JSON export, external wallet connection and read-only Base/Solana native balance | Cloudflare Access guards `/human`, `/human/*`, `/pay` and saved designs; the Worker serves HUMAN pages |
| HUMAN API | Architect chat, saved designs, gallery and stats | `cloudflare-human/` Python Worker with D1, routes `/api/*` and `/healthz` |
| NON-HUMAN data | Base and Solana read-only API, composite snapshots, MCP tools, and $0.01 USDC native snapshots through x402 | `agent-pay/` Worker, route `/machine/*` and `/mcp` |
| Agent wallet signer | Local prototype only | Not mounted on the public container or Cloudflare |

The optional Docker/see.io server in `main.py` serves the website and a read-only MCP preview. It deliberately does not mount `agent_protocol.py`. A `BAW_MASTER_KEY` environment variable does not turn the public server into a signer. Do not put signing keys or bootstrap credentials into either Cloudflare Worker.

## HUMAN flow

1. Pressing HUMAN reaches Cloudflare Access email verification. The verified session opens `/human`, where `/human/account` creates a pseudonymous D1 account record without storing the raw email.
2. Two onboarding screens collect a name, mainnet chains, appearance, custody, assets and features. Choices persist locally and open `/human/studio`.
3. Studio exposes the full catalog, an interactive phone concept and free design JSON and implementation-plan exports. `/human/build` remains an alternate guided path.
4. `/human/live` connects an existing injected wallet for free read-only Base or Solana mainnet balances.

The previously shared APK is a WebView wrapper, not a functional Android wallet. Studio does not present it as a deployable wallet. A functional Android wallet APK is not yet implemented or released. HUMAN design and both exports are free after Cloudflare Access sign-in. The three read-only API plans are $12, $39 and $99 USDC for 30 days, payable on Base or Solana mainnet. Wallet ownership, confirmed payment receipts, one-time transaction accounting and subscription expiry govern API access only. See [the Access setup](CLOUDFLARE_ACCESS.md), [deployment steps](DEPLOY_MAINNET.md), and [Android release gap](ANDROID_RELEASE.md).

## NON-HUMAN payment flow

`GET /machine/info` is free discovery. `GET /machine/wallet?address=0x...` reads Base mainnet and `GET /machine/solana-wallet?address=...` reads Solana mainnet. A valid unpaid request gets an x402 HTTP 402 challenge for $0.01 USDC on either chain. Payments on Base go to `0xBcCA6AED433d9020C50D44560F9679F1B5eB511d`; payments on Solana go to `Ew8mbrKwD6LGaSX28a6XGmXqeQSs2hykRibjXVhftTRC`. The Worker needs separate mainnet RPC URLs and a production facilitator. See [the machine service README](agent-pay/README.md).

The free `/machine/quote` gives supported prices and API unit costs. Subscribed reads cover native balances, USDC and transaction status (one unit each), plus composite native and USDC snapshots (two units each, independent RPC reads). MCP exposes those reads, quota and quote tools, and x402 paid native wallet tools. The Worker returns a payment challenge to a compatible client; the payer signs locally.

## Deploy

See [the mainnet deployment runbook](DEPLOY_MAINNET.md) for the three Cloudflare surfaces, Wrangler commands, checks and remaining release gates. Pushing `main` also triggers the separate see.io container build per `AGENTS.md`; the Cloudflare Workers require their own deployment commands. A Pages build must use `static/` as output and keep the repository root as project root for `functions/w/[code].js`.
