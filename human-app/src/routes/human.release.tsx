import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { WalletShell } from "@/components/wallet-shell";

export const Route = createFileRoute("/human/release")({ component: LegacyReleaseRedirect });

function LegacyReleaseRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/human/create", replace: true });
  }, [navigate]);
  return <WalletShell><main className="grid min-h-[70vh] place-items-center"><p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Opening local wallet creation…</p></main></WalletShell>;
}
