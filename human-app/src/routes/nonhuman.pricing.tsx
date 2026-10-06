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
      <Section title="Start free">
        <Panel className="border-primary/60">
          <p className="text-sm text-muted-foreground">
            <b className="text-foreground">{FREE_UNITS.toLocaleString()} free units</b> for every
            new dashboard account. No card, no crypto. One unit is a full multichain portfolio
            query: native and stablecoin balances on every network that accepts the address.
          </p>
          <Link
            to="/nonhuman/dashboard"
            className="mt-4 inline-block rounded-xl bg-primary px-4 py-2 font-display text-xs font-black uppercase text-primary-foreground"
          >
            Claim free units
          </Link>
        </Panel>
      </Section>
      <Section title="Plans">
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p, i) => (
            <Panel key={p.id} className={i === 1 ? "border-primary/60" : ""}>
              <div className="font-mono text-[10px] uppercase tracking-widest text-pop">
                {p.name}
              </div>
              <div className="mt-2 font-display text-4xl font-black">
                ${p.priceUSDC.replace(".00", "")}
                <span className="text-sm text-muted-foreground"> / 30 days</span>
              </div>
              <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
                <li>
                  <b className="text-foreground">{p.units.toLocaleString()}</b> units
                </li>
                <li>${((Number(p.priceUSDC) / p.units) * 1000).toFixed(3)} per 1,000 units</li>
                <li>Up to 10 active API keys</li>
              </ul>
              <Link
                to="/nonhuman/dashboard"
                className="mt-5 inline-block rounded-xl bg-primary px-4 py-2 font-display text-xs font-black uppercase text-primary-foreground"
              >
                Buy {p.name}
              </Link>
            </Panel>
          ))}
        </div>
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
      <Section title="When units run out">
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Metered calls return <code>429</code> with your usage, and no units are charged. Buy
          another plan from the dashboard; it adds units straight away and extends the expiry by 30
          days. No automatic wallet debit or per-call blockchain payment is attempted.
        </p>
      </Section>
    </>
  );
}
