# Build-a-Wallet: notes

## What this site is
An interactive toy-but-serious tool: a visitor talks to a "wallet architect"
and designs their own crypto wallet. The conversation drives a live phone
preview and ends in a shareable blueprint. Owner's brief (2026-08-25):
"start with a live AI prompt, then interactively build the crypto wallet
solely based on what the user wants, as many features as options."

## Decisions
- The architect is a self-contained conversation engine in `app/brain.py`.
  No external AI API and no keys: the site must stay self-contained, and an
  API key would be a secret in the repo. It parses free text against the
  option catalog, handles refusals ("no memecoins"), answers questions, and
  keeps asking the next useful question.
- 150 options live in `app/catalog.py`: assets, networks, custody, security,
  features, platforms, privacy, look. Adding one there makes it available to
  the chat, the vault and the blueprint at once.
- Eight personas (beginner, trader, privacy, business, bitcoiner, payments,
  family, gaming) let one sentence lay down a whole starting build. They are
  additive only: they never overwrite a decision already made.
- New saved builds get a 26 character random code and live at /w/<code> in
  SQLite at /data/app.db. Earlier six character links remain readable.
  Anyone opening a link can view the design and edit their own copy.
- Preview prices and balances are illustrative, generated deterministically
  from the wallet name. Nothing here touches a real chain and there is no
  wallet software behind it: the output is a design spec.
- The public container does not ship or mount the legacy signing API. Its
  saved designs do not collect email or list private link codes in stats.
- Owner supplied separate USDC collectors for Base
  (0xBcCA6AED433d9020C50D44560F9679F1B5eB511d) and Solana
  (Ew8mbrKwD6LGaSX28a6XGmXqeQSs2hykRibjXVhftTRC).
- The HUMAN designer, JSON design export and detailed implementation plan are free
  after Cloudflare Access sign-in. The read-only API plans are $12, $39 and $99
  USDC for 30 days, manually renewable on Base or Solana after wallet ownership
  and on-chain receipt checks. The live view still reads existing external wallet
  balances only. There is no functional Android APK in the repository yet.
