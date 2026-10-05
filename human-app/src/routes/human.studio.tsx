import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Check, ChevronRight, CircleDollarSign, Compass, Grid2X2, LayoutDashboard, Palette,
  Rocket, Search, ShieldCheck, Sparkles, Type, UserRound, WalletCards, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Ticker } from "@/components/human/step-shell";
import { PhonePreview } from "@/components/human/phone-preview";
import { useDraft } from "@/hooks/use-draft";
import { AVATARS, CURRENCIES, FEATURES, PRESETS, SKINS, type Draft, type FeatureCategory } from "@/lib/catalog";
import { CHAINS } from "@/lib/wallet/chains";

export const Route = createFileRoute("/human/studio")({
  head: () => ({
    meta: [
      { title: "Wallet Studio — BuildAWallet" },
      { name: "description", content: "Design a personalized multichain self-custody wallet with a live interactive preview." },
      { property: "og:title", content: "Wallet Studio — BuildAWallet" },
      { property: "og:description", content: "Build a wallet that looks like yours and protects assets on your terms." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Studio,
});

type StudioTab = "style" | "identity" | "layout" | "colors" | "navigation" | "assets" | "actions" | "security" | "networks" | "features" | "preview";
const tabs: { id: StudioTab; label: string; icon: typeof Palette }[] = [
  { id: "style", label: "Style", icon: Sparkles }, { id: "identity", label: "Identity", icon: UserRound },
  { id: "layout", label: "Layout", icon: LayoutDashboard }, { id: "colors", label: "Colors", icon: Palette },
  { id: "navigation", label: "Navigation", icon: Compass }, { id: "assets", label: "Assets", icon: WalletCards },
  { id: "actions", label: "Actions", icon: Zap }, { id: "security", label: "Security", icon: ShieldCheck },
  { id: "networks", label: "Networks", icon: CircleDollarSign }, { id: "features", label: "Power-ups", icon: Grid2X2 },
  { id: "preview", label: "Final preview", icon: Check },
];

const styles: { id: Draft["walletStyle"]; name: string; detail: string }[] = [
  { id: "minimal", name: "Minimal", detail: "Quiet, spacious, essentials first" },
  { id: "trader", name: "Trader", detail: "Dense rows and market signals" },
  { id: "neon", name: "Neon", detail: "Bolder accents and digital depth" },
  { id: "classic", name: "Classic", detail: "Familiar balance-first structure" },
  { id: "glass", name: "Glass", detail: "Layered translucent surfaces" },
  { id: "gallery", name: "Gallery", detail: "Visual two-column assets" },
];

function Studio() {
  const { draft, update } = useDraft();
  const navigate = useNavigate();
  const [tab, setTab] = useState<StudioTab>("style");
  const [query, setQuery] = useState("");
  const power = useMemo(() => Math.min(999, draft.features.length * 8 + draft.chains.length * 12), [draft]);
  const selectedTab = tabs.find((item) => item.id === tab) ?? { id: "style" as const, label: "Style", icon: Sparkles };
  const SelectedIcon = selectedTab.icon;

  const toggleFeature = (id: string) => {
    const feature = FEATURES.find((item) => item.id === id);
    if (feature?.core) return;
    update((current) => ({ features: current.features.includes(id) ? current.features.filter((item) => item !== id) : [...current.features, id] }));
  };
  const toggleChain = (id: string) => update((current) => {
    const next = current.chains.includes(id) ? current.chains.filter((item) => item !== id) : [...current.chains, id];
    return { chains: next.length ? next : current.chains };
  });

  return (
    <div className="human-product studio-background min-h-screen bg-background/35">
      <Ticker />
      <header className="border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto grid max-w-[1600px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <a href="/" className="shrink-0 font-display text-sm font-bold">BUILD<span className="text-splash">A</span>WALLET</a>
            <span className="hidden h-5 w-px bg-border sm:block" />
            <div className="min-w-0">
              <h1 className="wallet-heading truncate text-lg font-bold">Studio</h1>
              <p className="hidden text-xs text-muted-foreground sm:block">Shape the wallet you’ll use every day.</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden text-right sm:block"><p className="num text-sm font-bold text-primary">{power} PWR</p><p className="text-[10px] text-muted-foreground">Saved on this device</p></div>
            <Button variant="splash" onClick={() => navigate({ to: "/human/wallet" })}>Open wallet <ChevronRight /></Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid min-h-[calc(100vh-129px)] max-w-[1600px] lg:grid-cols-[180px_minmax(350px,1fr)_360px] xl:grid-cols-[210px_minmax(440px,1fr)_400px]">
        <nav aria-label="Studio categories" className="order-2 flex gap-1 overflow-x-auto border-y border-border bg-background/75 p-2 lg:order-1 lg:flex-col lg:border-y-0 lg:border-r lg:p-3">
          {tabs.map((item) => {
            const Icon = item.icon;
            return <Button key={item.id} variant="ghost" aria-current={tab === item.id ? "page" : undefined} onClick={() => setTab(item.id)} className={`shrink-0 justify-start rounded-md px-3 ${tab === item.id ? "bg-primary/12 text-primary" : "text-muted-foreground"}`}><Icon />{item.label}</Button>;
          })}
        </nav>

        <main className="order-1 flex min-h-[650px] items-center justify-center overflow-hidden px-4 py-10 lg:order-2 lg:min-h-0 lg:border-r lg:border-border">
          <div className="relative">
            <div aria-hidden="true" className="absolute inset-x-0 bottom-2 mx-auto h-20 w-56 rounded-full bg-primary/10 blur-3xl" />
            <PhonePreview draft={draft} large />
            <div className="relative mx-auto mt-6 grid max-w-sm grid-cols-3 divide-x divide-border border-y border-border py-3 text-center">
              <Metric label="Style" value={styles.find((item) => item.id === draft.walletStyle)?.name ?? "Classic"} />
              <Metric label="Networks" value={String(draft.chains.length)} />
              <Metric label="Power-ups" value={String(draft.features.length)} />
            </div>
          </div>
        </main>

        <aside className="order-3 bg-background/80 p-5 backdrop-blur-xl sm:p-6 lg:overflow-y-auto">
          <div className="mb-6 flex items-center gap-3 border-b border-border pb-4">
            <span className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary"><SelectedIcon className="size-4" /></span>
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Customize</p><h2 className="wallet-heading text-xl font-bold">{selectedTab.label}</h2></div>
          </div>
          <Inspector tab={tab} draft={draft} update={update} query={query} setQuery={setQuery} toggleChain={toggleChain} toggleFeature={toggleFeature} onFinish={() => navigate({ to: "/human/wallet" })} />
        </aside>
      </div>
    </div>
  );
}

function Inspector({ tab, draft, update, query, setQuery, toggleChain, toggleFeature, onFinish }: { tab: StudioTab; draft: Draft; update: ReturnType<typeof useDraft>["update"]; query: string; setQuery: (value: string) => void; toggleChain: (id: string) => void; toggleFeature: (id: string) => void; onFinish: () => void }) {
  if (tab === "style") return <Panel intro="Choose a foundation. Each one changes the wallet’s information density and structure."><div className="space-y-2">{styles.map((item) => <Choice key={item.id} active={draft.walletStyle === item.id} title={item.name} detail={item.detail} onClick={() => update({ walletStyle: item.id })} />)}</div><Label>Quick builds</Label><div className="grid grid-cols-2 gap-2">{PRESETS.map((preset) => <Button key={preset.id} variant="outline" className="h-auto justify-start whitespace-normal rounded-md p-3 text-left" onClick={() => update({ chains: preset.chains, features: preset.features, skin: preset.skin })}><span className="text-xl">{preset.emoji}</span><span><b className="block">{preset.name}</b><small className="font-normal text-muted-foreground">{preset.tagline}</small></span></Button>)}</div></Panel>;
  if (tab === "identity") return <Panel intro="Make it recognizable without weakening the financial interface."><Label>Wallet name</Label><Input value={draft.name} maxLength={24} onChange={(event) => update({ name: event.target.value })} className="h-11 rounded-md" /><Label>Avatar</Label><div className="grid grid-cols-6 gap-2">{AVATARS.map((avatar) => <Button key={avatar} variant="outline" size="icon" aria-label={`Use ${avatar} avatar`} onClick={() => update({ avatar })} className={`rounded-md text-lg ${draft.avatar === avatar ? "border-primary bg-primary/10" : ""}`}>{avatar}</Button>)}</div></Panel>;
  if (tab === "layout") return <Panel intro="Structure the home screen around how you check your wallet."><div className="space-y-2">{styles.map((item) => <Choice key={item.id} active={draft.walletStyle === item.id} title={item.name} detail={item.detail} onClick={() => update({ walletStyle: item.id })} />)}</div></Panel>;
  if (tab === "colors") return <Panel intro="Curated themes keep contrast and security messages readable."><div className="grid grid-cols-2 gap-3">{SKINS.map((skin) => <Button key={skin.id} variant="outline" onClick={() => update({ skin: skin.id })} className={`h-auto flex-col items-stretch rounded-md p-2 text-left ${draft.skin === skin.id ? "border-primary" : ""}`}><span className="h-16 rounded-sm" style={{ background: `linear-gradient(135deg, ${skin.bg}, ${skin.accent}, ${skin.accent2})` }} /><span className="mt-2 flex items-center justify-between gap-2 text-xs"><b>{skin.name}</b>{draft.skin === skin.id && <Check className="text-primary" />}</span></Button>)}</div></Panel>;
  if (tab === "navigation") return <Panel intro="Choose how the wallet’s core destinations stay within reach."><ChoiceGroup value={draft.navigationStyle} onChange={(navigationStyle) => update({ navigationStyle })} items={[{ id: "bottom", name: "Bottom navigation", detail: "Icons with labels" }, { id: "icons", name: "Compact icons", detail: "Maximum content space" }, { id: "floating", name: "Floating bar", detail: "Separated from content" }, { id: "text", name: "Minimal text", detail: "Low visual noise" }]} /></Panel>;
  if (tab === "assets") return <Panel intro="Set the rhythm of token balances without hiding essential values."><ChoiceGroup value={draft.assetStyle} onChange={(assetStyle) => update({ assetStyle })} items={[{ id: "compact", name: "Compact", detail: "More assets at a glance" }, { id: "detailed", name: "Detailed", detail: "Name, amount, and value" }, { id: "visual", name: "Visual", detail: "Stronger token identity" }]} /></Panel>;
  if (tab === "actions") return <Panel intro="Send and Receive remain the only primary wallet actions."><ChoiceGroup value={draft.actionStyle} onChange={(actionStyle) => update({ actionStyle })} items={[{ id: "duo", name: "Balanced duo", detail: "Two clear action blocks" }, { id: "toolbar", name: "Compact toolbar", detail: "One efficient action row" }, { id: "round", name: "Round actions", detail: "Large mobile touch targets" }]} /></Panel>;
  if (tab === "networks") return <Panel intro="Select the mainnets this wallet will show. At least one remains enabled."><div className="space-y-1">{CHAINS.map((chain) => <ToggleRow key={chain.id} title={chain.name} detail={`${chain.symbol} · Mainnet`} checked={draft.chains.includes(chain.id)} onChange={() => toggleChain(chain.id)} />)}</div></Panel>;
  if (tab === "features") {
    const visible = FEATURES.filter((feature) => `${feature.name} ${feature.detail}`.toLowerCase().includes(query.toLowerCase()));
    return <Panel intro="Every available power-up maps to working wallet behavior."><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search power-ups" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" /></div><div className="mt-4 space-y-1">{visible.map((feature) => <ToggleRow key={feature.id} title={`${feature.emoji} ${feature.name}`} detail={feature.detail} checked={feature.core || draft.features.includes(feature.id)} disabled={feature.core ?? false} onChange={() => toggleFeature(feature.id)} />)}</div></Panel>;
  }
  if (tab === "security") return <Panel intro="These limits are enforced inside the deployed wallet."><Range label="Auto-lock" value={`${draft.autoLockMin} min`} min={1} max={60} step={1} current={draft.autoLockMin} onChange={(autoLockMin) => update({ autoLockMin })} /><Range label="Large-send warning" value={`$${draft.bigSendUsd.toLocaleString()}`} min={50} max={20000} step={50} current={draft.bigSendUsd} onChange={(bigSendUsd) => update({ bigSendUsd })} /><Range label="Session limit" value={`$${draft.sessionLimitUsd.toLocaleString()}`} min={100} max={100000} step={100} current={draft.sessionLimitUsd} onChange={(sessionLimitUsd) => update({ sessionLimitUsd })} /><Label>Display currency</Label><div className="grid grid-cols-5 gap-1.5">{CURRENCIES.map((currency) => <Button key={currency} variant={draft.currency === currency ? "default" : "outline"} size="sm" onClick={() => update({ currency })} className="rounded-md uppercase">{currency}</Button>)}</div></Panel>;
  return <Panel intro="Your design is ready. Open the self-custody web wallet to create or restore keys locally."><div className="divide-y divide-border border-y border-border"><Summary label="Wallet" value={`${draft.avatar} ${draft.name}`} /><Summary label="Style" value={styles.find((item) => item.id === draft.walletStyle)?.name ?? "Classic"} /><Summary label="Theme" value={SKINS.find((item) => item.id === draft.skin)?.name ?? "Acid Vault"} /><Summary label="Networks" value={String(draft.chains.length)} /><Summary label="Power-ups" value={String(draft.features.length)} /><Summary label="Auto-lock" value={`${draft.autoLockMin} min`} /></div><p className="mt-5 text-xs text-muted-foreground">Deploy saves the design only. Recovery words and private keys are created or restored on your device afterward.</p><Button variant="splash" size="lg" className="mt-5 w-full" onClick={onFinish}><Rocket />Open web wallet</Button></Panel>;
}

function Panel({ intro, children }: { intro: string; children: React.ReactNode }) { return <div><p className="mb-5 text-sm leading-6 text-muted-foreground">{intro}</p>{children}</div>; }
function Label({ children }: { children: React.ReactNode }) { return <p className="mb-2 mt-6 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{children}</p>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="min-w-0 px-3"><p className="truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="truncate text-sm font-bold">{value}</p></div>; }
function Choice({ active, title, detail, onClick }: { active: boolean; title: string; detail: string; onClick: () => void }) { return <Button variant="outline" onClick={onClick} className={`h-auto w-full justify-between whitespace-normal rounded-md p-3 text-left ${active ? "border-primary bg-primary/8" : ""}`}><span><b className="block">{title}</b><small className="font-normal text-muted-foreground">{detail}</small></span>{active && <Check className="text-primary" />}</Button>; }
function ChoiceGroup<T extends string>({ value, onChange, items }: { value: T; onChange: (value: T) => void; items: { id: T; name: string; detail: string }[] }) { return <div className="space-y-2">{items.map((item) => <Choice key={item.id} active={value === item.id} title={item.name} detail={item.detail} onClick={() => onChange(item.id)} />)}</div>; }
function ToggleRow({ title, detail, checked, disabled, onChange }: { title: string; detail: string; checked: boolean; disabled?: boolean; onChange: () => void }) { return <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{title}</p><p className="line-clamp-2 text-xs text-muted-foreground">{detail}</p></div><Switch checked={checked} disabled={disabled} onCheckedChange={onChange} /></div>; }
function Range({ label, value, min, max, step, current, onChange }: { label: string; value: string; min: number; max: number; step: number; current: number; onChange: (value: number) => void }) { return <div className="mb-7"><div className="mb-3 flex justify-between gap-3 text-sm"><span className="font-semibold">{label}</span><span className="num text-primary">{value}</span></div><Slider min={min} max={max} step={step} value={[current]} onValueChange={([value]) => value !== undefined && onChange(value)} /></div>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4 py-3 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-semibold">{value}</span></div>; }