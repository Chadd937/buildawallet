import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Flame, Rocket, Search, Sparkles, Trophy, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ticker } from "@/components/human/step-shell";
import { PhonePreview } from "@/components/human/phone-preview";
import { SafetyLimits } from "@/components/human/safety-limits";
import { useDraft } from "@/hooks/use-draft";
import { AVATARS, FEATURES, MEMES, PRESETS, SKINS, type FeatureCategory } from "@/lib/catalog";
import { CHAINS } from "@/lib/wallet/chains";
import hero from "@/assets/studio-hero.jpg";

export const Route = createFileRoute("/human/studio")({
  head: () => ({
    meta: [
      { title: "Wallet Studio ,  BuildAWallet" },
      { name: "description", content: "Mix skins, chains and power-ups into your own self-custody wallet, then deploy it to web and Android." },
      { property: "og:title", content: "Wallet Studio ,  BuildAWallet" },
      { property: "og:description", content: "The wallet builder that feels like an NFT drop. Pick, mix, deploy." },
    ],
  }),
  component: Studio,
});

const CATS: ("All" | FeatureCategory)[] = ["All", "Core", "Assets", "Security", "Privacy", "Power tools", "Style"];
const RARITY_CLASS: Record<string, string> = {
  Common: "bg-surface-2 text-muted-foreground",
  Rare: "bg-primary/15 text-primary",
  Epic: "bg-pop/15 text-pop",
  Legendary: "bg-zap/20 text-zap",
};
const RARITY_PTS: Record<string, number> = { Common: 4, Rare: 8, Epic: 14, Legendary: 22 };

