import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

export function WalletShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">
    <div className="safety-ticker" aria-hidden="true"><div>Keys stay local <b>•</b> Human-controlled wallet <b>•</b> Multi-chain ready <b>•</b> Local signing <b>•</b> Keys stay local <b>•</b> Human-controlled wallet <b>•</b> Multi-chain ready <b>•</b> Local signing <b>•</b></div></div>
    <header className="border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <a href="https://buildawallet.xyz/" className="flex items-center gap-3" aria-label="BuildAWallet.xyz main landing page">
          <span className="grid size-9 place-items-center rounded-lg bg-primary font-display text-base text-primary-foreground">B</span>
          <span><strong className="block font-display text-base leading-none">BuildAWallet.xyz</strong><small className="font-mono text-[9px] text-muted-foreground">human wallet builder</small></span>
        </a>
        <nav className="ml-auto flex items-center gap-1 text-xs sm:gap-3">
          <Link to="/human" className="nav-link" activeProps={{ className: "nav-link nav-link-active" }}>Setup</Link>
          <Link to="/human/studio" className="nav-link" activeProps={{ className: "nav-link nav-link-active" }}>Studio</Link>
          <Link to="/human/wallet" className="nav-link" activeProps={{ className: "nav-link nav-link-active" }}>Wallet</Link>
          <Link to="/human/download" className="nav-link" activeProps={{ className: "nav-link nav-link-active" }}>Android</Link>
        </nav>
        <a href="https://buildawallet.xyz/" className="hidden font-display text-xs text-muted-foreground hover:text-foreground lg:block" aria-label="Return to BuildAWallet.xyz main landing page">BuildAWallet.xyz</a>
        <span className="hidden items-center gap-1.5 font-mono text-[9px] text-muted-foreground md:flex"><ShieldCheck className="size-3 text-primary" /> SELF-CUSTODY</span>
      </div>
    </header>
    {children}
  </div>;
}

export function StepMeter({ step }: { step: number }) {
  const labels = ["Identity", "Custody", "Chains", "Security"];
  return <div className="mb-7"><div className="mb-2 flex justify-between font-mono text-[9px] uppercase text-muted-foreground"><span>Human setup</span><span>0{step} / 04</span></div><div className="grid grid-cols-4 gap-1">{labels.map((label, index) => <div key={label}><div className={`h-1 ${index < step ? "bg-primary" : "bg-secondary"}`} /><span className={`mt-1 hidden text-[9px] sm:block ${index + 1 === step ? "text-primary" : "text-muted-foreground"}`}>{label}</span></div>)}</div></div>;
}
