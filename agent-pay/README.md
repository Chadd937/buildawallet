# BuildAWallet machine payments pilot

This is an isolated Cloudflare Worker in the existing BuildAWallet repository. It uses
the `/machine/*` route on `buildawallet.xyz`; it does not mount the local signing
prototype, handle private keys, or change the human designer and its $1.99/month
mainnet subscription concept.

Paid capabilities are `GET /machine/wallet?address=0x...` for Base mainnet
native balance, transaction count and block, and
`GET /machine/solana-wallet?address=...` for Solana mainnet SOL balance and slot.
The Worker validates an address, obtains the complete snapshot from the
configured chain RPC, then issues an x402 challenge for
**$0.01 USDC on Base or Solana mainnet**. PayAI verifies and settles the
payment to the designated collector on the selected network:

| Payment network | USDC receiving address |
| --- | --- |
| Base | `0xBcCA6AED433d9020C50D44560F9679F1B5eB511d` |
| Solana | `Ew8mbrKwD6LGaSX28a6XGmXqeQSs2hykRibjXVhftTRC` |
No claim of wallet custody, transaction signing, risk analysis, or token holdings is made.

## Local setup

```bash
cd agent-pay
npm ci
cp .dev.vars.example .dev.vars
# edit .dev.vars with reliable Base and Solana mainnet RPC URLs
npm run typecheck
npm test
npm run dev
```

`BASE_RPC_URL` must point to Base mainnet (chain ID 8453). `SOLANA_RPC_URL`
must point to Solana mainnet. Do not place a
private key in this Worker. `.dev.vars` is ignored. The receiving addresses
are public and were supplied by the owner for Base and Solana respectively.

Call the free discovery endpoint at `/machine/info`. A valid unpaid request to
`/machine/wallet?address=...` returns HTTP 402 with an x402 payment challenge.
A compatible client with Base or Solana mainnet USDC can pay and retry. Invalid addresses return
400 before payment. Missing deployment configuration returns 503. The Worker
limits calls to the paid path to 60 per minute per requesting IP at each Cloudflare
location, before fetching from the RPC or facilitator. Shared IPs can hit this
limit together.

## Deploy

Set `BASE_RPC_URL` and `SOLANA_RPC_URL` with `npx wrangler secret put`, then run
`npm run deploy` from this directory. Verify `/machine/info`, invalid address
400, unpaid valid address 402, and a paid request with real USDC. The custom
domain route requires the zone in the Cloudflare account used by Wrangler.

The x402 payment network can be Base or Solana mainnet. The returned data is
from the queried Base or Solana chain. PayAI is an external production facilitator. Confirm its
`/supported` response for both exact schemes before accepting traffic.
This endpoint is a first real-payment capability; wallet balances themselves
are public data. A broader business needs data whose value exceeds RPC and
facilitator costs, plus rate controls and observability.

## Controlled mainnet payment check

`npm run smoke:paid -- base --prepare` and
`npm run smoke:paid -- solana --prepare` fetch the live 402 challenges without
signing. The script refuses to pay if the resource, network, USDC mint/contract,
10,000 atomic units ($0.01), or collector differs from the expected value.

Use **separate, small-funded test payer wallets**, never the collector wallets.
The Base payer needs Base USDC; the Solana payer needs Solana USDC and a Solana
CLI-style 64-byte JSON keypair file with mode 0600. Use a keyed mainnet RPC for
Solana and preferably for Base receipt verification. Keep private keys, keypair
files and RPC keys out of Git and chat. Store the Solana keypair file **outside**
the Git checkout. Run these lines **one at a time** in a trusted local interactive
shell: each hidden `read` waits for you to enter only the requested secret URL
or key and press Enter. Pasting the entire block at once can put the next shell
command into a secret variable.

```bash
cd agent-pay
npm ci
npm run smoke:paid -- base --prepare
npm run smoke:paid -- solana --prepare

read -rsp 'Base test payer private key: ' BAW_TEST_EVM_PRIVATE_KEY; echo
export BAW_TEST_EVM_PRIVATE_KEY
read -rsp 'Base mainnet RPC URL: ' BAW_BASE_RPC_URL; echo
export BAW_BASE_RPC_URL
npm run smoke:paid -- base --check-funds
npm run smoke:paid -- base --execute
unset BAW_TEST_EVM_PRIVATE_KEY BAW_BASE_RPC_URL

export BAW_TEST_SOLANA_KEYPAIR_FILE=/absolute/path/to/test-payer.json
read -rsp 'Solana mainnet RPC URL: ' BAW_SOLANA_RPC_URL; echo
export BAW_SOLANA_RPC_URL
npm run smoke:paid -- solana --check-funds
npm run smoke:paid -- solana --execute
unset BAW_TEST_SOLANA_KEYPAIR_FILE BAW_SOLANA_RPC_URL
```

The `--check-funds` mode requires at least $0.01 USDC in the payer's canonical
associated token account and checks that the collector's Solana USDC associated
token account exists. It never signs. A missing collector account makes the
facilitator's `TransferChecked` simulation fail. The collector account can be
created by a separate SOL-funded fee payer without the collector's private
key. For example, after verifying the collector address, with the Solana RPC URL
and test payer keypair variables set as above, this command creates the account
at the deterministic address (the test payer pays SOL rent and the transaction fee):

```bash
spl-token --url "$BAW_SOLANA_RPC_URL" --fee-payer "$BAW_TEST_SOLANA_KEYPAIR_FILE" create-account EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v --owner Ew8mbrKwD6LGaSX28a6XGmXqeQSs2hykRibjXVhftTRC
```

Verify that the CLI prints the expected associated token account and rerun
`npm run smoke:paid -- solana --check-funds` before attempting to pay. Keep
this account open; some wallet swap flows close an empty USDC account after use.
The explicit `--execute` mode repeats the checks,
asks for `PAY BASE` or `PAY SOLANA` before signing,
sends exactly one paid request, checks the x402 settlement header, and verifies
the USDC transfer in the onchain transaction. It does not retry a paid request.
If the HTTP response is lost or receipt verification fails, inspect the payer and
collector transactions before attempting another payment.