function useCountUp(target: number) {
  const [v, setV] = useState(target);
  useEffect(() => {
    const start = v;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 450);
      setV(Math.round(start + (target - start) * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return v;
}

function Studio() {
  const { draft, update, ready } = useDraft();
  const navigate = useNavigate();
  const [cat, setCat] = useState<(typeof CATS)[number]>("All");
  const [q, setQ] = useState("");

  const visible = FEATURES.filter((f) => (cat === "All" || f.category === cat) && (f.name + f.detail).toLowerCase().includes(q.toLowerCase()));
  const power = useMemo(() => {
    const f = FEATURES.filter((x) => draft.features.includes(x.id)).reduce((s, x) => s + (RARITY_PTS[x.rarity] ?? 0), 0);
    return Math.min(999, f + draft.chains.length * 12);
  }, [draft]);
  const shownPower = useCountUp(power);
  const tier = power > 300 ? "LEGENDARY" : power > 200 ? "EPIC" : power > 110 ? "RARE" : "COMMON";

  const toggleFeature = (id: string) => {
    const f = FEATURES.find((x) => x.id === id);
    if (f?.core) return;
    update((d) => ({ features: d.features.includes(id) ? d.features.filter((x) => x !== id) : [...d.features, id] }));
  };
  const toggleChain = (id: string) =>
    update((d) => {
      const next = d.chains.includes(id) ? d.chains.filter((c) => c !== id) : [...d.chains, id];
      return { chains: next.length ? next : d.chains };
    });

  return (
    <div className="studio-background min-h-screen">
      <Ticker />
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        <img src={hero} alt="Holographic wallet card surrounded by coins" className="absolute inset-0 h-full w-full object-cover opacity-55 brightness-110 saturate-110" width={1280} height={768} />
        <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/55 to-background/80" />
        <div className="relative mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[1.4fr_1fr] lg:py-20">
          <div>
            <a href="/" className="font-display text-sm font-bold">BUILD<span className="text-splash">A</span>WALLET</a>
            <p className="mt-8 inline-flex items-center gap-2 rounded-full bg-pop/15 px-3 py-1 text-xs font-bold text-pop">
              <Flame className="size-3.5" /> LIVE MINT · MAINNET
            </p>
            <h1 className="mt-4 text-5xl font-black leading-[0.95] sm:text-7xl">
              The <span className="shimmer-text">Studio</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-foreground">
              Collect power-ups, pick your chains, drip it in a skin. Every card you pick is a real feature in your deployed wallet.
            </p>
            <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
              <Stat label="Power score" value={ready ? shownPower : 0} accent="text-primary" />
              <Stat label="Chains" value={draft.chains.length} accent="text-pop" />
              <Stat label="Power-ups" value={draft.features.length} accent="text-zap" />
            </div>
          </div>
          <div className="relative hidden items-center justify-center lg:flex">
            <div className="animate-float"><PhonePreview draft={draft} /></div>
            {MEMES.slice(0, 5).map((m, i) => (
              <span key={m} className={`absolute rounded-full px-3 py-1 font-display text-xs font-bold shadow-card ${["bg-primary text-primary-foreground", "bg-pop text-pop-foreground", "bg-zap text-zap-foreground"][i % 3]}`}
                style={{ top: `${10 + i * 18}%`, [i % 2 ? "right" : "left"]: `${i * 3}%`, transform: `rotate(${i % 2 ? 8 : -8}deg)` }}>
                {m}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-10 lg:grid-cols-[1fr_320px]">
        <div className="space-y-14">
          {/* DROPS */}
          <Section kicker="Featured drops" title="One-click presets" icon={<Trophy className="size-5 text-zap" />}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {PRESETS.map((p) => (
                <button key={p.id} onClick={() => update({ chains: p.chains, features: p.features, skin: p.skin })}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-surface p-4 text-left transition hover:-translate-y-1 hover:shadow-neon">
                  <span className="text-4xl transition group-hover:animate-wiggle inline-block">{p.emoji}</span>
                  <p className="mt-3 font-display font-bold">{p.name}</p>
                  <p className="text-sm text-foreground">{p.tagline}</p>
                  <p className="num mt-3 text-xs text-primary">{p.chains.length} chains · {p.features.length} power-ups</p>
                </button>
              ))}
            </div>
          </Section>

          {/* IDENTITY */}
          <Section kicker="01" title="Identity" icon={<Sparkles className="size-5 text-primary" />}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="text-sm font-semibold" htmlFor="sname">Name</label>
                <Input id="sname" maxLength={24} value={draft.name} onChange={(e) => update({ name: e.target.value })} className="mt-2 h-12 rounded-xl text-lg" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {AVATARS.map((a) => (
                  <button key={a} aria-label={`Avatar ${a}`} onClick={() => update({ avatar: a })}
                    className={`size-11 rounded-xl text-xl transition hover:scale-110 ${draft.avatar === a ? "bg-primary/20 ring-2 ring-primary" : "bg-surface"}`}>{a}</button>
                ))}
              </div>
            </div>
          </Section>

          {/* SKINS */}
          <Section kicker="02" title="Skins collection" icon={<Zap className="size-5 text-pop" />}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {SKINS.map((s, i) => {
                const on = draft.skin === s.id;
                return (
                  <button key={s.id} onClick={() => update({ skin: s.id })}
                    className={`group overflow-hidden rounded-2xl border text-left transition hover:-translate-y-1 ${on ? "border-primary shadow-neon" : "border-border"}`}>
                    <div className="relative h-28" style={{ background: `radial-gradient(circle at 30% 30%, ${s.accent}, transparent 55%), radial-gradient(circle at 80% 80%, ${s.accent2}, transparent 50%), ${s.bg}` }}>
                      <span className="num absolute left-2 top-2 rounded-md bg-background/70 px-1.5 py-0.5 text-[10px]">#{String(i + 1).padStart(3, "0")}</span>
                      {on && <Check className="absolute right-2 top-2 size-5 rounded-full bg-primary p-0.5 text-primary-foreground" />}
                    </div>
                    <div className="bg-surface p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">{s.name}</p>
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${RARITY_CLASS[s.rarity]}`}>{s.rarity}</span>
                      </div>
                      <p className="text-xs text-foreground">{s.vibe}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* CHAINS */}
          <Section kicker="03" title="Chains" icon={<span className="text-lg">⛓</span>}>
            <div className="flex flex-wrap gap-2">
              {CHAINS.map((c) => {
                const on = draft.chains.includes(c.id);
                return (
                  <button key={c.id} onClick={() => toggleChain(c.id)}
                    className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${on ? "border-primary bg-primary/10" : "border-border bg-surface text-foreground"}`}>
                    <span className="size-2.5 rounded-full" style={{ background: `oklch(0.78 0.17 ${c.hue})` }} />
                    {c.name}
                    <span className="num text-xs opacity-70">{c.symbol}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* POWER-UPS */}
          <Section kicker="04" title="Power-ups marketplace" icon={<Rocket className="size-5 text-zap" />}>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-1.5">
                {CATS.map((c) => (
                  <button key={c} onClick={() => setCat(c)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${cat === c ? "bg-foreground text-background" : "bg-surface text-foreground"}`}>
                    {c}
                  </button>
                ))}
              </div>
              <div className="relative sm:w-56">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground" />
                <Input placeholder="Search power-ups" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 rounded-full pl-9" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((f, i) => {
                const on = draft.features.includes(f.id) || f.core;
                return (
                  <button key={f.id} onClick={() => toggleFeature(f.id)} disabled={f.core}
                    className={`group relative flex flex-col overflow-hidden rounded-2xl border p-4 text-left transition hover:-translate-y-1 disabled:cursor-default ${on ? "border-primary/70 bg-primary/5" : "border-border bg-surface"}`}>
                    <div className="flex items-start justify-between">
                      <span className="grid size-12 place-items-center rounded-xl bg-surface-2 text-2xl transition group-hover:scale-110">{f.emoji}</span>
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${RARITY_CLASS[f.rarity]}`}>{f.rarity}</span>
                    </div>
                    <p className="mt-3 font-semibold">{f.name}</p>
                    <p className="mt-1 flex-1 text-xs text-foreground">{f.detail}</p>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="num text-foreground">#{String(i + 1).padStart(3, "0")} · +{RARITY_PTS[f.rarity]} pwr</span>
                      <span className={`font-bold ${on ? "text-primary" : "text-foreground"}`}>{f.core ? "INCLUDED" : on ? "EQUIPPED ✓" : "+ ADD"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Section>
        </div>

        {/* SIDEBAR */}
        <aside className="lg:sticky lg:top-6 lg:h-fit">
          <div className="lg:hidden"><PhonePreview draft={draft} /></div>
          <div className="mt-6 rounded-2xl border border-border bg-surface p-5 lg:mt-0">
            <p className="text-xs uppercase tracking-widest text-foreground">Build tier</p>
            <p className="shimmer-text font-display text-3xl font-black">{tier}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-splash transition-all" style={{ width: `${Math.min(100, power / 4)}%` }} />
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <Row k="Skin" v={SKINS.find((s) => s.id === draft.skin)?.name ?? ""} />
              <Row k="Keys" v="Create or import at launch" />
              <Row k="Auto-lock" v={`${draft.autoLockMin} min`} />
              <Row k="Currency" v={draft.currency.toUpperCase()} />
            </dl>
          </div>
        </aside>
      </div>

      <SafetyLimits />

      {/* DEPLOY */}
      <section className="border-t border-border bg-surface/60 px-5 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-black sm:text-5xl">Ready to <span className="text-splash">ship it</span>?</h2>
          <p className="mt-3 text-foreground">Deploy your build to the desktop web wallet, Android, or both.</p>
          <Button variant="splash" size="xl" className="mt-8 w-full animate-pulse-ring sm:w-auto sm:px-20" onClick={() => navigate({ to: "/human/deploy" })}>
            <Rocket className="size-6" /> Deploy wallet
          </Button>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="glass rounded-2xl p-3">
      <p className={`num text-3xl font-bold ${accent}`}>{value}</p>
      <p className="text-xs text-foreground">{label}</p>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2"><dt className="text-foreground">{k}</dt><dd className="font-semibold">{v}</dd></div>
  );
}
function Section({ kicker, title, icon, children }: { kicker: string; title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        {icon}
        <p className="num text-xs uppercase tracking-[0.25em] text-foreground">{kicker}</p>
      </div>
      <h2 className="mb-5 text-2xl font-bold sm:text-3xl">{title}</h2>
      {children}
    </section>
  );
}
