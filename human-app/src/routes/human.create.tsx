import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletShell } from "@/components/wallet-shell";
import { useWalletDraft } from "@/hooks/use-wallet-draft";
import {
  createBrowserWallet,
  getBrowserWalletMeta,
  restoreBrowserWallet,
  type BrowserWalletMeta,
} from "@/lib/browser-wallet";

export const Route = createFileRoute("/human/create")({
  head: () => ({ meta: [
    { title: "Create Your Web3 Wallet | BuildAWallet" },
    { name: "description", content: "Create or restore a self-custody browser wallet locally after customizing it in BuildAWallet Studio." },
    { property: "og:title", content: "Create Your Web3 Wallet | BuildAWallet" },
    { property: "og:description", content: "Create or restore a self-custody browser wallet. Recovery phrases and private keys stay on your device." },
    { property: "og:type", content: "website" },
  ] }),
  component: CreateWalletPage,
});

type Mode = "create" | "restore";

function CreateWalletPage() {
  const { draft } = useWalletDraft();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("create");
  const [existing, setExisting] = useState<BrowserWalletMeta | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [restorePhrase, setRestorePhrase] = useState("");
  const [createdPhrase, setCreatedPhrase] = useState("");
  const [createdAddress, setCreatedAddress] = useState("");
  const [backedUp, setBackedUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getBrowserWalletMeta().then(setExisting).catch(() => setExisting(null));
  }, []);

  const validatePassword = () => {
    if (password.length < 10) throw new Error("Use a wallet password with at least 10 characters.");
    if (password !== confirmPassword) throw new Error("Wallet passwords do not match.");
  };

  const confirmReplacement = () => !existing || window.confirm("This browser already has a BuildAWallet vault. Replace the local vault on this device?");

  const createWallet = async () => {
    setError("");
    try {
      validatePassword();
      if (!confirmReplacement()) return;
      setBusy(true);
      const result = await createBrowserWallet(password);
      setCreatedPhrase(result.phrase);
      setCreatedAddress(result.address);
      setExisting({ address: result.address, createdAt: Date.now(), version: 1 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the local wallet.");
    } finally {
      setBusy(false);
    }
  };

  const restoreWallet = async () => {
    setError("");
    try {
      validatePassword();
      if (!restorePhrase.trim()) throw new Error("Enter your recovery phrase.");
      if (!confirmReplacement()) return;
      setBusy(true);
      await restoreBrowserWallet(restorePhrase, password);
      void navigate({ to: "/human/wallet" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore the local wallet.");
    } finally {
      setBusy(false);
    }
  };

  if (createdPhrase) {
    const words = createdPhrase.split(" ");
    return <WalletShell><main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="font-mono text-[10px] uppercase text-primary">Local wallet created</p>
      <h1 className="mt-2 font-display text-5xl">Back up your recovery phrase.</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">Write these words down in order and keep them offline. BuildAWallet cannot recover them for you and they are not uploaded to your account.</p>
      <div className="mt-8 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-5 sm:grid-cols-3">
        {words.map((word, index) => <div key={`${word}-${index}`} className="rounded-lg bg-background p-3 font-mono text-sm"><span className="mr-2 text-muted-foreground">{index + 1}.</span>{word}</div>)}
      </div>
      <p className="mt-4 break-all rounded-lg bg-secondary p-3 font-mono text-xs text-muted-foreground">Address: {createdAddress}</p>
      <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm">
        <input type="checkbox" className="mt-1" checked={backedUp} onChange={(e) => setBackedUp(e.target.checked)} />
        <span><strong className="block font-display">I saved the recovery phrase offline.</strong><span className="text-muted-foreground">Anyone with these words can control the wallet.</span></span>
      </label>
      <Button variant="arcade" size="xl" className="mt-6 w-full" disabled={!backedUp} onClick={() => navigate({ to: "/human/wallet" })}><CheckCircle2 /> Open {draft.name}</Button>
    </main></WalletShell>;
  }

  return <WalletShell><main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
    <p className="font-mono text-[10px] uppercase text-primary">Create / {draft.name}</p>
    <h1 className="mt-2 font-display text-5xl">Make the design a real web3 wallet.</h1>
    <p className="mt-3 max-w-3xl text-muted-foreground">The wallet is created or restored in this browser. Your BuildAWallet login stores the builder experience—not your recovery phrase, private key, or wallet password.</p>

    {existing && <section className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-5">
      <div><p className="font-display text-lg">A local wallet already exists on this device.</p><p className="mt-1 break-all font-mono text-xs text-muted-foreground">{existing.address}</p></div>
      <Button variant="arcade" onClick={() => navigate({ to: "/human/wallet" })}>Open wallet</Button>
    </section>}

    <div className="mt-8 grid gap-4 md:grid-cols-2">
      <button className="choice-card p-5 text-left" data-selected={mode === "create"} onClick={() => { setMode("create"); setError(""); }}>
        <Sparkles className="size-7 text-accent" /><strong className="mt-3 block font-display text-xl">Create new wallet</strong><span className="text-sm text-muted-foreground">Generate a new 12-word recovery phrase locally in this browser.</span>
      </button>
      <button className="choice-card p-5 text-left" data-selected={mode === "restore"} onClick={() => { setMode("restore"); setError(""); }}>
        <KeyRound className="size-7 text-primary" /><strong className="mt-3 block font-display text-xl">Restore existing wallet</strong><span className="text-sm text-muted-foreground">Use an existing BIP-39 recovery phrase without sending it to BuildAWallet.</span>
      </button>
    </div>

    <section className="mt-6 rounded-2xl border border-border bg-card p-6">
      {mode === "restore" && <label className="block"><span className="font-display text-sm">Recovery phrase</span><textarea value={restorePhrase} onChange={(e) => setRestorePhrase(e.target.value)} rows={4} autoComplete="off" spellCheck={false} placeholder="Enter your recovery words in order" className="mt-2 w-full rounded-xl border border-input bg-background p-4 font-mono text-sm outline-none focus:border-primary" /></label>}
      <div className={`grid gap-4 ${mode === "restore" ? "mt-5" : ""} sm:grid-cols-2`}>
        <label><span className="font-display text-sm">Wallet password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-4 outline-none focus:border-primary" /></label>
        <label><span className="font-display text-sm">Confirm password</span><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-4 outline-none focus:border-primary" /></label>
      </div>
      <p className="mt-4 flex items-start gap-2 rounded-lg bg-secondary p-3 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /> The recovery phrase is encrypted locally with AES-GCM using a password-derived key and stored in this browser's IndexedDB. Signing happens locally after you unlock it.</p>
      {error && <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <Button variant="arcade" size="xl" className="mt-5 w-full" disabled={busy} onClick={mode === "create" ? createWallet : restoreWallet}>{mode === "create" ? <Sparkles /> : <KeyRound />}{busy ? "Working locally…" : mode === "create" ? "Create wallet on this device" : "Restore wallet on this device"}</Button>
    </section>

    <Button variant="vault" asChild className="mt-6"><Link to="/human/studio"><ArrowLeft /> Back to Studio</Link></Button>
  </main></WalletShell>;
}
