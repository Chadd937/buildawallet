#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Validate the new backend before changing the existing production Worker.
node scripts/preflight.mjs
npx wrangler whoami
npm run typecheck
npm test
npm run build
node scripts/prepare-cloudflare.mjs
# Upload server configuration without exposing values in arguments or source control.
node --input-type=module <<'JS'
import { spawnSync } from 'node:child_process';
import { loadDeploymentConfig, deploymentSecrets } from './scripts/deployment-config.mjs';
const { values } = loadDeploymentConfig();
const configPath = 'dist/server/wrangler.json';
const result = spawnSync('npx',['wrangler','secret','bulk','--config',configPath],{input:JSON.stringify(deploymentSecrets(values)),stdio:['pipe','inherit','inherit']});
if (result.status !== 0) process.exit(result.status ?? 1);
JS
npx wrangler deploy --config dist/server/wrangler.json
node scripts/smoke.mjs https://buildawallet.xyz
