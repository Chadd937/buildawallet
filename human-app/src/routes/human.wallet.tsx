import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useDraft } from "@/hooks/use-draft";
import { skinVars } from "@/components/human/phone-preview";
import { Onboarding, UnlockScreen } from "@/components/wallet/onboarding";
import { Dashboard } from "@/components/wallet/dashboard";
import { eraseVault, getVaultMeta, isDeviceVault, unlockVault, type VaultMeta } from "@/lib/wallet/vault";

export const Route = createFileRoute("/human/wallet")({
  head: () => ({
    meta: [
      { title: "Your wallet ,  BuildAWallet" },
      { name: "description", content: "Self-custody multichain wallet: Ethereum, Base, Arbitrum, Optimism, Polygon, BNB, Avalanche, Solana, Bitcoin and Tron." },
      { property: "og:title", content: "Your wallet ,  BuildAWallet" },
      { property: "og:description", content: "Your own self-custody multichain wallet, running in your browser." },
      { name: "robots", content: "noindex" },
    ],
  }),
  ssr: false,
  component: WalletPage,
});

function WalletPage() {
  const { draft, ready, update } = useDraft();
  const [meta, setMeta] = useState<VaultMeta | null | undefined>(undefined);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [forcing, setForcing] = useState(false);

  useEffect(() => {
    (async () => {
      const m = await getVaultMeta();
      if (m && (await isDeviceVault())) setPhrase(await unlockVault());
      setMeta(m);
    })().catch(() => setMeta(null));
  }, []);
  const lock = useCallback(() => setPhrase(null), []);

  if (!ready || meta === undefined) {
    return <div className="grid min-h-screen place-items-center"><Loader2 className="size-8 animate-spin text-primary" /></div>;
  }

  return (
    <div style={skinVars(draft.skin)} className="studio-background skin-foreground min-h-screen">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 pt-5">
        <a href="/human/studio" className="font-display text-sm font-bold">BUILD<span className="skin-accent-text">A</span>WALLET</a>
        <span className="rounded-full border px-3 py-1 text-xs skin-border text-foreground">Mainnet · self-custody</span>
      </header>
      {phrase ? (
        <Dashboard draft={draft} phrase={phrase} onLock={lock} onErased={() => { setPhrase(null); setMeta(null); }} />
      ) : meta && !forcing ? (
        <UnlockScreen name={meta.walletName || draft.name} avatar={draft.avatar} onUnlock={setPhrase}
          onForget={async () => { if (confirm("Remove the encrypted wallet from this browser and restore from your phrase?")) { await eraseVault(); setMeta(null); setForcing(true); } }} />
      ) : (
        <Onboarding draft={forcing ? { ...draft, custody: "restore" } : draft} onImportBuild={(d) => update(d)} onReady={async (p) => { setMeta(await getVaultMeta()); setForcing(false); setPhrase(p); }} />
      )}
    </div>
  );
}
