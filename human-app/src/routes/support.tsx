import { createFileRoute } from "@tanstack/react-router";
import { Mail, ShieldAlert, WalletCards } from "lucide-react";
import type { ReactNode } from "react";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support : BuildAWallet" },
      { name: "description", content: "Contact BuildAWallet support for wallet, Android, machine API, billing, privacy, advertising, and security help." },
      { property: "og:title", content: "Support : BuildAWallet" },
      { property: "og:description", content: "BuildAWallet support for wallet, Android, APIs, billing, advertising, privacy, and security." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  return <main className="studio-background min-h-screen px-5 py-14"><div className="mx-auto max-w-5xl"><p className="num text-xs uppercase tracking-[0.25em] text-primary">Help desk</p><h1 className="mt-3 text-4xl font-black sm:text-6xl">Support</h1><p className="mt-5 max-w-2xl leading-7 text-foreground">For wallet setup, Android builds, machine API access, payments, privacy requests, advertising, partnerships, or security reports, contact BuildAWallet support.</p><div className="mt-8 grid gap-4 md:grid-cols-3"><SupportCard icon={<WalletCards />} title="Wallet help" body="Create, restore, import build backups, custom tokens, receive addresses, and mainnet send checks." /><SupportCard icon={<Mail />} title="Business & ads" body="Advertising, integrations, partnerships, billing, and account questions route through support." /><SupportCard icon={<ShieldAlert />} title="Security reports" body="Report suspected vulnerabilities without including recovery phrases, private keys, or sensitive funds data." /></div><div className="mt-8 rounded-3xl border border-border bg-surface p-6"><h2 className="wallet-heading text-xl font-bold">Contact</h2><p className="mt-2 text-sm leading-6 text-foreground">Email support@buildawallet.xyz. Include the page, device, browser or Android build version, chain, token contract, transaction hash, and screenshots if useful. Never send recovery words or private keys.</p><a href="mailto:support@buildawallet.xyz?subject=BuildAWallet%20support" className="mt-5 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:brightness-110">Email support</a></div></div></main>;
}

function SupportCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) { return <section className="rounded-3xl border border-border bg-surface p-5"><div className="text-primary [&_svg]:size-6">{icon}</div><h2 className="wallet-heading mt-4 text-lg font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-foreground">{body}</p></section>; }
