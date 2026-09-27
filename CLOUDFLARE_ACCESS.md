# Cloudflare Access for the HUMAN site

The landing page, pricing, docs, OpenAPI, MCP and machine API remain public. Cloudflare Access prompts for sign-in only on HUMAN pages, the payment page, saved designs, and the HUMAN builder's design endpoints. A Cloudflare identity login does not grant a paid plan: a customer still signs with the paying wallet and confirms a USDC payment.

## Create one Access application

On the Cloudflare account that owns `buildawallet.xyz`, open **Zero Trust > Access controls > Applications > Create new application > Self-hosted and private > Add public hostname**. Name it `BuildAWallet HUMAN`. Add all of these public hostname paths under `buildawallet.xyz` to the **same application**:

| Path | Purpose |
| --- | --- |
| `/human` | HUMAN entry |
| `/human/*` | Builder, studio, live balances and alternate pay URL |
| `/pay` | Subscription payment page |
| `/w/*` | Saved HUMAN designs |
| `/machine/human/chat` | Builder conversation |
| `/machine/human/save` | Save design |
| `/machine/human/gallery` | Gallery |
| `/machine/human/wallet/*` | Saved design lookup |
| `/api/*` | Direct HUMAN API, including chat, saved designs and catalog |
| `/human*.html` | Direct static page URLs, including the payment page |
| `/static/human*.html` | Static origin page aliases |

Add each table row as its own path entry, including the leading slash. The separate `/human` entry is required because `/human/*` does not match the parent path. Do not use the bare `buildawallet.xyz` hostname or `/*`, and do not turn on account-wide **Block traffic to all domains in this account**. Those settings would also affect `/`, `/machine/*`, `/mcp`, discovery, docs and other public services.

Add an **Allow** policy with **Include: Everyone**. For a customer-facing login, select **One-time PIN** as the login method so any visitor with a verified email address can enter. A policy restricted to selected emails would make the public HUMAN offer inaccessible to other customers. Use a short application session such as 24 hours. Access must not use a Bypass policy for these paths. If you deliberately want Cloudflare account holders only, select the Cloudflare identity provider instead of One-time PIN and communicate that requirement to customers.

In the saved application's **Additional settings**, copy the **Application Audience (AUD) Tag**. Also copy your team's Access domain, in the form `https://your-team.cloudflareaccess.com`. These two values are used to verify Access signatures at the HUMAN Worker. The Worker rejects unsigned requests, expired or wrong-audience JWTs, and machine service tokens on protected pages.

## Set the Worker configuration and deploy

Use the authenticated machine with the cloned repository. Enter the actual AUD and full team URL at the hidden prompts, one command at a time; do not paste them into Git or chat.

```bash
cd ~/buildawallet-paid-test
git pull --ff-only origin main
cd agent-pay
npm ci
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN --config wrangler.jsonc
npx wrangler secret put CF_ACCESS_AUD --config wrangler.jsonc
npm run deploy
```

The deploy script checks that both values are present and that an anonymous request is redirected to Access on every protected path, while the landing page and machine discovery remain HTTP 200 without a login. It stops before uploading if Access has not been scoped correctly. After deployment, visit `/human` and `/pay` in a private browsing window to complete a Cloudflare sign-in. Verify `/` and `/machine/info` still load without one.

The programmatic subscription, API-key and premium blueprint endpoints under `/machine/human/*` keep their existing wallet signature, payment and bearer-session checks, so agents can subscribe without a browser-based Cloudflare login. The builder's chat, save, gallery and saved-design endpoints require Access. Direct `/api/*` access requires a login; the `HUMAN_API` service binding remains available for the public machine subscription routes. A saved design URL is now available to anyone with the link **after** Access sign-in.

Cloudflare Access is enforced on the `buildawallet.xyz` host at the edge. The page and payment Worker also verifies the signed Access JWT for its protected routes. Both Workers disable their `workers.dev` and preview URLs in this release. The known see.io alternate site URL redirects HUMAN pages and direct HUMAN API paths to `buildawallet.xyz`; check any other origin hostname before treating it as private.