- The separate /machine/* Worker can charge $0.01 USDC for Base and Solana
  native balance snapshots after its own deployment and paid checks. It does
  not grant agent wallet authority.
- Machine discovery includes a free quote for each supported read. Eight
  subscriber reads include two composite native and USDC snapshots at two
  units each, with independent RPC context. The twelve MCP tools include
  free quote and usage, subscribed reads, and two wallet pay-per-call tools
  that reuse the HTTP x402 two-chain rail. Subscription payment history is
  scoped to the wallet session. Local payer software retains signing control.
- The existing split landing page layout remains unchanged. Docs anchors lead
  to the deployed API and MCP details. Terms and privacy describe the actual
  read-only service, browser drafts, saved designs and paid access records.
  The API reference serves its Swagger assets from BuildAWallet's Worker.
- The customer-facing HUMAN pages, payment page, saved builds and builder
  design endpoints require Cloudflare Access sign-in. The landing, pricing,
  docs and non-human machine routes remain public. The Worker validates
  Access JWTs on its protected paths; wallet payment only gates subscribed API calls.
- The HUMAN home and studio AI chat call Cloudflare Workers AI through the
  protected /machine/ai/chat route. The original guided architect still uses
  the self-contained conversation engine above.
- The known see.io site URL redirects HUMAN pages and direct HUMAN API paths
  to the Cloudflare-protected canonical hostname, while its landing and agent
  discovery remain open.
- The routed HUMAN flow runs from `/human/setup` through identity, custody,
  chains and security, then into the marketplace-style Studio, mainnet-only
  release, $1.99 crypto payment and download screens. Browser-local choices survive backward
  navigation. Bitcoin, TRON and Solana decorate the left side of desktop setup
  screens; Ethereum, BNB and Litecoin decorate the right.
- Cloudflare Access verifies HUMAN email for protected account and release
  services. The Worker creates a pseudonymous D1 account record on
  `/human/account` without storing the raw email. The download screen exposes
  an APK link only when the build API reports a completed signed artifact. The
  uploaded WebView and Cordova wrappers are not presented as functional wallets.
- A later 3.4 MB uploaded APK is an unmodified Cordova Hello World template.
  The independent `android-studio/` project imports Studio JSON and draws an
  offline design preview; CI labels its debug APK as a preview. It cannot
  store funds or sign transactions and is not the wallet release.

## Open questions for the owner
- Any interest in a gallery of public builds on the home page?

- Frontend uses the BuildAWallet wallet favicon and standard Vite plugins. Unused editor metadata, telemetry hooks and the obsolete alternate dependency lockfile were removed on 2026-10-04.

- The October 4 full app import is under human-app and builds a Cloudflare Worker rather than a static SPA. On October 5, the owner confirmed the original Cloudflare Email Auth/D1 login is exclusive and no Supabase service should be used. Application billing, metering and Byte history now also use D1. Imported PostgreSQL migration source is archived and is not deployed. Legacy backends and Android sources remain preserved. Database migrations, live authentication, real payments and a new signed WebView APK still need production validation.

- The October 5 homepage uses the supplied full-screen Human/Machine design with its shared Legal, Human and Machine footer. Support is available at `/support`, and `/advertising` routes to it. The first-party account flow and wallet code stay in place.

- Cloudflare deployment reads public settings from Wrangler and local settings from `.env`, `.dev.vars` or the shell. It resolves the existing Login D1 database and cookie contract, adds application tables with a separate migration journal, and uploads only AI/RPC secrets. It does not require an app authentication signing key or reset login tables.

- The owner confirmed existing D1 databases named `buildawallet` and `buildawallet-production`. Schema inspection uses real database IDs from the account, so Wrangler cannot substitute development placeholders. The original HUMAN email login uses the `baw_human_session` cookie; the extracted auth schema defaults to `site_session`.

- October 5 live schema output confirms `buildawallet` contains the original `human_email_accounts` and `human_sessions` email-login tables. `buildawallet-production` contains wallets, events and subscriptions but no login tables. App and login bindings now use `buildawallet`, and the frontend calls the existing HUMAN Worker's `/api/human/account` endpoints. Deployment smoke checks include its anonymous session response; live email delivery and verified login still need checking.

- Byte defaults to the original Cloudflare Workers AI binding and Llama 3.1 8B fast model. The imported guide's mandatory OpenAI settings were removed; OpenAI requires an explicit provider selection. Completed streamed answers keep their D1 account scope, and the original AI rate limit is retained. Deployment skips optional secret upload when none are supplied. Live inference and verified email login still need testing.

- An October 5 deployment attempt passed typecheck, tests and build, then stopped on D1's remote query parser with `incomplete input` during the app migration. Deployment now imports pending app SQL and its existing separate journal entries together through Wrangler's SQL-file import path. Billing trigger CASE expressions are parenthesized, without changing their behavior. Login tables and the legacy migration journal are preserved.

- The owner's next October 5 deployment completed the app migration and published `buildawallet-agent-pay`, version `4fec56a6-3a9b-47fc-be85-64eb428d2eaf`, on the production routes. All HTTP smoke checks passed, including the original anonymous HUMAN login endpoint, 52 MCP tools and invalid bearer refusal. A live browser inspection confirmed the split Human/Machine homepage with its Legal, Human and Machine footer at `buildawallet.xyz`, and the HUMAN setup page hydrated into the email-code form. Email delivery, verified sign-in, live Byte inference, real payments and a signed Android installation remain separate live checks.

- The owner requested Byte closed by default across human and machine pages. Byte is now mounted once in the shared page layout, including landing and legal/support pages, with a compact “Hi, I’m Byte!” greeting beside the avatar. Conversation history loads only when opened and refreshes on reopening; mobile wallet navigation stays clear of the launcher. The owner confirmed the deployment is done and approved the result.

- The October 5 repository audit found no imported-editor branding or heart characters in current tracked source or fetched branch tips; the favicons depict the BuildAWallet wallet. No environment, wallet private-key or Android signing files were tracked, including in fetched history. Gitleaks reviewed 114 commits and current tracked files. Findings were public chain identifiers, documentation placeholders and retired public publishable-token data, with no confirmed private credentials. Root ignores now protect private configuration and signing material across projects, and a checksum-pinned, redacted GitHub Actions credential scan checks future main pushes and pull requests. No app runtime changed in this security-only update.

- The owner requested the original blog restored. All three published JSON articles remain in `blog/data`; the app now renders `/blog` and `/blog/:slug` from that directory. Original featured and diagram images are mirrored into the app's public assets. The shared footer links to Blog, Byte remains available and closed by default, and article titles/descriptions/canonical URLs plus `/sitemap.xml` support discovery. New publisher JSON files join the blog on the next app build. Deployment smoke checks cover the index, all published articles, sitemap and an unknown article's 404. This runtime change requires the owner's next Cloudflare deployment.

- The owner chose device-approved treasury withdrawals. `/owner` reuses the current Base and Solana collectors, gated on every request by the original verified HUMAN session and a server-only owner-email hash. It is not linked in public navigation, sitemap or agent catalogs. Balances and current/legacy subscription records are private; an additive D1 table records new settled x402 receipts. Withdrawal preparation never receives keys. Base uses the connected collector's EIP-1193 wallet; Solana uses Phantom, verifies the full reviewed instruction message and includes destination-token-account rent when needed. Public receiving addresses and chain transfers stay visible. Activation requires `npm run configure:owner` on the owner's machine, followed by deployment and live owner-login/collector-wallet checks. No real withdrawal has been sent during development.
