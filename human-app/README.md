# BuildAWallet HUMAN frontend

The React and TanStack Router frontend for the wallet setup, Studio, browser wallet, and download flow. The canonical source is `Chadd937/buildawallet`, branch `main`.

## Development

Use Node.js 22 and npm from the `human-app` directory:

```sh
npm ci --legacy-peer-deps --no-audit --no-fund
npm run dev
npm run build
```

`package-lock.json` is the dependency lockfile. The Vite configuration uses the standard React, Tailwind CSS, and TanStack Router plugins.

## Publish frontend assets

From the repository root, run `bash scripts/publish-human.sh` to build the frontend and copy the route shells and assets into `static/`. See `DEPLOY_MAINNET.md` for Cloudflare backend and payment Worker deployment.
