import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Laptop, Loader2, Server } from "lucide-react";
import { useState } from "react";
import { AGENT_KIT_SOURCE, KIT_DEPENDENCIES, KIT_PATHS } from "@/lib/machine/agent-kit";
import { Badge, Code, CopyButton, PageHero, Panel, Section, Step } from "@/components/machine/ui";
import { Button } from "@/components/ui/button";

const TITLE = "Agent wallets ,  BuildAWallet Machine";
const DESC = "Give an AI agent a multichain wallet: create it locally with zero custody, or opt in to a server-made wallet returned once and never stored.";
export const Route = createFileRoute("/nonhuman/wallets")({
  head: () => ({ meta: [{ title: TITLE }, { name: "description", content: DESC }, { property: "og:title", content: TITLE }, { property: "og:description", content: DESC }, { property: "og:type", content: "article" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Wallets,
});

type Generated = { mnemonic: string; addresses: Record<string, string>; warning: string };

function Wallets() {
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Generated | null>(null);
  const [error, setError] = useState("");

  async function generate() {
    setBusy(true); setError(""); setResult(null);
    try {
      const res = await fetch("/machine/v1/wallets/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ acknowledgeCustodyRisk: true, words: 12 }) });
      const data = await res.json() as Generated & { error?: string };
      if (!res.ok) setError(data.error ?? "Could not create a wallet"); else setResult(data);
    } catch { setError("Network error ,  try again."); }
    setBusy(false);
  }

  return (
    <>
      <PageHero eyebrow="Agent wallets" title={<>One phrase.<br />Ten chains.</>}>
        An agent needs its own wallet to pay for things and hold funds. BuildAWallet offers two ways to get one. Both produce a standard 12- or 24-word recovery phrase that also works in MetaMask, Phantom, Trust and the BuildAWallet human app.
      </PageHero>

      <Section eyebrow="Compare" title="Choose the custody model">
        <div className="grid gap-4 md:grid-cols-2">
          <Panel className="border-primary/40">
            <div className="flex items-center gap-2"><Laptop className="text-primary" /><h3 className="font-display text-lg font-black uppercase">Local kit</h3><Badge tone="primary">Recommended</Badge></div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">
              <li>Wallet is created on the agent's own machine.</li><li>BuildAWallet never sees the phrase or keys.</li><li>Unlimited wallets, works offline.</li><li>Needs Node 18+ and seven open-source packages.</li>
            </ul>
          </Panel>
          <Panel className="border-zap/40">
            <div className="flex items-center gap-2"><Server className="text-zap" /><h3 className="font-display text-lg font-black uppercase">Server-made</h3><Badge tone="zap">Opt-in</Badge></div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">
              <li>One HTTP call ,  good for agents that can't run code.</li><li>Phrase is made in memory and returned once over HTTPS.</li><li>Nothing is stored or logged; we cannot recover it.</li><li>Limited to 5 per hour per client.</li>
            </ul>
          </Panel>
        </div>
      </Section>

      <Section eyebrow="Option 1" title="Create a wallet locally" intro="Three steps. The script prints only public addresses; the phrase is saved to a file only your agent can read.">
        <Step n={1} title="Install the packages"><Code title="terminal" code={`npm i ${KIT_DEPENDENCIES.join(" ")}`} /></Step>
        <Step n={2} title="Download the kit">
          <Code title="terminal" code={`curl -o baw-agent-wallet.mjs https://buildawallet.xyz/machine/v1/wallets/kit.mjs`} />
          <p>Or with MCP: call the <code>wallet_local_kit</code> tool.</p>
        </Step>
        <Step n={3} title="Run it">
          <Code title="terminal" code={`node baw-agent-wallet.mjs\n# → { "addresses": { "base": "0x…", "solana": "…", "bitcoin": "bc1…", "tron": "T…" } }`} />
          <p>Set <code>BAW_WALLET_FILE</code> to choose where the phrase is stored, or <code>BAW_MNEMONIC</code> to restore an existing one.</p>
        </Step>
        <details className="mt-2 rounded-2xl border border-border bg-card/60 p-4">
          <summary className="cursor-pointer font-mono text-xs uppercase tracking-widest text-muted-foreground">View full script source</summary>
          <div className="mt-4"><Code title="baw-agent-wallet.mjs" code={AGENT_KIT_SOURCE} /></div>
        </details>
      </Section>

      <Section eyebrow="Option 2" title="Ask the server to make one" intro="For agents that can only make HTTP calls. Read the warning first.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Code title="HTTP" code={`curl -X POST https://buildawallet.xyz/machine/v1/wallets/generate \\
  -H 'content-type: application/json' \\
  -d '{"acknowledgeCustodyRisk": true, "words": 12}'`} />
          <Panel>
            <div className="flex gap-3 text-sm leading-6"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-zap" /><p className="text-muted-foreground">The phrase exists briefly on our servers while it's made. We keep no copy, so if it's lost the funds are lost. Anyone who sees it controls the wallet.</p></div>
            <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1" /> I understand and want a server-made wallet.</label>
            <Button className="mt-4" disabled={!ack || busy} onClick={() => void generate()}>{busy ? <Loader2 className="animate-spin" /> : <Server />} Make a wallet now</Button>
            {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
          </Panel>
        </div>
        {result ? (
          <Panel className="mt-4 border-zap/50">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-display text-base font-black uppercase text-zap">Recovery phrase ,  shown once</h3><CopyButton value={result.mnemonic} label="Copy phrase" /></div>
            <p className="mt-3 rounded-xl bg-background/80 p-4 font-mono text-sm leading-7">{result.mnemonic}</p>
            <p className="mt-2 text-xs text-muted-foreground">{result.warning}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">{Object.entries(result.addresses).map(([chain, addr]) => <div key={chain} className="min-w-0 rounded-lg border border-border p-2"><div className="font-mono text-[10px] uppercase tracking-widest text-primary">{chain}</div><div className="truncate font-mono text-xs">{addr}</div></div>)}</div>
          </Panel>
        ) : null}
      </Section>

      <Section eyebrow="Reference" title="Derivation paths">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(KIT_PATHS).map(([family, path]) => <Panel key={family}><div className="font-mono text-[10px] uppercase tracking-widest text-primary">{family}</div><div className="mt-1 font-mono text-sm">{path}</div></Panel>)}</div>
        <p className="mt-4 text-sm text-muted-foreground">One EVM address covers Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain and Avalanche. Bitcoin uses native SegWit (bc1…).</p>
      </Section>
    </>
  );
}
