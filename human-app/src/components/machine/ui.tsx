import { CheckCircle2, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { void navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary"
      aria-label={label}
    >
      {done ? <CheckCircle2 size={13} /> : <Copy size={13} />} {done ? "Copied" : label}
    </button>
  );
}

export function Code({ code, title }: { code: string; title?: string }) {
  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-primary/25 bg-background/85 backdrop-blur">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{title ?? "code"}</span>
        <CopyButton value={code} />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 text-foreground/85"><code>{code}</code></pre>
    </div>
  );
}

export function Eyebrow({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "pop" | "zap" }) {
  const cls = tone === "pop" ? "text-pop" : tone === "zap" ? "text-zap" : "text-primary";
  return <p className={`font-mono text-xs uppercase tracking-[.25em] ${cls}`}>{children}</p>;
}

export function PageHero({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-10 pt-12 md:px-10 md:pt-16">
      <Eyebrow tone="pop">{eyebrow}</Eyebrow>
      <h1 className="mt-3 font-display text-4xl font-black uppercase leading-[.95] tracking-[-.04em] md:text-6xl">{title}</h1>
      {children ? <div className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">{children}</div> : null}
    </section>
  );
}

export function Section({ id, eyebrow, title, intro, children }: { id?: string; eyebrow?: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl px-5 py-10 md:px-10">
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="mt-2 font-display text-2xl font-black uppercase md:text-3xl">{title}</h2>
      {intro ? <div className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{intro}</div> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border bg-card/70 p-5 backdrop-blur ${className}`}>{children}</div>;
}

export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-display text-sm font-black text-primary-foreground">{n}</div>
      <div className="min-w-0 flex-1 pb-6">
        <h3 className="font-display text-base font-black uppercase">{title}</h3>
        <div className="mt-2 space-y-3 text-sm leading-6 text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "primary" | "pop" | "zap" }) {
  const cls = { muted: "border-border text-muted-foreground", primary: "border-primary/40 text-primary", pop: "border-pop/40 text-pop", zap: "border-zap/40 text-zap" }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${cls}`}>{children}</span>;
}
