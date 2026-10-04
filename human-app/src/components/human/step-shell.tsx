import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MEMES } from "@/lib/catalog";

const STEPS = [
  { to: "/human/setup", label: "Identity" },
  { to: "/human/studio", label: "Studio" },
  { to: "/human/deploy", label: "Deploy" },
  { to: "/human/wallet", label: "Launch" },
] as const;

export function StepShell({
  step,
  title,
  subtitle,
  children,
  next,
  canNext = true,
}: {
  step: 1;
  title: string;
  subtitle: string;
  children: ReactNode;
  next: "/human/studio";
  canNext?: boolean;
}) {
  const navigate = useNavigate();
  const back: null = null;

  return (
    <div className="studio-background relative min-h-screen overflow-hidden">
      <Ticker />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-5 pt-6">
        <a href="/" className="font-display text-sm font-bold tracking-tight">
          BUILD<span className="text-splash">A</span>WALLET
        </a>
        <ol className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s.to} className="flex items-center gap-1.5">
              <Link
                to={s.to}
                className={`flex h-8 items-center gap-2 rounded-full px-3 text-xs font-semibold transition ${
                  i + 1 === step
                    ? "bg-primary text-primary-foreground"
                    : i + 1 < step
                      ? "bg-surface-2 text-foreground"
                      : "text-muted-foreground"
                }`}
              >
                <span className="num">{i + 1}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </Link>
              {i < 3 && <span className="h-px w-3 bg-border sm:w-6" />}
            </li>
          ))}
        </ol>
      </header>

      <main className="relative z-10 flex min-h-[calc(100vh-120px)] items-center justify-center px-4 py-10">
        <section
          role="dialog"
          aria-labelledby="step-title"
          className="glass w-full max-w-2xl animate-scale-in rounded-3xl p-6 shadow-card sm:p-9"
        >
          <p className="num text-xs uppercase tracking-[0.25em] text-primary">Step {step} of 4</p>
          <h1 id="step-title" className="mt-2 text-3xl font-bold sm:text-4xl">
            {title}
          </h1>
          <p className="mt-2 text-muted-foreground">{subtitle}</p>
          <div className="mt-7">{children}</div>
          <div className="mt-8 flex items-center justify-between gap-3">
            {back ? (
              <Button variant="ghost" onClick={() => navigate({ to: back })}>
                <ArrowLeft /> Back
              </Button>
            ) : (
              <a href="/" className="text-sm text-muted-foreground hover:text-foreground">
                ← Home
              </a>
            )}
            <Button size="lg" disabled={!canNext} onClick={() => navigate({ to: next })}>
              {next === "/human/studio" ? "Enter the Studio" : "Continue"} <ArrowRight />
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}

export function Ticker() {
  const items = [...MEMES, ...MEMES];
  return (
    <div className="relative z-10 overflow-hidden border-b border-border bg-surface/60 py-2">
      <div className="flex w-max animate-marquee gap-8 whitespace-nowrap">
        {items.map((m, i) => (
          <span key={i} className={`font-display text-xs font-bold ${i % 3 === 0 ? "text-primary" : i % 3 === 1 ? "text-pop" : "text-zap"}`}>
            ✦ {m}
          </span>
        ))}
      </div>
    </div>
  );
}

export function OptionCard({
  active,
  onClick,
  children,
  className = "",
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`relative rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${
        active ? "border-primary bg-primary/10 shadow-neon" : "border-border bg-surface hover:border-foreground/30"
      } ${className}`}
    >
      {children}
    </button>
  );
}
