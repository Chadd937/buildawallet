import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletShell } from "@/components/wallet-shell";

export const Route = createFileRoute("/human/pay")({ component: PayPage });

function PayPage() {
  return (
    <WalletShell>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="font-mono text-[10px] uppercase text-primary">HUMAN release</p>
        <h1 className="mt-2 font-display text-5xl">There is no HUMAN payment gate.</h1>
        <p className="mt-3 text-muted-foreground">
          HUMAN wallet design and Android release are free. Paid plans apply only to the machine API and MCP services.
        </p>
        <section className="mt-8 rounded-2xl border border-border bg-card p-6">
          <p className="flex gap-2 text-sm"><CheckCircle2 className="size-5 text-primary" /> Continue directly to release.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="vault" asChild><Link to="/human/studio"><ArrowLeft /> Back to Studio</Link></Button>
            <Button variant="arcade" asChild><Link to="/human/release">Continue to free release</Link></Button>
            <Button variant="vault" asChild><a href="/pay">Machine API plans <ExternalLink /></a></Button>
          </div>
        </section>
      </main>
    </WalletShell>
  );
}
