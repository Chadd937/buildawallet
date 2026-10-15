# Nine-chain same-network payments — staged rollout (October 2026)

**Status: feature branch only, NOT deployed.** Production remains on `main`.
Do not replace the apex / or the existing `/machine/*` / `/mcp` Worker
routes without a separate rollback and customer-entitlement audit.

## Canonical NEW prepaid subscriptions

| Plan | Price / 30 days | API units |
|---|---:|---:|
| Starter (`builder`) | $15 | 100,000 |
| Pro (`pro`) | $49 | 500,000 |
| Scale (`scale`) | $149 | 2,000,000 |

A user querying network X should use an on-chain payment on X to buy prepaid
units: canonical USDC on seven EVM mainnets or Solana, BTC on Bitcoin. Every
quote specifies the exact collector, token, precision, amount, chain and expiry;
a receipt must be verified before crediting any API keys. A resulting prepaid
key can read other supported chains without another on-chain payment.

The old `agent-pay` $12/$39/$99 plans (500/5,000/25,000 units) remain LEGACY.
Existing customers keep their existing keys, quotas, expiry and billing flow,
until an explicit reconciled migration. Never reinterpret historical payments
at new prices or automatically bump old quotas. The staged nine-chain code
checks `human_api_keys` only after not finding the key in new tables, and
debits the same atomic `human_api_usage` counter as the old service.

## Network payment support

- Ethereum: Ethereum USDC prepaid
- Base: Base USDC prepaid; candidate instant x402
- Arbitrum: Arbitrum USDC prepaid
- Optimism: Optimism USDC prepaid
- Polygon: Polygon USDC prepaid; candidate instant x402
- BNB Chain: BNB USDC prepaid (canonical token address fixed on this branch)
- Avalanche: Avalanche USDC prepaid
- Solana: Solana USDC prepaid; candidate instant x402
- Bitcoin: BTC on-chain prepaid, **not** BTC x402 or $0.01 on-chain per-call

The current CDP facilitator has documented Base, Polygon, Solana coverage.
Other networks must not advertise instant x402 before a compatible mainnet
facilitator has been confirmed for the specific `(exact,network)` pair. Even
the three candidates require an actual staging 402->verify->settle test.

This does NOT claim Bitcoin PSBT creation/broadcast: the current nine-chain API
supports Bitcoin reads and payment proof but Bitcoin send signing is separate.

## Safe, scoped API endpoints

- GET `/api/public/machine/v1/chains`
- GET `/api/public/machine/v1/plans`
- GET `/api/public/machine/v1/{chain}/wallet/{address}`
- GET `/api/public/machine/v1/{chain}/transaction/{tx}`
- POST `/api/public/machine/v1/agent/quote` (`chain` is requested network)
- POST `/api/public/machine/v1/agent/activate`
- POST `/api/public/mcp` (MCP)
- GET `/api/public/machine/openapi.json`
- GET `/api/public/machine/agent.json`
- GET `/api/public/machine/llms.txt`

Legacy `/machine/*`, `/mcp`, and root discovery stay on the old Worker until
the new service has been proven. Do not retire them automatically.

## Required predeployment gates

1. Inspect local checkout state; do not discard uncommitted code.
2. Read production aggregates: from `human-app`, run
   `node scripts/audit-billing-readonly.mjs`. The script never prints identities
   or writes to D1. Save the counts and any outstanding quote amounts.
3. Take a dated backup of production D1 using Wrangler's supported backup/export
   method and verify that it can be restored.
4. Audit already-applied `baw_0006_multichain_payments.sql` state in D1. It
   rewrote older pending quote amounts on some installations. Never rerun/modify
   an applied migration on production without a quote-level reconciliation.
5. `cd human-app && npm run typecheck && npm test && npm run build`. Stop on
   failures and do not deploy.
6. Stage on a separate preview Worker or test environment with its own D1 copy.
   Verify all nine chain reads, quote price/collector/token/decimals and
   activation for EVM/Solana/BTC, plus old active and expired key handling.
7. Only after owner review: deploy scoped `buildawallet-human-app` Worker;
   keep `buildawallet-agent-pay` and its routes unchanged.
8. Run `node human-app/scripts/nine-chain-agent-probe.mjs` against production
   and verify every network returns the correct same-network payment offer;
   use an intentionally authorized, low-risk onchain payment for final receipt
   tests only after separate budget and recipient approval.
9. After monitoring, update root discovery to point new customers to the
   nine-chain API; preserve old API/key/receipt endpoints for existing customers.

## Rollback

Revert only the human-app Worker to its prior Cloudflare version, leaving
`buildawallet-agent-pay` and Pages unchanged. Do not roll back D1 by dropping
tables, truncating usage or deleting payment records. Restore database only
from a verified backup after reconciling any intervening transactions.

## Still unverified

- Real paid x402 settlement (not just 402 headers)
- Real BTC, EVM, Solana checkout activation on the new service
- Existing customer migration counts and outstanding old quotes
- Same-chain response behavior from Cloudflare after build/deployment
- Bitcoin send/PSBT support and complex NFTs/Ordinals indexing
