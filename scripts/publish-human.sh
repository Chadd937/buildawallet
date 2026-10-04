#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/human-app"
npm ci --legacy-peer-deps --no-audit --no-fund
npm run build
echo 'The full app Worker bundle is human-app/dist/server/wrangler.json.'
echo 'Deploy with npm run deploy from human-app after configuring the new backend.'
