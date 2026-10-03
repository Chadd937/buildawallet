import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, Sparkles, WalletCards, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletShell } from "@/components/wallet-shell";
import { useWalletDraft } from "@/hooks/use-wallet-draft";
import { chainOptions, featureGroups } from "@/lib/wallet-data";

export const Route = createFileRoute("/human/studio")({
  head: () => ({ meta: [
    { title: "Web3 Wallet Studio | BuildAWallet" },
    { name: "description", content: "Customize a self-custody desktop Web3 wallet, then create or restore it locally in your browser with BuildAWallet Studio." },
    { property: "og:title", content: "Web3 Wallet Studio | BuildAWallet" },
    { property: "og:description", content: "Design your wallet interface, networks, features and theme before creating the local self-custody wallet." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Studio,
});

const themes = [
  {
    name: "Acid Vault",
    detail: "Neon cyber grid",
    accent: "#5cffb0",
    surface: "#101912",
    background: "radial-gradient(circle at 20% 20%, rgba(92,255,176,.38), transparent 28%), radial-gradient(circle at 80% 15%, rgba(183,255,46,.24), transparent 30%), linear-gradient(rgba(92,255,176,.09) 1px, transparent 1px), linear-gradient(90deg, rgba(92,255,176,.09) 1px, transparent 1px), linear-gradient(145deg, #06120d 0%, #0d2419 55%, #030806 100%)",
    backgroundSize: "auto, auto, 18px 18px, 18px 18px, auto",
  },
  {
    name: "Pixel Pop",
    detail: "Coral arcade energy",
    accent: "#ff765f",
    surface: "#221027",
    background: "linear-gradient(135deg, rgba(255,118,95,.9) 0 18%, transparent 18% 36%, rgba(142,83,255,.8) 36% 54%, transparent 54% 72%, rgba(255,214,79,.72) 72% 90%, transparent 90%), linear-gradient(160deg, #36113d 0%, #16122d 48%, #090a13 100%)",
    backgroundSize: "70px 70px, auto",
  },
  {
    name: "Clean Signal",
    detail: "Minimal glass & light",
    accent: "#dff7ff",
    surface: "#16202b",
    background: "radial-gradient(circle at 72% 18%, rgba(255,255,255,.55), transparent 18%), linear-gradient(120deg, rgba(255,255,255,.18), transparent 42%), linear-gradient(145deg, #435363 0%, #1a2633 42%, #0b1118 100%)",
    backgroundSize: "auto",
  },
  {
    name: "Gold Rush",
    detail: "Dark metal & gold rays",
    accent: "#ffd35a",
    surface: "#211a0d",
    background: "repeating-conic-gradient(from 220deg at 15% 85%, rgba(255,211,90,.22) 0deg 8deg, transparent 8deg 18deg), radial-gradient(circle at 78% 20%, rgba(255,188,41,.34), transparent 26%), linear-gradient(145deg, #211604 0%, #0e0c09 58%, #050505 100%)",
    backgroundSize: "auto",
  },
  {
    name: "Midnight Circuit",
    detail: "Electric blue circuitry",
    accent: "#66a8ff",
    surface: "#0b1528",
    background: "linear-gradient(90deg, transparent 0 46%, rgba(102,168,255,.18) 46% 50%, transparent 50% 100%), linear-gradient(0deg, transparent 0 46%, rgba(102,168,255,.12) 46% 50%, transparent 50% 100%), radial-gradient(circle at 78% 30%, rgba(54,107,255,.38), transparent 28%), linear-gradient(145deg, #07101f 0%, #0b1b38 50%, #030711 100%)",
    backgroundSize: "42px 42px, 42px 42px, auto, auto",
  },
  {
    name: "Ocean Glass",
    detail: "Aqua depth & soft glass",
    accent: "#63f4ff",
    surface: "#09232a",
    background: "radial-gradient(ellipse at 18% 20%, rgba(99,244,255,.36), transparent 30%), radial-gradient(ellipse at 82% 78%, rgba(72,99,255,.3), transparent 32%), linear-gradient(165deg, rgba(255,255,255,.08), transparent 30%), linear-gradient(145deg, #062630 0%, #0c3747 44%, #07121c 100%)",
    backgroundSize: "auto",
  },
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
  const selectedTheme = themes.find((theme) => theme.name === draft.theme) ?? themes[0];

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
          <h1 className="relative mt-2 font-display text-4xl leading-none sm:text-6xl">Design the wallet you actually want to <span className="text-primary">use.</span></h1>
          <p className="relative mt-4 max-w-3xl text-sm text-muted-foreground">Customize the desktop Web3 wallet first. When you are ready, BuildAWallet will create or restore the self-custody account locally in this browser—never on our server.</p>
          <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Features", draft.features.length], ["Chains", draft.chains.length], ["Shields", draft.security.length], ["Build score", score]].map(([l, v]) => <div key={l} className="rounded-xl border border-border bg-background/60 p-3"><div className="font-display text-2xl text-accent">{v}</div><div className="font-mono text-[9px] uppercase text-muted-foreground">{l}</div></div>)}
          </div>
        </section>

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

        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Wallet atmosphere</p>
              <h2 className="mt-1 font-display text-2xl">Background & color</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Choose the visual world of the wallet. Each option changes the background artwork, accent color and preview treatment.</p>
            </div>
            <span className="rounded-full border border-border bg-card px-3 py-1 font-mono text-[10px] text-muted-foreground">Selected · {selectedTheme.name}</span>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {themes.map((theme) => {
              const selected = draft.theme === theme.name;
              return <button
                key={theme.name}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, theme: theme.name }))}
                data-selected={selected}
                className="choice-card group overflow-hidden p-0 text-left"
              >
                <div
                  className="relative h-36 overflow-hidden border-b border-white/10 p-4 text-white"
                  style={{ backgroundImage: theme.background, backgroundSize: theme.backgroundSize }}
                >
                  <div className="absolute inset-0 bg-black/10 transition group-hover:bg-transparent" />
                  <div className="relative flex h-full flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="rounded-full border border-white/25 bg-black/25 px-2 py-1 font-mono text-[9px] uppercase backdrop-blur">Wallet background</span>
                      {selected && <span className="grid size-7 place-items-center rounded-full bg-white text-black"><Check className="size-4" /></span>}
                    </div>
                    <div className="rounded-xl border border-white/15 bg-black/30 p-3 backdrop-blur-sm">
                      <div className="font-display text-xl">{draft.name}</div>
                      <div className="mt-1 font-mono text-[9px] text-white/70">$12,480.22 · preview</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <strong className="block font-display text-sm">{theme.name}</strong>
                    <span className="text-xs text-muted-foreground">{theme.detail}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="size-4 rounded-full border border-white/20" style={{ background: theme.accent }} />
                    <span className="size-4 rounded-full border border-white/20" style={{ background: theme.surface }} />
                  </div>
                </div>
              </button>;
            })}
          </div>
        </section>

        <section className="mt-10 rounded-2xl border-2 border-primary bg-card p-6 text-center">
          <Sparkles className="mx-auto size-6 text-accent" />
          <h2 className="mt-2 font-display text-3xl">Ready to make {draft.name} real?</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">Your design is finished. Next, create a new recovery phrase or restore an existing one locally in this browser. BuildAWallet never receives the phrase, private key, or wallet password.</p>
          <Button variant="arcade" size="xl" className="mt-5 h-16 w-full max-w-md text-lg" onClick={() => navigate({ to: "/human/create" })}><WalletCards /> Create my wallet</Button>
          <p className="mt-3 font-mono text-[9px] uppercase text-muted-foreground">{draft.features.length} features · {draft.chains.length} chains · build score {score}</p>
        </section>
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div
          className="mx-auto w-72 overflow-hidden rounded-[2.5rem] border-4 bg-background p-4 shadow-2xl"
          style={{ borderColor: selectedTheme.accent, boxShadow: `0 24px 70px ${selectedTheme.accent}22` }}
        >
          <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-secondary" />
          <div
            className="relative overflow-hidden rounded-[1.75rem] p-4 text-white"
            style={{ backgroundImage: selectedTheme.background, backgroundSize: selectedTheme.backgroundSize }}
          >
            <div className="absolute inset-0 bg-black/20" />
            <div className="relative">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-full font-display text-black" style={{ background: selectedTheme.accent }}>{draft.name[0] ?? "N"}</span>
                <div><strong className="block font-display text-sm">{draft.name}</strong><span className="font-mono text-[9px] text-white/70">{draft.custody} · {selectedTheme.name}</span></div>
              </div>
              <div className="mt-4 rounded-xl border border-white/15 bg-black/30 p-4 backdrop-blur-sm"><span className="font-mono text-[9px] text-white/70">STUDIO PREVIEW</span><div className="font-display text-3xl">$12,480.22</div><span className="text-xs text-white/70">demo balance</span></div>
              <div className="mt-3 grid grid-cols-4 gap-1 text-center font-mono text-[9px]">{["Send", "Receive", "Swap", "Buy"].map((a) => <div key={a} className="rounded-lg border border-white/10 bg-black/25 py-2 backdrop-blur-sm">{a}</div>)}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1">{draft.chains.slice(0, 8).map((c) => <span key={c} className="rounded-full border border-border px-2 py-0.5 text-[9px]">{c}</span>)}</div>
          <div className="mt-3 max-h-48 space-y-1 overflow-auto">{draft.features.map((f) => <div key={f} className="flex items-center gap-2 rounded-md bg-card px-2 py-1.5 text-xs"><Zap className="size-3" style={{ color: selectedTheme.accent }} />{f}</div>)}</div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full transition-all" style={{ width: `${score}%`, background: selectedTheme.accent }} /></div>
          <p className="mt-1 text-center font-mono text-[9px] text-muted-foreground">BUILD SCORE {score}/99</p>
        </div>
      </aside>
    </main>
  </WalletShell>;
}
