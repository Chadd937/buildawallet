import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, Flame, Rocket, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletShell } from "@/components/wallet-shell";
import { useWalletDraft } from "@/hooks/use-wallet-draft";
import { chainOptions, featureGroups, presets } from "@/lib/wallet-data";

export const Route = createFileRoute("/human/studio")({
  head: () => ({ meta: [
    { title: "Wallet Studio | BuildAWallet" },
    { name: "description", content: "Mix presets, features, chains, and skins into your own crypto wallet in the BuildAWallet Studio." },
    { property: "og:title", content: "Wallet Studio | BuildAWallet" },
    { property: "og:description", content: "The marketplace-style studio for building your crypto wallet." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Studio,
});

const skins = [
  { name: "Acid Vault", cls: "bg-primary" }, { name: "Pixel Pop", cls: "bg-coral" },
  { name: "Clean Signal", cls: "bg-foreground" }, { name: "Gold Rush", cls: "bg-accent" },
];
const memes = ["WAGMI", "GM", "HODL", "TO THE MOON", "NGMI? NEVER", "LFG", "DYOR", "FEW"];
const rarity = (i: number) => ["COMMON", "RARE", "EPIC", "LEGENDARY"][i % 4];
const allFeatures = featureGroups.flatMap((g) => g.items.map((f) => ({ group: g.key, name: f[0], detail: f[1], icon: f[2] })));

function Studio() {
  const { draft, setDraft } = useWalletDraft();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const shown = allFeatures.filter((f) => (filter === "All" || f.group === filter) && f.name.toLowerCase().includes(query.toLowerCase()));
  const score = useMemo(() => Math.min(99, 40 + draft.features.length * 2 + draft.chains.length * 2 + draft.security.length * 3), [draft]);
  const toggleList = (key: "features" | "chains", name: string) => setDraft((d) => ({ ...d, [key]: d[key].includes(name) ? d[key].filter((x) => x !== name) : [...d[key], name] }));
  const applyPreset = (p: (typeof presets)[number]) => setDraft((d) => ({ ...d, features: Array.from(new Set([...d.features, ...p.features])) }));

  return <WalletShell>
    <div className="overflow-hidden border-b border-border bg-card/60 py-2 font-display text-xs text-accent" aria-hidden="true">
      <div className="safety-ticker !border-0 !text-xs !text-accent"><div>{[...memes, ...memes].map((m, i) => <span key={i} className="px-6">{m} <b>◆</b></span>)}</div></div>
    </div>
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6">
          <div className="absolute -right-10 -top-10 size-48 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -bottom-16 left-1/3 size-48 rounded-full bg-coral/20 blur-3xl" />
          <p className="relative font-mono text-[10px] uppercase text-primary">Studio / {draft.name}</p>
          <h1 className="relative mt-2 font-display text-4xl leading-none sm:text-6xl">Build the <span className="text-primary">rarest</span> wallet in the room.</h1>
          <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Features", draft.features.length], ["Chains", draft.chains.length], ["Shields", draft.security.length], ["Build score", score]].map(([l, v]) => <div key={l} className="rounded-xl border border-border bg-background/60 p-3"><div className="font-display text-2xl text-accent">{v}</div><div className="font-mono text-[9px] uppercase text-muted-foreground">{l}</div></div>)}
          </div>
        </section>

        <h2 className="mt-8 flex items-center gap-2 font-display text-xl"><Flame className="size-5 text-coral" /> Trending drops</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{presets.map((p, i) => <button key={p.name} onClick={() => applyPreset(p)} className="choice-card pulse-border group p-4 text-left" style={{ animationDelay: `${i * 0.7}s` }}>
          <div className={`floaty mb-3 grid aspect-square place-items-center rounded-lg font-display text-4xl text-primary-foreground ${["bg-primary", "bg-coral", "bg-accent", "bg-highlight"][i]}`} style={{ animationDelay: `${i * 0.5}s` }}>{p.name.split(" ").map((w) => w[0]).join("")}</div>
          <div className="flex items-center justify-between"><strong className="font-display text-sm">{p.name}</strong><span className="font-mono text-[10px] text-accent">{p.score}</span></div>
          <p className="text-xs text-muted-foreground">{p.detail}</p>
          <span className="mt-2 block font-mono text-[9px] text-primary">+ {p.features.length} features · click to mint</span>
        </button>)}</div>

        <div className="mt-8 flex flex-wrap items-center gap-2">
          {["All", ...featureGroups.map((g) => g.key)].map((k) => <button key={k} onClick={() => setFilter(k)} className={`nav-link border border-border ${filter === k ? "nav-link-active" : ""}`}>{k}</button>)}
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search features" className="ml-auto h-9 rounded-full border border-input bg-background px-4 text-sm outline-none focus:border-primary" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{shown.map((f) => { const i = allFeatures.indexOf(f); const on = draft.features.includes(f.name); return <button key={f.name} onClick={() => toggleList("features", f.name)} data-selected={on} className="choice-card relative p-4 text-left">
          <div className="flex items-start justify-between"><span className="grid size-11 place-items-center rounded-lg bg-secondary font-display text-lg text-primary">{f.icon}</span><span className={`rounded-full px-2 py-0.5 font-mono text-[8px] ${i % 4 === 3 ? "bg-accent text-accent-foreground" : i % 4 === 2 ? "bg-coral text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{rarity(i)}</span></div>
          <strong className="mt-3 block font-display text-sm">{f.name}</strong><span className="text-xs text-muted-foreground">{f.detail}</span>
          <div className="mt-3 flex justify-between font-mono text-[9px] text-muted-foreground"><span>#{String(i + 1).padStart(3, "0")} · {f.group}</span><span className="text-primary">{on ? "EQUIPPED" : `${(i * 37) % 900 + 100} builders`}</span></div>
          {on && <Check className="absolute right-3 top-14 size-4 text-primary" />}
        </button>; })}</div>

        <h2 className="mt-8 font-display text-xl">Chains</h2>
        <div className="mt-3 flex flex-wrap gap-2">{chainOptions.map(([name, sym]) => <button key={name} onClick={() => toggleList("chains", name)} data-selected={draft.chains.includes(name)} className="choice-card px-3 py-2 text-sm"><b className="font-mono text-xs text-primary">{sym}</b> {name}</button>)}</div>

        <h2 className="mt-8 font-display text-xl">Skins</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{skins.map((s) => <button key={s.name} onClick={() => setDraft((d) => ({ ...d, theme: s.name }))} data-selected={draft.theme === s.name} className="choice-card p-3 text-left"><div className={`mb-2 h-14 rounded-md ${s.cls}`} /><span className="font-display text-xs">{s.name}</span></button>)}</div>

        <section className="mt-10 rounded-2xl border-2 border-primary bg-card p-6 text-center">
          <Sparkles className="mx-auto size-6 text-accent" />
          <h2 className="mt-2 font-display text-3xl">Ready to ship {draft.name}?</h2>
          <p className="mt-1 text-sm text-muted-foreground">{draft.features.length} features on {draft.chains.length} chains. Build score {score}.</p>
          <Button variant="arcade" size="xl" className="mt-5 h-16 w-full max-w-md text-lg" onClick={() => navigate({ to: "/human/release" })}><Rocket /> Deploy wallet</Button>
        </section>
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="mx-auto w-72 rounded-[2.5rem] border-4 border-secondary bg-background p-4 shadow-2xl shadow-primary/10">
          <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-secondary" />
          <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-full bg-primary font-display text-primary-foreground">{draft.name[0] ?? "N"}</span><div><strong className="block font-display text-sm">{draft.name}</strong><span className="font-mono text-[9px] text-muted-foreground">{draft.custody} · {draft.theme}</span></div></div>
          <div className="mt-4 rounded-xl bg-primary p-4 text-primary-foreground"><span className="font-mono text-[9px]">DEMO BALANCE</span><div className="font-display text-3xl">$12,480.22</div><span className="text-xs">+4.2% today</span></div>
          <div className="mt-3 grid grid-cols-4 gap-1 text-center font-mono text-[9px]">{["Send", "Receive", "Swap", "Buy"].map((a) => <div key={a} className="rounded-lg bg-secondary py-2">{a}</div>)}</div>
          <div className="mt-3 flex flex-wrap gap-1">{draft.chains.slice(0, 8).map((c) => <span key={c} className="rounded-full border border-border px-2 py-0.5 text-[9px]">{c}</span>)}</div>
          <div className="mt-3 max-h-48 space-y-1 overflow-auto">{draft.features.map((f) => <div key={f} className="flex items-center gap-2 rounded-md bg-card px-2 py-1.5 text-xs"><Zap className="size-3 text-accent" />{f}</div>)}</div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${score}%` }} /></div>
          <p className="mt-1 text-center font-mono text-[9px] text-muted-foreground">BUILD SCORE {score}/99</p>
        </div>
      </aside>
    </main>
  </WalletShell>;
}
