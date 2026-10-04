#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Validate the new backend before changing the existing production Worker.
node scripts/preflight.mjs
npx wrangler whoami
npm run typecheck
npm test
npm run build
# Upload server configuration without exposing values in arguments or source control.
node --input-type=module <<'JS'
import { spawnSync } from 'node:child_process';
try { process.loadEnvFile(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const names = ['SUPABASE_SERVICE_ROLE_KEY','OPENAI_API_KEY','OPENAI_MODEL','OPENAI_BASE_URL','BASE_RPC_URL','SOLANA_RPC_URL','ETHEREUM_RPC_URL','ARBITRUM_RPC_URL','OPTIMISM_RPC_URL','POLYGON_RPC_URL','BNB_RPC_URL','AVALANCHE_RPC_URL'];
const values = Object.fromEntries(names.filter(name=>process.env[name]).map(name=>[name,process.env[name]]));
const result = spawnSync('npx',['wrangler','secret','bulk','--config','dist/server/wrangler.json'],{input:JSON.stringify(values),stdio:['pipe','inherit','inherit']});
if (result.status !== 0) process.exit(result.status ?? 1);
JS
npx wrangler deploy --config dist/server/wrangler.json
node scripts/smoke.mjs https://buildawallet.xyz
