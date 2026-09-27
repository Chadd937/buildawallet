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
npx wrangler secret list --format json --config wrangler.deploy.jsonc | python3 -c 'import json,sys; names={s["name"] for s in json.load(sys.stdin)}; missing={"CF_ACCESS_TEAM_DOMAIN","CF_ACCESS_AUD"}-names; assert not missing, "Set Cloudflare Access secrets first: "+", ".join(sorted(missing))'
node scripts/check-human-access.mjs
npx wrangler d1 migrations apply buildawallet --remote --config wrangler.deploy.jsonc
# A declined migration can exit successfully. Do not ship a Worker against
# an older schema if the operator answered "no" at the D1 prompt.
if ! npx wrangler d1 execute buildawallet --remote --config wrangler.deploy.jsonc \
  --command 'SELECT plan_id FROM human_entitlements LIMIT 0' > /dev/null; then
  echo 'Shared-plan D1 migration is not applied. Deployment stopped; rerun and approve the D1 migration.' >&2
  exit 1
fi
npm run typecheck
npm test
npx wrangler deploy --config wrangler.deploy.jsonc
node scripts/check-human-access.mjs
curl --fail --silent --show-error https://buildawallet.xyz/machine/info > /dev/null
curl --fail --silent --show-error 'https://buildawallet.xyz/machine/quote?chain=base&kind=wallet&access=x402' | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["price"]["amountAtomic"] == "10000" and len(d["paymentOptions"]) == 2'
curl --fail --silent --show-error 'https://buildawallet.xyz/machine/quote?chain=solana&kind=snapshot&access=subscription' | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["units"] == 2 and d["mcpTool"] == "solana_snapshot"'
curl --fail --silent --show-error https://buildawallet.xyz/machine/human/catalog > /dev/null
curl --fail --silent --show-error https://buildawallet.xyz/machine/human/subscription | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["available"] is True and [(p["id"],p["priceUSDC"]) for p in d["plans"]] == [("builder","12.00"),("pro","39.00"),("scale","99.00")]'
curl --fail --silent --show-error https://buildawallet.xyz/machine/openapi.json | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["openapi"].startswith("3.1") and all(p in d["paths"] for p in ["/machine/v1/batch","/machine/quote","/machine/v1/base/snapshot/{address}","/machine/human/payments"])'
curl --fail --silent --show-error https://buildawallet.xyz/api-docs > /dev/null
curl --fail --silent --show-error https://buildawallet.xyz/api-docs/swagger-ui.css > /dev/null
curl --fail --silent --show-error https://buildawallet.xyz/api-docs/swagger-ui-bundle.js > /dev/null
curl --fail --silent --show-error https://buildawallet.xyz/terms | grep 'Plans, payment and renewal' > /dev/null
curl --fail --silent --show-error https://buildawallet.xyz/privacy | grep 'Your designs and browser storage' > /dev/null
curl --fail --silent --show-error https://buildawallet.xyz/docs | grep 'id="non-human"' > /dev/null
curl --fail --silent --show-error https://buildawallet.xyz/ | grep 'ONE PLATFORM · TWO MODES' > /dev/null
curl --fail --silent --show-error https://buildawallet.xyz/pricing > /dev/null
curl --fail --silent --show-error https://buildawallet.xyz/.well-known/agent.json > /dev/null
curl --fail --silent --show-error https://buildawallet.xyz/llms.txt > /dev/null
