import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, FlaskConical, Rocket, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletShell } from "@/components/wallet-shell";
import { useWalletDraft } from "@/hooks/use-wallet-draft";

export const Route = createFileRoute("/human/release")({ component: ReleasePage });

type Target = "testnet" | "mainnet";

function ReleasePage() {
  const { draft } = useWalletDraft();
  const navigate = useNavigate();
  const [target, setTarget] = useState<Target>("testnet");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const startRelease = async () => {
    setBusy(true); setError("");
    try {
      if (target === "mainnet") {
        const ent = await fetch("/api/human/entitlement", { credentials: "include", cache: "no-store" });
        const data = await ent.json().catch(() => ({}));
        if (!ent.ok || !data.mainnet) {
          window.localStorage.setItem("buildawallet-human-release-target", target);
          navigate({ to: "/human/pay" });
          return;
        }
      }
      const response = await fetch("/api/human/build", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ target, draft })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.buildId) throw new Error(data.error || "Android build service is not configured yet.");
      window.localStorage.setItem("buildawallet-human-build-id", data.buildId);
      navigate({ to: "/human/download" });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start the build."); }
    finally { setBusy(false); }
  };

  return <WalletShell><main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
    <p className="font-mono text-[10px] uppercase text-primary">Release / {draft.name}</p>
    <h1 className="mt-2 font-display text-5xl">Choose where this wallet ships.</h1>
    <p className="mt-3 max-w-2xl text-muted-foreground">Your design is ready. Testnet packaging is free. Mainnet packaging requires an active BuildAWallet HUMAN subscription.</p>
    <div className="mt-8 grid gap-4 md:grid-cols-2">
      <button onClick={() => setTarget("testnet")} data-selected={target === "testnet"} className="choice-card p-6 text-left"><FlaskConical className="size-8 text-primary"/><h2 className="mt-4 font-display text-2xl">Testnet</h2><p className="mt-2 text-sm text-muted-foreground">Free Android build for testing and development networks.</p><div className="mt-5 font-display text-3xl">$0</div>{target === "testnet" && <CheckCircle2 className="mt-4 text-primary"/>}</button>
      <button onClick={() => setTarget("mainnet")} data-selected={target === "mainnet"} className="choice-card p-6 text-left"><ShieldCheck className="size-8 text-accent"/><h2 className="mt-4 font-display text-2xl">Mainnet</h2><p className="mt-2 text-sm text-muted-foreground">Production release path with entitlement verification and real-network configuration.</p><div className="mt-5 font-display text-3xl">$1.99 <span className="text-sm text-muted-foreground">/ month</span></div>{target === "mainnet" && <CheckCircle2 className="mt-4 text-accent"/>}</button>
    </div>
    {error && <p className="mt-5 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <div className="mt-8 flex flex-wrap gap-3"><Button variant="vault" asChild><Link to="/human/studio"><ArrowLeft/> Back to Studio</Link></Button><Button variant="arcade" size="lg" onClick={startRelease} disabled={busy}><Rocket/>{busy ? "Starting build…" : target === "mainnet" ? "Verify & release mainnet" : "Build testnet APK"}</Button></div>
  </main></WalletShell>;
}
