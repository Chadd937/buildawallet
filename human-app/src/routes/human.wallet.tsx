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
      { title: "Your wallet — BuildAWallet" },
      { name: "description", content: "Self-custody multichain wallet: Ethereum, Base, Arbitrum, Optimism, Polygon, BNB, Avalanche, Solana, Bitcoin and Tron." },
      { property: "og:title", content: "Your wallet — BuildAWallet" },
      { property: "og:description", content: "Your own self-custody multichain wallet, running in your browser." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
    <div style={skinVars(draft.skin)} className="human-product wallet-app studio-background skin-foreground min-h-screen bg-background/45">
      <header className="border-b skin-border skin-surface">
        <div className="mx-auto grid max-w-[1500px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <a href="/human/studio" className="shrink-0 font-display text-sm font-bold">BUILD<span className="skin-accent-text">A</span>WALLET</a>
            <span className="hidden h-5 w-px skin-surface sm:block" />
            <p className="truncate text-xs skin-muted">{draft.avatar} {draft.name}</p>
          </div>
          <span className="flex shrink-0 items-center gap-2 text-xs font-semibold"><span className="size-2 rounded-full bg-success" />Mainnet · local signing</span>
        </div>
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
