import type { CSSProperties } from "react";
import { ArrowDownLeft, ArrowUpRight, Clock3, Home, Settings } from "lucide-react";
import { FEATURES, has, skinById, type Draft } from "@/lib/catalog";
import { chainById } from "@/lib/wallet/chains";

export function skinVars(skinId: string): CSSProperties {
  const s = skinById(skinId);
  return {
    ["--skin-bg" as string]: s.bg,
    ["--skin-surface" as string]: s.surface,
    ["--skin-accent" as string]: s.accent,
    ["--skin-accent2" as string]: s.accent2,
    ["--skin-text" as string]: s.text,
  };
}

const previewAssets = [
  { symbol: "ETH", name: "Ethereum", amount: "1.84 ETH", value: "$6,123.23", hue: 265 },
  { symbol: "USDC", name: "USD Coin", amount: "3,211.00", value: "$3,211.00", hue: 235 },
  { symbol: "POL", name: "Polygon", amount: "4,824 POL", value: "$1,790.00", hue: 315 },
];

export function PhonePreview({ draft, large = false }: { draft: Draft; large?: boolean }) {
  const chains = draft.chains.map(chainById).filter(Boolean);
  const extra = FEATURES.filter((f) => !f.core && draft.features.includes(f.id)).slice(0, 3);
  const assets = previewAssets.filter((asset, index) => index < Math.max(1, Math.min(3, chains.length)));
  const minimal = draft.walletStyle === "minimal";
  const trader = draft.walletStyle === "trader";
  const gallery = draft.walletStyle === "gallery";

  return (
    <div className={`mx-auto transition-[width] duration-300 ${large ? "w-[300px] sm:w-[326px]" : "w-[280px]"}`}>
      <div className="rounded-[2.35rem] border-[8px] border-wallet-frame bg-wallet-frame p-1 shadow-wallet-device">
        <div style={skinVars(draft.skin)} className={`skin skin-glow relative overflow-hidden rounded-[1.75rem] ${large ? "h-[600px]" : "h-[540px]"}`}>
          <div className="mx-auto mt-2 h-4 w-20 rounded-full bg-background/80" />
          <div className={trader ? "px-4 pt-3" : "px-5 pt-4"}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg skin-surface text-lg">{draft.avatar}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold leading-tight">{draft.name || "My Wallet"}</p>
                  <p className="truncate text-[10px] skin-muted">{chains.length} networks · local signing</p>
                </div>
              </div>
              <span className="size-2 rounded-full bg-success" title="Mainnet connected" />
            </div>

            <div className={`mt-6 ${minimal ? "text-center" : ""}`}>
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] skin-muted">Portfolio balance</p>
              <p className={`num mt-1 font-bold tracking-tight ${trader ? "text-3xl" : "text-[2rem]"}`}>$12,742.89</p>
              <p className="num mt-1 text-[10px] text-success">+$284.12 · 2.31% today</p>
            </div>

            <div className={`mt-5 ${draft.actionStyle === "round" ? "flex justify-center gap-5" : draft.actionStyle === "toolbar" ? "grid grid-cols-2 overflow-hidden rounded-lg border skin-border" : "grid grid-cols-2 gap-2"}`}>
              <PreviewAction icon={<ArrowUpRight />} label="Send" active style={draft.actionStyle} />
              <PreviewAction icon={<ArrowDownLeft />} label="Receive" style={draft.actionStyle} />
            </div>

            <div className="mt-5 flex items-center justify-between">
              <p className="text-xs font-bold">Assets</p>
              <p className="text-[9px] skin-muted">{chains.length} networks</p>
            </div>
            <div className={`mt-2 ${gallery ? "grid grid-cols-2 gap-2" : "divide-y divide-current/10"}`}>
              {assets.map((asset, index) => (
                <div key={asset.symbol} className={`${gallery ? "rounded-lg p-3 skin-surface" : `grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 ${draft.assetStyle === "compact" ? "py-2" : "py-3"}`}`}>
                  {draft.assetStyle !== "compact" && <span className="grid size-8 shrink-0 place-items-center rounded-lg skin-surface text-[10px] font-bold" style={{ color: `oklch(0.82 0.17 ${asset.hue})` }}>{asset.symbol.slice(0, 1)}</span>}
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-bold">{draft.assetStyle === "detailed" ? asset.name : asset.symbol}</p>
                    {draft.assetStyle === "detailed" && <p className="num text-[9px] skin-muted">{asset.amount}</p>}
                  </div>
                  <div className={`${gallery ? "mt-3" : "text-right"}`}>
                    <p className="num text-[10px] font-semibold">{draft.assetStyle === "compact" ? asset.amount : asset.value}</p>
                    {trader && <p className={`num text-[8px] ${index === 1 ? "text-destructive" : "text-success"}`}>{index === 1 ? "−0.04%" : "+1.82%"}</p>}
                  </div>
                </div>
              ))}
            </div>

            {extra.length > 0 && !minimal && (
              <div className="mt-3 flex gap-1 overflow-hidden">
                {extra.map((f) => <span key={f.id} className="shrink-0 rounded-md border px-1.5 py-0.5 text-[8px] skin-border">{f.emoji} {f.name}</span>)}
              </div>
            )}
          </div>
          <PreviewNavigation style={draft.navigationStyle} />
        </div>
      </div>
    </div>
  );
}

function PreviewAction({ icon, label, active, style }: { icon: React.ReactNode; label: string; active?: boolean; style: Draft["actionStyle"] }) {
  return (
    <span className={`flex items-center justify-center gap-1.5 text-[10px] font-bold ${style === "round" ? `size-12 flex-col rounded-full ${active ? "skin-accent" : "skin-surface"}` : `py-2.5 ${active ? "skin-accent" : "skin-surface"}`}`}>
      <span className="[&_svg]:size-3.5">{icon}</span>{style !== "round" || label === "Send" ? label : null}
    </span>
  );
}

function PreviewNavigation({ style }: { style: Draft["navigationStyle"] }) {
  const floating = style === "floating";
  return (
    <div className={`absolute bottom-3 left-3 right-3 grid grid-cols-3 items-center px-3 py-2 ${floating ? "rounded-xl border skin-border skin-surface" : "border-t skin-border"}`}>
      {[[Home, "Home"], [Clock3, "Activity"], [Settings, "Settings"]].map(([Icon, label], index) => {
        const NavIcon = Icon as typeof Home;
        return <span key={label as string} className={`flex items-center justify-center gap-1 text-[9px] ${index === 0 ? "skin-accent-text" : "skin-muted"}`}><NavIcon className="size-3" />{style === "icons" ? null : label as string}</span>;
      })}
    </div>
  );
}