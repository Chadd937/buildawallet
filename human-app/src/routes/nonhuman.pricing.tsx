import { createFileRoute, Link } from "@tanstack/react-router";
import { FREE_UNITS, PLANS } from "@/lib/machine/config";
import { ENDPOINTS } from "@/lib/machine/catalog";
import { PageHero, Panel, Section } from "@/components/machine/ui";

const TITLE = "Pricing ,  BuildAWallet Machine API";
const DESC =
  "Prepaid API units in USDC on Base or Solana. Pay once, then use your key without a blockchain payment for each request.";
export const Route = createFileRoute("/nonhuman/pricing")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Pricing,
});

function Pricing() {
  const plans = Object.values(PLANS);
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title={
          <>
            Pay once.
            <br />
            Use prepaid units.
          </>
        }
      >
        <b className="text-foreground">One payment buys a block of API units for 30 days.</b> Pay
        with USDC on Base or Solana, then use your API key. Requests deduct units in your account
        without another blockchain transaction. Unused units roll over when you renew before expiry.
      </PageHero>
      <Section title="Choose how you pay" intro="Free discovery, prepaid plans, or simple metered usage.">
        <div className="grid gap-5 md:grid-cols-3">
          <Panel className="border-primary/70"><div className="font-mono text-xs font-bold uppercase tracking-widest text-primary">FREE</div><div className="mt-2 font-display text-4xl font-black">$0</div><p className="mt-2 text-sm text-muted-foreground">For humans and developers getting started.</p><ul className="mt-5 space-y-2 text-sm"><li>✓ {FREE_UNITS.toLocaleString()} free API units</li><li>✓ Swagger / OpenAPI docs</li><li>✓ MCP discovery</li><li>✓ Wallet tools & multichain discovery</li></ul><Link to="/nonhuman/dashboard" className="mt-6 inline-block rounded-xl bg-primary px-4 py-2 font-display text-xs font-black uppercase text-primary-foreground">Start free</Link></Panel>
          {plans.map((p, i) => <Panel key={p.id} className={i === 1 ? "border-primary/70" : ""}><div className="font-mono text-xs font-bold uppercase tracking-widest text-pop">{p.name}</div><div className="mt-2 font-display text-4xl font-black">${p.priceUSDC.replace(".00","")}<span className="text-sm font-normal text-muted-foreground"> / 30 days</span></div><p className="mt-2 text-sm text-muted-foreground">Prepaid machine capacity.</p><div className="mt-5 rounded-xl border border-border p-3"><div className="text-2xl font-black">{p.units.toLocaleString()}</div><div className="text-xs uppercase tracking-widest text-muted-foreground">API units</div></div><Link to="/nonhuman/dashboard" className="mt-6 inline-block rounded-xl bg-primary px-4 py-2 font-display text-xs font-black uppercase text-primary-foreground">Choose {p.name}</Link></Panel>)}
        </div>
      </Section>
      <Section title="Pay per use" intro="No subscription? Use x402 metered access.">
        <Panel><div className="grid gap-5 md:grid-cols-3"><div><div className="font-display text-3xl font-black">$0.01</div><div className="text-xs uppercase tracking-widest text-muted-foreground">per request</div></div><div><div className="font-display text-3xl font-black">$1+</div><div className="text-xs uppercase tracking-widest text-muted-foreground">minimum balance</div></div><div><div className="font-display text-3xl font-black">10</div><div className="text-xs uppercase tracking-widest text-muted-foreground">supported networks</div></div></div><p className="mt-5 text-sm text-muted-foreground">Fund your machine balance with an explicit on-chain payment. Calls deduct $0.01. Nothing is automatically taken from a connected human wallet.</p></Panel>
      </Section>
      <Section
        title="What each call costs"
        intro="Read units are charged after the chain work succeeds. Broadcast attempts reserve one unit before dispatch, including rejected attempts. Free calls do not consume units."
      >
        <div className="overflow-x-auto rounded-2xl border border-border bg-card/70">
          <table className="w-full min-w-[560px] text-left text-sm">
            <tbody>
              {ENDPOINTS.map((e) => (
                <tr key={e.method + e.path} className="border-t border-border first:border-t-0">
                  <td className="p-3 font-mono text-xs">
                    {e.method} {e.path}
                  </td>
                  <td className="p-3 text-right font-mono text-xs text-primary">
                    {e.units ? `${e.units} unit${e.units > 1 ? "s" : ""}` : "free"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="When units run out"><p className="max-w-3xl text-sm leading-6 text-muted-foreground">Buy another plan from the dashboard. There is no automatic wallet debit or per-call blockchain payment.</p></Section>
    </>
  );
}
