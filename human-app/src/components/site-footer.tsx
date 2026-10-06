import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Mail, ShieldCheck } from "lucide-react";

const legalLinks = [
  { to: "/terms", label: "Terms" },
  { to: "/privacy", label: "Privacy" },
  { to: "/privacy-choices", label: "Don’t sell my data" },
  { to: "/support", label: "Support" },
  { to: "/advertising", label: "Advertising" },
] as const;

const productLinks = [
  { to: "/blog", label: "Blog" },
  { to: "/human/setup", label: "Human wallet" },
  { to: "/human/studio", label: "Wallet Studio" },
  { to: "/human/wallet", label: "Web wallet" },
  { to: "/human/android", label: "Android build" },
] as const;

const machineLinks = [
  { to: "/nonhuman", label: "Agent APIs" },
  { to: "/nonhuman/api", label: "API docs" },
  { to: "/nonhuman/mcp", label: "MCP" },
  { to: "/nonhuman/pricing", label: "Pricing" },
] as const;

type FooterPath = (typeof legalLinks | typeof productLinks | typeof machineLinks)[number]["to"];

export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-border bg-background/90 backdrop-blur-xl">
      <div className="mx-auto grid max-w-[1500px] gap-8 px-5 py-10 sm:px-6 lg:grid-cols-[1.2fr_2fr] lg:px-8">
        <div>
          <Link to="/" className="font-display text-lg font-black">BUILD<span className="text-splash">A</span>WALLET</Link>
          <p className="mt-3 max-w-sm text-sm leading-6 text-foreground">
            Self-custody wallet software for people, plus paid mainnet data tools for autonomous agents.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-2 text-foreground"><ShieldCheck className="size-3.5 text-primary" />Keys stay local</span>
            <a href="mailto:support@buildawallet.xyz" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-2 text-primary hover:border-primary"><Mail className="size-3.5" />support@buildawallet.xyz</a>
          </div>
        </div>
        <nav aria-label="Footer" className="grid gap-6 sm:grid-cols-3">
          <FooterColumn title="Legal" links={legalLinks} />
          <FooterColumn title="Human" links={productLinks} />
          <FooterColumn title="Machine" links={machineLinks} />
        </nav>
      </div>
      <div className="border-t border-border px-5 py-4 text-xs text-foreground sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 BuildAWallet. Mainnet software; users control their own keys and transactions.</p>
          <a href="mailto:support@buildawallet.xyz" className="inline-flex items-center gap-1 text-primary hover:underline">Contact support <ArrowUpRight className="size-3" /></a>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: readonly { to: FooterPath; label: string }[] }) {
  return (
    <div>
      <h2 className="wallet-heading text-sm font-bold">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map((link) => (
          <li key={link.to}>
            <Link to={link.to} className="text-foreground hover:text-primary">{link.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
