#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! npx --yes wrangler d1 list --json > .d1-list.json; then
  echo 'Wrangler cannot access Cloudflare. Run: npx wrangler login' >&2
  exit 1
fi

match_count=$(python3 - <<'PYCOUNT'
import json
with open('.d1-list.json') as source:
    print(sum(row.get('name') == 'buildawallet' for row in json.load(source)))
PYCOUNT
)
if [ "$match_count" -gt 1 ]; then
  echo 'Multiple D1 databases named buildawallet; resolve this before deploying.' >&2
  exit 1
fi
if [ "$match_count" -eq 0 ]; then
  npx --yes wrangler d1 create buildawallet
  npx --yes wrangler d1 list --json > .d1-list.json
fi

python3 - <<'PY'
import json
from pathlib import Path
entries = json.loads(Path('.d1-list.json').read_text())
matches = [entry for entry in entries if entry.get('name') == 'buildawallet']
if len(matches) != 1:
    raise SystemExit('Expected exactly one D1 database named buildawallet')
identifier = matches[0].get('uuid') or matches[0].get('id')
if not identifier:
    raise SystemExit('D1 database ID missing from Wrangler output')
config = Path('wrangler.jsonc').read_text().replace('00000000-0000-4000-8000-000000000001', identifier)
Path('wrangler.deploy.jsonc').write_text(config)
PY

./prepare.sh
npx --yes wrangler d1 migrations apply buildawallet --remote --config wrangler.deploy.jsonc
if ! npx --yes wrangler d1 execute buildawallet --remote --config wrangler.deploy.jsonc \
  --command 'SELECT plan_id FROM human_entitlements LIMIT 0' > /dev/null; then
  echo 'Shared-plan D1 migration is not applied. Deployment stopped; rerun and approve the D1 migration.' >&2
  exit 1
fi
if ! npx --yes wrangler d1 execute buildawallet --remote --config wrangler.deploy.jsonc \
  --command 'SELECT subject_hash FROM human_accounts LIMIT 0' > /dev/null; then
  echo 'HUMAN account migration is not applied. Deployment stopped.' >&2
  exit 1
fi
uv run pywrangler deploy --config wrangler.deploy.jsonc

if curl --fail --silent --show-error https://buildawallet.xyz/healthz > /dev/null; then
  echo 'HUMAN Worker health responded. The service binding is checked during agent-pay deployment.'
else
  echo 'HUMAN Worker health is unavailable. Check deployment and /machine/human/catalog through the service binding.' >&2
fi
