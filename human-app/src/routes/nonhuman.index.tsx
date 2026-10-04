import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Braces, Coins, Database, KeyRound, Radio, ShieldCheck, WalletCards, Zap } from "lucide-react";
import { MACHINE_CHAINS } from "@/lib/machine/chains";
import { Code, Eyebrow, Panel, Section } from "@/components/machine/ui";

const TITLE = "BuildAWallet Machine ,  wallets and paid APIs for AI agents";
const DESC = "Agents get a wallet, read ten mainnets, and pay per call in USDC with x402 ,  or run on a metered API key. MCP, OpenAPI and llms.txt built in.";

export const Route = createFileRoute("/nonhuman/")({
  head: () => ({ meta: [{ title: TITLE }, { name: "description", content: DESC }, { property: "og:title", content: TITLE }, { property: "og:description", content: DESC }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Overview,
});

const WAYS = [
  { icon: Bot, title: "MCP", to: "/nonhuman/mcp", copy: "Point Claude, Cursor or any MCP client at /mcp. 50+ tools appear instantly." },
  { icon: Braces, title: "OpenAPI", to: "/nonhuman/api", copy: "Import /openapi.json into any framework, or try every call in the explorer." },
  { icon: Zap, title: "Pay per call", to: "/nonhuman/pay-per-call", copy: "No account. Answer an HTTP 402 with a USDC signature and get the data. $0.01 a read." },
  { icon: KeyRound, title: "Subscription", to: "/nonhuman/pricing", copy: "Buy units with USDC, get API keys, watch usage in the dashboard." },
] as const;

const FAQ = [
  ["Do you ever hold my agent's keys?", "Not with the local kit ,  the wallet is created on the agent's machine. The optional server-made wallet generates a phrase in memory, returns it once and stores nothing."],
  ["What does an agent need to start?", "Nothing. Discovery, chain lists, plans and the wallet kit are free. Paid reads need either USDC for x402 or an API key."],
  ["Which chains?", "Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, Avalanche, Solana, Bitcoin and Tron ,  the same ten networks as the human wallet."],
  ["How are payments settled?", "Exact USDC on Base or Solana, verified on-chain. Each transaction can be used once."],
  ["Can my agent send money?", "Yes on Base and Solana: the API prepares an unsigned transfer, the agent signs locally, then broadcasts through the API."],
] as const;

function Overview() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-5 pb-12 pt-14 md:px-10 md:pt-20">
        <div className="inline-flex items-center gap-2 rounded-full border border-pop/30 bg-pop/10 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-pop"><Radio size={12} /> Agent interface online</div>
        <h1 className="mt-5 font-display text-5xl font-black uppercase leading-[.9] tracking-[-.05em] sm:text-7xl">The internet's next<br />customers aren't human.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
          Most web traffic is about to be agents. They need wallets, live chain data and a way to pay that doesn't involve a checkout page.
          BuildAWallet gives them all three ,  discoverable by machines, priced per call, and non-custodial by default.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/nonhuman/wallets" className="rounded-xl bg-primary px-6 py-3 font-display text-sm font-black uppercase text-primary-foreground hover:opacity-90">Give an agent a wallet</Link>
          <Link to="/nonhuman/dashboard" className="rounded-xl border border-border px-6 py-3 font-mono text-xs uppercase tracking-widest hover:border-pop hover:text-pop">I'm a human ,  get API keys</Link>
        </div>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {([[Database, "10 mainnets", "One schema for EVM, Solana, Bitcoin and Tron."], [WalletCards, "Agent wallets", "Local kit or opt-in server-made wallet, all ten chains from one phrase."], [ShieldCheck, "Never custodial", "Unsigned transactions out, signed bytes in. We never sign for you."]] as const).map(([Icon, t, c]) => (
            <Panel key={t}><Icon className="mb-4 text-primary" /><h2 className="font-display text-lg font-black uppercase">{t}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{c}</p></Panel>
          ))}
        </div>
      </section>

      <Section eyebrow="How it works" title="Discover → wallet → pay → call" intro="An agent with no prior knowledge of BuildAWallet can go from zero to a paid chain read in four requests.">
        <div className="grid gap-4 lg:grid-cols-2">
          <ol className="space-y-4 text-sm leading-6 text-muted-foreground">
            <li><b className="text-foreground">1. Discover.</b> The agent reads <code>/llms.txt</code>, <code>/.well-known/agent.json</code> or <code>/openapi.json</code> ,  or connects to <code>/mcp</code> and lists tools.</li>
            <li><b className="text-foreground">2. Get a wallet.</b> It downloads the local kit and creates a multichain wallet on its own machine. Optionally it asks the server to make one.</li>
            <li><b className="text-foreground">3. Pay.</b> It funds Base or Solana USDC and answers the 402 challenge ,  or uses an API key bought by its human.</li>
            <li><b className="text-foreground">4. Call.</b> Balances, stablecoins, transactions, snapshots, and locally-signed transfers on every supported chain.</li>
          </ol>
          <Code title="zero to paid read" code={`curl https://buildawallet.xyz/llms.txt
curl https://buildawallet.xyz/machine/v1/wallets/kit
curl -i "https://buildawallet.xyz/machine/x402/wallet?chain=base&address=0x…"
# → 402 PAYMENT-REQUIRED  (sign USDC, retry with PAYMENT-SIGNATURE)
curl -H "Authorization: Bearer baw_acct_…" \\
  https://buildawallet.xyz/machine/v1/solana/snapshot/<address>`} />
        </div>
      </Section>

      <Section eyebrow="Four ways in" title="Pick how your agent connects">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WAYS.map(({ icon: Icon, title, to, copy }) => (
            <Link key={title} to={to} className="group rounded-2xl border border-border bg-card/70 p-5 backdrop-blur transition hover:border-primary">
              <Icon className="text-primary" /><h3 className="mt-4 font-display text-base font-black uppercase group-hover:text-primary">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
            </Link>
          ))}
        </div>
      </Section>

      <Section eyebrow="Network surface" title="Every chain humans get" intro={<>Native balances and transaction status everywhere; stablecoins where a canonical asset exists. <Link to="/nonhuman/chains" className="text-primary underline">See the full matrix.</Link></>}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {MACHINE_CHAINS.map((c) => <div key={c.id} className="rounded-xl border border-border bg-background/60 p-4"><div className="font-display text-sm font-black uppercase">{c.name}</div><div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-primary">{c.family} · {c.symbol}</div></div>)}
        </div>
      </Section>

      <Section eyebrow="Why this matters" title="Monetized for machine traffic">
        <div className="grid gap-4 md:grid-cols-3">
          {([[Coins, "Revenue per request", "Every read is paid ,  in a cent of USDC or a metered unit. No ads, no sign-up walls, no humans required."], [Bot, "Built to be found", "Machine-readable manifests at standard paths so agents and crawlers discover the service on their own."], [ShieldCheck, "Trust by design", "No custody, exact on-chain receipts, one-use transactions and hashed API keys."]] as const).map(([Icon, t, c]) => (
            <Panel key={t}><Icon className="mb-3 text-zap" /><h3 className="font-display text-base font-black uppercase">{t}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{c}</p></Panel>
          ))}
        </div>
      </Section>

      <Section eyebrow="FAQ" title="Straight answers">
        <div className="grid gap-3 md:grid-cols-2">
          {FAQ.map(([q, a]) => <Panel key={q}><h3 className="font-display text-sm font-black uppercase">{q}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{a}</p></Panel>)}
        </div>
        <div className="mt-8"><Eyebrow tone="zap">Ready?</Eyebrow><div className="mt-3 flex flex-wrap gap-3"><Link to="/nonhuman/mcp" className="rounded-xl bg-primary px-5 py-2.5 font-display text-xs font-black uppercase text-primary-foreground">Connect via MCP</Link><Link to="/nonhuman/dashboard" className="rounded-xl border border-border px-5 py-2.5 font-mono text-xs uppercase tracking-widest hover:border-primary">Open dashboard</Link></div></div>
      </Section>
    </>
  );
}
