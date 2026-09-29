import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Rocket, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletShell } from "@/components/wallet-shell";
import { useWalletDraft } from "@/hooks/use-wallet-draft";

export const Route = createFileRoute("/human/release")({ component: ReleasePage });

function ReleasePage() {
  const { draft } = useWalletDraft();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const startRelease = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/human/build", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target: "mainnet", draft }),
      });
      const build = await response.json().catch(() => ({}));
      if (!response.ok || !build.buildId)
        throw new Error(build.error || build.detail || "Android release is not configured yet.");
      window.localStorage.setItem("buildawallet-human-build-id", build.buildId);
      navigate({ to: "/human/download" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the release.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <WalletShell>
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <p className="font-mono text-[10px] uppercase text-primary">Release / {draft.name}</p>
        <h1 className="mt-2 font-display text-5xl">Release your mainnet wallet.</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          HUMAN wallet creation and release are free. BuildAWallet never charges a HUMAN-side
          subscription or payment gate to release the configured signed Android build.
        </p>
        <section className="choice-card mt-8 p-6" data-selected="true">
          <ShieldCheck className="size-8 text-accent" />
          <h2 className="mt-4 font-display text-2xl">Free mainnet release</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Your selected design is sent only as build metadata. Seed phrases and private keys are
            not part of the build request. When the signed APK release URL is configured, the build
            service returns it immediately for download.
          </p>
          <div className="mt-5 font-display text-3xl">
            $0 <span className="text-sm text-muted-foreground">HUMAN release</span>
          </div>
        </section>
        {error && (
          <p className="mt-5 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="vault" asChild>
            <Link to="/human/studio">
              <ArrowLeft /> Back to Studio
            </Link>
          </Button>
          <Button variant="arcade" size="lg" onClick={startRelease} disabled={busy}>
            <Rocket />
            {busy ? "Preparing release…" : "Release free Android build"}
          </Button>
        </div>
      </main>
    </WalletShell>
  );
}
