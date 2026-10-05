import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useDraft } from "@/hooks/use-draft";
import { skinVars } from "@/components/human/phone-preview";
import { Onboarding, UnlockScreen } from "@/components/wallet/onboarding";
import { Dashboard } from "@/components/wallet/dashboard";
import { eraseVault, getVaultMeta, isDeviceVault, unlockVault, type VaultMeta } from "@/lib/wallet/vault";
import "@/styles/wallet-premium.css";

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

  if (!phrase) {
    return (
      <div style={skinVars(draft.skin)} className="studio-background skin-foreground min-h-screen">
        <header className="mx-auto flex max-w-7xl items-center justify-between px-4 pt-5">
          <a href="/human/studio" className="font-display text-sm font-bold">BUILD<span className="skin-accent-text">A</span>WALLET</a>
          <span className="rounded-full border px-3 py-1 text-xs skin-border text-foreground">Mainnet · self-custody</span>
        </header>
        {meta && !forcing ? (
          <UnlockScreen name={meta.walletName || draft.name} avatar={draft.avatar} onUnlock={setPhrase}
            onForget={async () => { if (confirm("Remove the encrypted wallet from this browser and restore from your phrase?")) { await eraseVault(); setMeta(null); setForcing(true); } }} />
        ) : (
          <Onboarding draft={forcing ? { ...draft, custody: "restore" } : draft} onImportBuild={(d) => update(d)} onReady={async (p) => { setMeta(await getVaultMeta()); setForcing(false); setPhrase(p); }} />
        )}
      </div>
    );
  }

  return (
    <div style={skinVars(draft.skin)} className="wallet-premium-shell min-h-screen skin-foreground">
      <header className="wallet-premium-topbar">
        <div className="wallet-premium-brand">
          <a href="/" aria-label="BuildAWallet home" className="wallet-premium-mark">B</a>
          <div>
            <a href="/human/wallet" className="wallet-premium-brandname">BuildAWallet</a>
            <span className="wallet-premium-product">Web3 Wallet</span>
          </div>
        </div>

        <div className="wallet-premium-account">
          <span className="wallet-premium-avatar" aria-hidden="true">{draft.avatar}</span>
          <div className="min-w-0">
            <strong className="block truncate text-sm">{draft.name || "My Wallet"}</strong>
            <span className="wallet-premium-subtle">Mainnet portfolio</span>
          </div>
        </div>

        <div className="wallet-premium-topactions">
          <span className="wallet-premium-security"><ShieldCheck className="size-4" /> Keys stay local</span>
          <a href="/human/studio" className="wallet-premium-customize"><SlidersHorizontal className="size-4" /> Customize</a>
        </div>
      </header>

      <div className="wallet-premium-stage">
        <Dashboard draft={draft} phrase={phrase} onLock={lock} onErased={() => { setPhrase(null); setMeta(null); }} />
      </div>
    </div>
  );
}
