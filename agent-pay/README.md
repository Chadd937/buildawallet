# BuildAWallet machine API, MCP, and HUMAN release

`buildawallet-agent-pay` owns the paid machine surfaces under `/machine/*`, `/mcp`, discovery, and API docs. It does **not** own the Pages frontend. HUMAN wallet design and release remain free; paid plans apply only to machine API/MCP usage.

## Architecture

- `buildawallet` Pages: `/`, `/human/*`, `/pay`, docs/legal frontend pages.
- `buildawallet-human-api`: `/api/*` and `/healthz`.
- `buildawallet-agent-pay`: `/machine/*`, `/mcp`, `/.well-known/agent.json`, `/agent-offer.json`, `/llms.txt`, `/api-docs*`, `/openapi.json`.

The Worker never accepts seed phrases or private keys. Transaction signing always happens in the caller's wallet.

## HUMAN flow

HUMAN design and mainnet release are free. The React release screen calls:

- `POST /api/human/build`
- `GET /api/human/build/:buildId`

The Python HUMAN Worker returns the configured signed APK URL when `HUMAN_APK_URL` is set. `HUMAN_APK_SHA256` is optional but recommended. No HUMAN subscription invoice or entitlement is required.

`/pay` is reserved for machine API plans. `/human/pay` only explains that HUMAN release is free and links back to release.

## Machine API plans

Machine plans remain paid in native USDC on Base or Solana:

| Plan | Price | Units / 30 days | Batch |
| --- | ---: | ---: | ---: |
| Builder | $12 USDC | 500 | none |
| Pro | $39 USDC | 5,000 | 10 |
| Scale | $99 USDC | 25,000 | 50 |

API keys use the `baw_live_` format and are issued only after the existing wallet-signature and onchain payment verification flow.

## Read API

Subscribed callers can read:

- Base native balance / nonce / block
- Solana SOL balance / slot
- Base and Solana native USDC balances
- Base and Solana transaction status
- composite native + USDC snapshots
- batch reads on Pro and Scale

The existing x402 native-wallet snapshot endpoints remain available for $0.01 USDC per call.

## Non-custodial transaction API

The machine API now supports transaction preparation and broadcast on Base and Solana mainnet.

### Prepare

```text
POST /machine/v1/base/transaction/prepare
POST /machine/v1/solana/transaction/prepare
```

Each successful preparation costs one API unit.

Base accepts `from`, `to`, `asset` (`native` or `usdc`), and `amountAtomic`. Native Base transfers may include optional hex `data`. The response contains an unsigned EIP-1559 transaction with current nonce, gas estimate, and fee fields.

Solana accepts `from`, `to`, `asset`, and `amountAtomic`. Native SOL preparation returns a serialized legacy transaction with a zeroed signature slot. Solana USDC additionally requires `sourceTokenAccount` and `destinationTokenAccount`, and produces a `TransferChecked` instruction using native Solana USDC.

The caller signs locally. BuildAWallet never receives a private key.

### Broadcast

```text
POST /machine/v1/base/transaction/broadcast
POST /machine/v1/solana/transaction/broadcast
```

Base accepts `signedTransaction` as raw signed EVM hex and relays it with `eth_sendRawTransaction`.

Solana accepts `signedTransactionBase64` and relays it with `sendTransaction`, preflight enabled.

Each successful broadcast costs one API unit. Failed validation or upstream failure is not metered.

## MCP

`/mcp` exposes the read tools plus:

- `base_prepare_transaction`
- `base_broadcast_transaction`
- `solana_prepare_transaction`
- `solana_broadcast_transaction`

Preparation is non-custodial; broadcast requires a transaction already signed outside BuildAWallet.

## Local verification

```bash
cd agent-pay
npm ci
npm run typecheck
npm test
npx wrangler deploy --config wrangler.jsonc --dry-run
```

For the HUMAN app:

```bash
cd ../human-app
npm ci
npm run build
```

For the Python Worker:

```bash
cd ..
pytest -q tests/test_cloudflare_human.py
```

## Production configuration

`buildawallet-agent-pay` requires working Base and Solana mainnet RPC URLs, D1, its rate limiter, and the `HUMAN_API` service binding.

`buildawallet-human-api` requires the existing D1 binding plus:

```text
HUMAN_APK_URL=https://.../signed-buildawallet.apk
HUMAN_APK_SHA256=<optional 64-character lowercase sha256>
```

The APK URL may point at R2 or another HTTPS artifact origin. The endpoint refuses to advertise an APK until a valid HTTPS URL is configured.

## Deploy order

1. Build/publish the HUMAN Pages bundle.
2. Deploy `buildawallet-human-api`.
3. Deploy `buildawallet-agent-pay`.
4. Deploy Pages to the `buildawallet` project.
5. Verify `/human/release`, `/pay`, `/machine/openapi.json`, `/mcp`, transaction preparation, and an intentionally invalid signed-transaction broadcast before using real funds.

Public API reference: `/api-docs`  
OpenAPI: `/machine/openapi.json`
