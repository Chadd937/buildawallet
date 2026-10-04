import type { CSSProperties } from "react";
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

/** Live concept of the user's wallet, driven entirely by the draft. */
export function PhonePreview({ draft }: { draft: Draft }) {
  const chains = draft.chains.map(chainById).filter(Boolean);
  const extra = FEATURES.filter((f) => !f.core && draft.features.includes(f.id)).slice(0, 6);
  return (
    <div className="mx-auto w-[280px] rounded-[2.6rem] border-[10px] border-surface-2 bg-surface-2 shadow-card">
      <div style={skinVars(draft.skin)} className="skin skin-glow relative h-[540px] overflow-hidden rounded-[2rem]">
        <div className="mx-auto mt-2 h-5 w-24 rounded-full bg-background/80" />
        <div className="px-5 pt-4">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-full skin-surface text-lg">{draft.avatar}</span>
            <div>
              <p className="text-sm font-bold leading-tight">{draft.name || "My Wallet"}</p>
              <p className="text-[10px] skin-muted">{chains.length} chains · self-custody</p>
            </div>
          </div>
          <p className="mt-6 text-[10px] uppercase tracking-widest skin-muted">Total balance</p>
          <p className={`num text-3xl font-bold ${has(draft, "hide") ? "" : ""}`}>
            {draft.currency.toUpperCase()} 0.00
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] font-semibold">
            <span className="rounded-xl py-2 skin-accent">Send</span>
            <span className="rounded-xl py-2 skin-surface">Receive</span>
            <span className="rounded-xl py-2 skin-surface">{has(draft, "addressbook") ? "Contacts" : "Activity"}</span>
          </div>
          <div className="mt-4 space-y-1.5">
            {chains.slice(0, 5).map((c) => (
              <div key={c!.id} className="flex items-center justify-between rounded-xl px-3 py-2 skin-surface">
                <span className="flex items-center gap-2 text-xs font-semibold">
                  <span className="size-2.5 rounded-full" style={{ background: `oklch(0.78 0.17 ${c!.hue})` }} />
                  {c!.name}
                </span>
                <span className="num text-[11px] skin-muted">0 {c!.symbol}</span>
              </div>
            ))}
            {chains.length > 5 && <p className="text-center text-[10px] skin-muted">+{chains.length - 5} more</p>}
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {extra.map((f) => (
              <span key={f.id} className="rounded-full border px-2 py-0.5 text-[9px] skin-border skin-accent2-text">
                {f.emoji} {f.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
