import { createFileRoute } from "@tanstack/react-router";
import { Check, Minus } from "lucide-react";
import { MACHINE_CHAINS } from "@/lib/machine/chains";
import { PageHero, Section } from "@/components/machine/ui";

const TITLE = "Supported chains ,  BuildAWallet Machine";
const DESC =
  "Capability matrix for the nine networks exposed by the machine API: balances, stablecoins, transactions, snapshots, transfers and prepaid plan purchases.";
export const Route = createFileRoute("/nonhuman/chains")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Chains,
});

const COLS = [
  "Native balance",
  "Stablecoin balance",
  "Transaction status",
  "Composite snapshot",
  "Unsigned transfer + broadcast",
  "Prepaid plan payment",
] as const;
const Yes = () => <Check className="mx-auto size-4 text-primary" aria-label="yes" />;
const No = () => <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="no" />;

function Chains() {
  return (
    <>
      <PageHero
        eyebrow="Network matrix"
        title={
          <>
            Nine mainnets.
            <br />
            One schema.
          </>
        }
      >
        Every network the human wallet supports is available to agents. Reads are live from mainnet
        nodes. Transfers are prepared unsigned and broadcast after the agent signs locally; plan
        purchases settle in USDC on Base or Solana; requests consume prepaid units.
      </PageHero>
      <Section title="Capabilities">
        <div className="overflow-x-auto rounded-2xl border border-border bg-card/70">
          <table className="w-full min-w-[820px] text-center text-sm">
            <thead className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Network</th>
                {COLS.map((c) => (
                  <th key={c} className="p-3">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MACHINE_CHAINS.map((c) => {
                const canTransfer = c.family !== "bitcoin";
                const canReadStablecoin = Boolean(c.stablecoin);
                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="p-3 text-left">
                      <div className="font-display text-sm font-black uppercase">{c.name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {c.id} · {c.symbol}
                        {c.chainId ? ` · id ${c.chainId}` : ""}
                      </div>
                    </td>
                    <td className="p-3"><Yes /></td>
                    <td className="p-3">{canReadStablecoin ? <span className="font-mono text-xs text-primary">{c.stablecoin!.symbol}</span> : <No />}</td>
                    <td className="p-3"><Yes /></td>
                    <td className="p-3"><Yes /></td>
                    <td className="p-3">{canTransfer ? <Yes /> : <No />}</td>
                    <td className="p-3"><Yes /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Path ids for API calls: <code>{MACHINE_CHAINS.map((c) => c.id).join(", ")}</code>.
          Stablecoin entries show the configured token contract for each chain. A check mark means the endpoint is implemented in this service, not that an external RPC provider is guaranteed to be online.
        </p>
      </Section>
      <Section title="Stablecoin contracts">
        <div className="grid gap-2 md:grid-cols-2">
          {MACHINE_CHAINS.filter((c) => c.stablecoin).map((c) => (
            <div
              key={c.id}
              className="min-w-0 rounded-xl border border-border bg-background/60 p-3"
            >
              <div className="font-mono text-[10px] uppercase tracking-widest text-primary">
                {c.name} · {c.stablecoin!.symbol}
              </div>
              <div className="truncate font-mono text-xs">{c.stablecoin!.address}</div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
