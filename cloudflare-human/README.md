# HUMAN API on Cloudflare Workers

This project runs the HUMAN wallet architect in a Python Worker. Pages serves the frontend from `static/`. D1 stores saved blueprints, gallery entries, stats, verified HUMAN account/session hashes, and shared machine-API account tables. HUMAN wallet creation and release are free; the shared entitlement/payment tables are for the paid machine API, not a HUMAN paywall.

The Worker never stores seed phrases or signing keys. HUMAN email accounts use one-time confirmation codes and HttpOnly browser sessions; the persistent account/session tables store SHA-256 email/session hashes rather than plaintext email addresses.

## HUMAN verified email account

`/human/setup` now contains the account setup flow:

```text
GET  /api/human/account
POST /api/human/account/email
POST /api/human/account/verify
POST /api/human/account/logout
```

The user enters an email address, receives a six-digit one-time code, confirms it, and receives a 30-day Secure/HttpOnly/SameSite=Lax session cookie. Codes expire after 10 minutes and verification attempts are limited.

Outbound mail is sent with Resend. Before real users can receive codes, configure a Resend API key and a verified sender address/domain:

```bash
cd cloudflare-human
printf '%s' '<your Resend API key>' | npx wrangler secret put RESEND_API_KEY --config wrangler.deploy.jsonc
printf '%s' 'BuildAWallet <accounts@buildawallet.xyz>' | npx wrangler secret put HUMAN_EMAIL_FROM --config wrangler.deploy.jsonc
./deploy.sh
```

The example sender only works after that address/domain is authorized by your email provider. Until both values are configured, the account endpoint returns a clear 503 `Email confirmation delivery is not configured` response instead of pretending an email was sent.

A verified HUMAN session is required for the final Android release endpoints. Wallet naming and the rest of the design draft remain browser-side and never require a seed phrase or private key.

## HUMAN Android release

The HUMAN release flow uses:

```text
POST /api/human/build
GET  /api/human/build/:buildId
```

It advertises a signed Android artifact only when `HUMAN_APK_URL` is configured to a valid HTTPS URL. `HUMAN_APK_SHA256` is optional but recommended.

Example configuration:

```text
HUMAN_APK_URL=https://your-artifact-host.example/buildawallet-signed.apk
HUMAN_APK_SHA256=<64 lowercase hex characters>
```

The build request contains wallet design metadata only. It does not contain a seed phrase, private key, or signing secret.

## Prepare and verify

From the repository root:

```bash
./cloudflare-human/prepare.sh
cd cloudflare-human
uv run pywrangler deploy --dry-run
```

`prepare.sh` copies the canonical `app/brain.py`, `app/catalog.py`, and `human_worker.py` into the isolated Worker build. Never edit the generated copies in `src/`.

## Provision and deploy

A Cloudflare account with the active `buildawallet.xyz` zone is required. From the repository root:

```bash
cd cloudflare-human
npx wrangler login
./deploy.sh
```

The script finds or creates the shared `buildawallet` D1 database, applies migrations, packages the Python Worker, and deploys the `/api/*` and `/healthz` routes. The `agent-pay` Worker can call this Worker over the `HUMAN_API` service binding.

After the Worker exists, configure the APK release values with Wrangler before the final deployment. They may be stored as Worker secrets even though the URL itself is not sensitive:

```bash
printf '%s' 'https://your-artifact-host.example/buildawallet-signed.apk' | npx wrangler secret put HUMAN_APK_URL --config wrangler.deploy.jsonc
printf '%s' '<sha256>' | npx wrangler secret put HUMAN_APK_SHA256 --config wrangler.deploy.jsonc
./deploy.sh
```

If you do not yet have the final signed APK URL, deploy the Worker without those values; `/api/human/build` will return 503 instead of pretending an APK exists. Configure the real artifact later and redeploy.

Keep the Pages custom domain attached for frontend paths. The Pages project uses `static` as the published directory. Test `/human/setup`, confirmed email login, Studio, free release, `/pay` (machine API plans), chat/save/gallery, and `/healthz` after deployment.
