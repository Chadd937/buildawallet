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
- Cloudflare Access verifies HUMAN email before entry. The Worker creates a
  pseudonymous D1 account record on /human/account without storing the raw
  email. Two onboarding screens feed the name, chains, style, custody, assets
  and features into the Studio. Studio shows an illustrative interactive phone
  concept and final blueprint exports. The uploaded Android APK is only a
  WebView wrapper and is not presented as a functional wallet download.
- A later 3.4 MB uploaded APK is an unmodified Cordova Hello World template.
  The independent `android-studio/` project imports Studio JSON and draws an
  offline design preview; CI labels its debug APK as a preview. It cannot
  store funds or sign transactions and is not the wallet release.

## Open questions for the owner
- Any interest in a gallery of public builds on the home page?
