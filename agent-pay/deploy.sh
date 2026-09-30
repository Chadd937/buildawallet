#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Reuse the HUMAN Worker D1 database. Never deploy a placeholder database ID.
npx wrangler d1 list --json > .d1-list.json
python3 - <<'PY'
import json
from pathlib import Path
matches = [row for row in json.loads(Path('.d1-list.json').read_text()) if row.get('name') == 'buildawallet']
if len(matches) != 1:
    raise SystemExit('Expected one existing D1 database named buildawallet; deploy cloudflare-human first')
identifier = matches[0].get('uuid') or matches[0].get('id')
if not identifier:
    raise SystemExit('D1 database ID missing')
Path('wrangler.deploy.jsonc').write_text(Path('wrangler.jsonc').read_text().replace('00000000-0000-4000-8000-000000000001', identifier))
PY

npx wrangler d1 migrations apply buildawallet --remote --config wrangler.deploy.jsonc
if ! npx wrangler d1 execute buildawallet --remote --config wrangler.deploy.jsonc \
  --command 'SELECT plan_id FROM human_entitlements LIMIT 0' > /dev/null; then
  echo 'Shared-plan D1 migration is not applied. Deployment stopped; rerun and approve the D1 migration.' >&2
  exit 1
fi
if ! npx wrangler d1 execute buildawallet --remote --config wrangler.deploy.jsonc \
  --command 'SELECT subject_hash FROM human_accounts LIMIT 0' > /dev/null; then
  echo 'HUMAN account migration is not applied. Deployment stopped.' >&2
  exit 1
fi

# Typecheck generates src/human-pages.ts and src/swagger-assets.ts. This must
# happen before Wrangler bundles the Worker, especially when recreating a
# deleted Worker from a fresh checkout.
npm run typecheck
npm test

# Deploy once before checking secrets so a deleted/new Worker can be recreated.
# Existing Worker secrets survive a normal code deployment; a newly recreated
# Worker will exist after this command so `wrangler secret put` can be used.
npx wrangler deploy --config wrangler.deploy.jsonc

set +e
secret_json=$(npx wrangler secret list --format json --config wrangler.deploy.jsonc 2>/dev/null)
secret_status=$?
set -e
if [ "$secret_status" -ne 0 ]; then
  echo 'Worker was deployed, but Wrangler could not list its secrets.' >&2
  echo 'Check `npx wrangler whoami`, then configure the required secrets and rerun npm run deploy.' >&2
  exit 1
fi

missing=$(printf '%s' "$secret_json" | python3 -c 'import json,sys; names={s["name"] for s in json.load(sys.stdin)}; required={"CF_ACCESS_TEAM_DOMAIN","CF_ACCESS_AUD","BASE_RPC_URL","SOLANA_RPC_URL"}; print(" ".join(sorted(required-names)))')
if [ -n "$missing" ]; then
  echo "Worker recreated successfully. Configure these secrets, then rerun npm run deploy: $missing" >&2
  echo 'Use: npx wrangler secret put SECRET_NAME --config wrangler.deploy.jsonc' >&2
  exit 1
fi

curl --fail --silent --show-error https://buildawallet.xyz/machine/info > /dev/null
curl --fail --silent --show-error 'https://buildawallet.xyz/machine/quote?chain=base&kind=wallet&access=x402' | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["price"]["amountAtomic"] == "10000" and len(d["paymentOptions"]) == 2'
curl --fail --silent --show-error 'https://buildawallet.xyz/machine/quote?chain=solana&kind=snapshot&access=subscription' | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["units"] == 2 and d["mcpTool"] == "solana_snapshot"'
curl --fail --silent --show-error https://buildawallet.xyz/machine/human/subscription | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["available"] is True and [(p["id"],p["priceUSDC"]) for p in d["plans"]] == [("builder","12.00"),("pro","39.00"),("scale","99.00")]'
curl --fail --silent --show-error https://buildawallet.xyz/machine/openapi.json | python3 -c 'import json,sys; d=json.load(sys.stdin); required=["/machine/v1/batch","/machine/quote","/machine/v1/base/snapshot/{address}","/machine/v1/base/transaction/prepare","/machine/v1/base/transaction/broadcast","/machine/v1/solana/transaction/prepare","/machine/v1/solana/transaction/broadcast"]; assert d["openapi"].startswith("3.1") and all(p in d["paths"] for p in required)'
curl --fail --silent --show-error https://buildawallet.xyz/api-docs > /dev/null
curl --fail --silent --show-error https://buildawallet.xyz/api-docs/swagger-ui.css > /dev/null
curl --fail --silent --show-error https://buildawallet.xyz/api-docs/swagger-ui-bundle.js > /dev/null
curl --fail --silent --show-error https://buildawallet.xyz/.well-known/agent.json > /dev/null
curl --fail --silent --show-error https://buildawallet.xyz/llms.txt > /dev/null
