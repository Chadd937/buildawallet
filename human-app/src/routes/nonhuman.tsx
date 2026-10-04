import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/nonhuman")({
  component: MachineLayout,
});

const NAV = [
  { to: "/nonhuman", label: "Overview", exact: true },
  { to: "/nonhuman/wallets", label: "Wallets" },
  { to: "/nonhuman/pay-per-call", label: "Pay per call" },
  { to: "/nonhuman/mcp", label: "MCP" },
  { to: "/nonhuman/api", label: "API explorer" },
  { to: "/nonhuman/chains", label: "Chains" },
  { to: "/nonhuman/pricing", label: "Pricing" },
] as const;

function MachineLayout() {
  return (
    <div className="studio-background min-h-screen overflow-x-clip text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 md:px-10">
          <Link to="/" className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.2em] text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /><span className="hidden sm:inline">Sides</span></Link>
          <Link to="/nonhuman" className="truncate font-display text-sm font-black sm:text-base">BUILD<span className="text-primary">A</span>WALLET <span className="hidden text-pop sm:inline">/ machine</span></Link>
          <Link to="/nonhuman/dashboard" className="shrink-0 rounded-full bg-primary px-3 py-1.5 sm:px-4 font-display text-[11px] font-black uppercase text-primary-foreground hover:opacity-90">Dashboard</Link>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2 md:px-8" aria-label="Machine side">
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} activeOptions={{ exact: "exact" in item }}
              className="whitespace-nowrap rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
              activeProps={{ className: "bg-primary/15 text-primary" }}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main><Outlet /></main>
      <footer className="mx-auto max-w-6xl px-5 py-12 font-mono text-[11px] uppercase tracking-widest text-muted-foreground md:px-10">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <a href="/openapi.json" className="hover:text-primary">openapi.json</a>
          <a href="/.well-known/agent.json" className="hover:text-primary">agent.json</a>
          <a href="/llms.txt" className="hover:text-primary">llms.txt</a>
          <a href="/mcp" className="hover:text-primary">/mcp</a>
          <span>Non-custodial · local signing · ten mainnets</span>
        </div>
      </footer>
    </div>
  );
}
