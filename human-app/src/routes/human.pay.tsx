import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletShell } from "@/components/wallet-shell";

export const Route = createFileRoute("/human/pay")({ component: PayPage });

type Invoice = { invoiceId: string; amount?: string; asset?: string; network?: string; address?: string; status?: string };

function PayPage() {
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [message, setMessage] = useState("Creating your crypto subscription invoice…");

  useEffect(() => {
    fetch("/api/human/subscription/invoice", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: "human-mainnet-monthly" }) })
      .then(async r => { const d = await r.json().catch(()=>({})); if (!r.ok) throw new Error(d.error || "Crypto subscription service is not configured yet."); setInvoice(d); setMessage("Send the exact amount, then confirm below."); })
      .catch(e => setMessage(e.message));
  }, []);

  const check = async () => {
    if (!invoice) return;
    setMessage("Checking the blockchain payment…");
    const r = await fetch(`/api/human/subscription/invoice/${encodeURIComponent(invoice.invoiceId)}`, { credentials: "include", cache: "no-store" });
    const d = await r.json().catch(()=>({}));
    if (r.ok && (d.status === "paid" || d.mainnet === true)) { setMessage("Payment confirmed. Mainnet is unlocked."); window.setTimeout(() => navigate({ to: "/human/release" }), 700); }
    else setMessage(d.message || "Payment has not been confirmed yet.");
  };

  return <WalletShell><main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
    <p className="font-mono text-[10px] uppercase text-primary">Mainnet subscription</p><h1 className="mt-2 font-display text-5xl">Unlock mainnet for $1.99/month.</h1><p className="mt-3 text-muted-foreground">Crypto only. Your entitlement is activated only after the backend confirms payment.</p>
    <section className="mt-8 rounded-2xl border border-border bg-card p-6">
      {invoice ? <><div className="grid gap-4 sm:grid-cols-2"><div><span className="font-mono text-[9px] text-muted-foreground">AMOUNT</span><div className="font-display text-2xl">{invoice.amount || "$1.99"} {invoice.asset || "USDC"}</div></div><div><span className="font-mono text-[9px] text-muted-foreground">NETWORK</span><div className="font-display text-2xl">{invoice.network || "Configured network"}</div></div></div><div className="mt-5 rounded-lg bg-secondary p-4"><span className="font-mono text-[9px] text-muted-foreground">PAYMENT ADDRESS</span><div className="mt-1 break-all font-mono text-xs">{invoice.address || "Provided by payment service"}</div>{invoice.address && <Button className="mt-3" variant="vault" onClick={() => navigator.clipboard.writeText(invoice.address!)}><Copy/> Copy address</Button>}</div></> : <div className="text-sm text-muted-foreground">Invoice unavailable.</div>}
      <p className="mt-5 text-sm">{message}</p>
      <div className="mt-5 flex gap-3"><Button variant="vault" asChild><Link to="/human/release"><ArrowLeft/> Back</Link></Button><Button variant="arcade" onClick={check} disabled={!invoice}><RefreshCw/> Check payment</Button></div>
    </section>
    <p className="mt-4 flex gap-2 text-xs text-muted-foreground"><CheckCircle2 className="size-4 text-primary"/>No card processor is used by this screen.</p>
  </main></WalletShell>;
}
