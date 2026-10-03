import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Copy, ExternalLink, KeyRound, LogOut, RefreshCw, Send, ShieldCheck, Trash2, WalletCards } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { WalletShell } from "@/components/wallet-shell";
import { useWalletDraft } from "@/hooks/use-wallet-draft";
import {
  browserChains,
  clearBrowserWallet,
  estimateNativeTransfer,
  exportRecoveryPhrase,
  getBrowserWalletMeta,
  getNativeBalance,
  sendNativeTransfer,
  type BrowserWalletMeta,
} from "@/lib/browser-wallet";

export const Route = createFileRoute("/human/wallet")({
  head: () => ({ meta: [
    { title: "Desktop Web3 Wallet | BuildAWallet" },
    { name: "description", content: "Use your self-custody BuildAWallet web3 wallet in the browser with local signing, live balances, receive and native transfers." },
    { property: "og:title", content: "Desktop Web3 Wallet | BuildAWallet" },
    { property: "og:description", content: "A browser-based self-custody wallet customized in BuildAWallet Studio." },
    { property: "og:type", content: "website" },
  ] }),
  component: DesktopWallet,
});

type Tab = "overview" | "send" | "receive" | "settings";

type Review = {
  to: string;
  amount: string;
  estimatedFee: string;
  symbol: string;
};

function shortAddress(address: string) {
  return address.length > 16 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

function DesktopWallet() {
  const { draft } = useWalletDraft();
  const navigate = useNavigate();
  const [meta, setMeta] = useState<BrowserWalletMeta | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const supportedChains = useMemo(() => {
    const chosen = draft.chains.filter((chain) => Boolean(browserChains[chain]));
    return chosen.length ? chosen : ["Ethereum"];
  }, [draft.chains]);
  const [chain, setChain] = useState(supportedChains[0] ?? "Ethereum");
  const [tab, setTab] = useState<Tab>("overview");
  const [balance, setBalance] = useState("0");
  const [balanceBusy, setBalanceBusy] = useState(false);
  const [error, setError] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [password, setPassword] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [sendBusy, setSendBusy] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [txUrl, setTxUrl] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryPhrase, setRecoveryPhrase] = useState("");

  const config = browserChains[chain] ?? browserChains.Ethereum;

  useEffect(() => {
    getBrowserWalletMeta()
      .then(setMeta)
      .catch(() => setMeta(null))
      .finally(() => setLoadingMeta(false));
  }, []);

  useEffect(() => {
    if (!supportedChains.includes(chain)) setChain(supportedChains[0] ?? "Ethereum");
  }, [chain, supportedChains]);

  const refreshBalance = async () => {
    if (!meta) return;
    setBalanceBusy(true);
    setError("");
    try {
      const value = await getNativeBalance(chain, meta.address);
      setBalance(Number(value).toLocaleString(undefined, { maximumFractionDigits: 6 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the live balance.");
    } finally {
      setBalanceBusy(false);
    }
  };

  useEffect(() => {
    if (meta) void refreshBalance();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, chain]);

  const copyAddress = async () => {
    if (meta) await navigator.clipboard.writeText(meta.address);
  };

  const prepareSend = async () => {
    if (!meta) return;
    setError("");
    setTxHash("");
    try {
      const estimate = await estimateNativeTransfer(chain, meta.address, to.trim(), amount.trim());
      setReview({ to: to.trim(), amount: amount.trim(), estimatedFee: estimate.estimatedFee, symbol: estimate.symbol });
    } catch (e) {
      setReview(null);
      setError(e instanceof Error ? e.message : "Could not prepare the transfer.");
    }
  };

  const confirmSend = async () => {
    if (!review) return;
    if (!password) { setError("Enter your local wallet password to sign."); return; }
    setSendBusy(true);
    setError("");
    try {
      const sent = await sendNativeTransfer(chain, password, review.to, review.amount);
      setTxHash(sent.hash);
      setTxUrl(sent.explorer);
      setPassword("");
      setReview(null);
      setAmount("");
      setTo("");
      await refreshBalance();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign and broadcast the transfer.");
    } finally {
      setSendBusy(false);
    }
  };

  const revealRecovery = async () => {
    setError("");
    try {
      if (!recoveryPassword) throw new Error("Enter your wallet password first.");
      setRecoveryPhrase(await exportRecoveryPhrase(recoveryPassword));
      setRecoveryPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unlock the recovery phrase.");
    }
  };

  const eraseWallet = async () => {
    if (!window.confirm("Erase the encrypted browser wallet from this device? Make sure your recovery phrase is backed up first.")) return;
    await clearBrowserWallet();
    void navigate({ to: "/human/create" });
  };

  if (loadingMeta) return <WalletShell><main className="grid min-h-[70vh] place-items-center"><p className="font-mono text-xs uppercase text-muted-foreground">Opening local wallet…</p></main></WalletShell>;

  if (!meta) return <WalletShell><main className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6"><WalletCards className="mx-auto size-12 text-primary" /><h1 className="mt-4 font-display text-4xl">No local wallet on this device.</h1><p className="mt-3 text-muted-foreground">Your Studio design is still here. Create or restore the self-custody wallet locally to use it.</p><Button variant="arcade" size="xl" className="mt-7" asChild><Link to="/human/create">Create or restore wallet</Link></Button></main></WalletShell>;

  return <WalletShell><main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
    <section className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <aside className="rounded-2xl border border-border bg-card p-4 lg:sticky lg:top-4 lg:h-fit">
        <div className="flex items-center gap-3 border-b border-border pb-4"><span className="grid size-11 place-items-center rounded-xl bg-primary font-display text-lg text-primary-foreground">{draft.name[0] || "W"}</span><div className="min-w-0"><strong className="block truncate font-display">{draft.name}</strong><button onClick={copyAddress} className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground">{shortAddress(meta.address)} <Copy className="size-3" /></button></div></div>
        <nav className="mt-4 grid gap-1">
          {([[
            "overview", "Overview", WalletCards,
          ], ["send", "Send", ArrowUpRight], ["receive", "Receive", ArrowDownLeft], ["settings", "Security", ShieldCheck]] as const).map(([id, label, Icon]) => <button key={id} onClick={() => { setTab(id); setError(""); }} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm ${tab === id ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}><Icon className="size-4" />{label}</button>)}
        </nav>
        <Button variant="vault" size="sm" className="mt-5 w-full" asChild><Link to="/human/studio">Edit design</Link></Button>
      </aside>

      <div className="min-w-0">
        <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6">
          <div className="absolute -right-12 -top-12 size-56 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div><p className="font-mono text-[10px] uppercase text-primary">Desktop Web3 wallet · local signing</p><h1 className="mt-1 font-display text-4xl sm:text-5xl">{draft.name}</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Your private key stays encrypted in this browser. BuildAWallet only sees public RPC requests and already-signed transactions.</p></div>
            <label className="min-w-44"><span className="font-mono text-[9px] uppercase text-muted-foreground">Network</span><select value={chain} onChange={(e) => { setChain(e.target.value); setReview(null); }} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary">{supportedChains.map((name) => <option key={name}>{name}</option>)}</select></label>
          </div>
        </section>

        {error && <p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {txHash && <p className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm">Broadcast successful: <a href={txUrl} target="_blank" rel="noreferrer" className="break-all font-mono text-primary hover:underline">{txHash} <ExternalLink className="inline size-3" /></a></p>}

        {tab === "overview" && <div className="mt-5 grid gap-4 xl:grid-cols-[1.3fr_.7fr]">
          <section className="rounded-2xl bg-primary p-7 text-primary-foreground shadow-2xl shadow-primary/10"><div className="flex items-center justify-between"><span className="font-mono text-[10px] uppercase opacity-75">Live {config.symbol} balance</span><button onClick={refreshBalance} disabled={balanceBusy} aria-label="Refresh balance"><RefreshCw className={`size-4 ${balanceBusy ? "animate-spin" : ""}`} /></button></div><div className="mt-3 font-display text-5xl">{balance} <span className="text-xl">{config.symbol}</span></div><p className="mt-4 text-sm opacity-80">{config.name} · chain ID {config.chainId}</p></section>
          <section className="rounded-2xl border border-border bg-card p-6"><h2 className="font-display text-xl">Quick actions</h2><div className="mt-4 grid grid-cols-2 gap-3"><Button variant="arcade" onClick={() => setTab("send")}><Send /> Send</Button><Button variant="vault" onClick={() => setTab("receive")}><ArrowDownLeft /> Receive</Button></div><p className="mt-5 text-xs text-muted-foreground">Native-asset transfers are live now. Token and NFT adapters can be layered onto this same local-signing vault without moving keys server-side.</p></section>
          <section className="rounded-2xl border border-border bg-card p-6 xl:col-span-2"><h2 className="font-display text-xl">Your selected networks</h2><div className="mt-4 flex flex-wrap gap-2">{supportedChains.map((name) => <button key={name} onClick={() => setChain(name)} className={`rounded-full border px-3 py-2 text-xs ${chain === name ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{name}</button>)}</div></section>
        </div>}

        {tab === "send" && <section className="mt-5 rounded-2xl border border-border bg-card p-6"><h2 className="font-display text-2xl">Send {config.symbol}</h2><p className="mt-1 text-sm text-muted-foreground">Prepare the transfer, review the destination and estimated network fee, then unlock locally to sign.</p><div className="mt-6 grid gap-4"><label><span className="font-display text-sm">Destination</span><input value={to} onChange={(e) => { setTo(e.target.value); setReview(null); }} placeholder="0x…" className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-4 font-mono text-sm outline-none focus:border-primary" /></label><label><span className="font-display text-sm">Amount ({config.symbol})</span><input value={amount} onChange={(e) => { setAmount(e.target.value); setReview(null); }} inputMode="decimal" placeholder="0.00" className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none focus:border-primary" /></label></div>{!review ? <Button variant="arcade" size="lg" className="mt-5" onClick={prepareSend}>Review transfer</Button> : <div className="mt-6 rounded-2xl border-2 border-primary bg-background p-5"><p className="font-mono text-[10px] uppercase text-primary">Review before signing</p><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-muted-foreground">Network</dt><dd className="font-display">{config.name}</dd></div><div><dt className="text-muted-foreground">Destination</dt><dd className="break-all font-mono">{review.to}</dd></div><div><dt className="text-muted-foreground">Amount</dt><dd className="font-display">{review.amount} {review.symbol}</dd></div><div><dt className="text-muted-foreground">Estimated network fee</dt><dd className="font-display">≈ {Number(review.estimatedFee).toLocaleString(undefined, { maximumFractionDigits: 8 })} {review.symbol}</dd></div></dl><label className="mt-5 block"><span className="font-display text-sm">Wallet password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="mt-2 h-12 w-full rounded-xl border border-input bg-card px-4 outline-none focus:border-primary" /></label><div className="mt-4 flex flex-wrap gap-3"><Button variant="arcade" disabled={sendBusy} onClick={confirmSend}><ShieldCheck /> {sendBusy ? "Signing locally…" : "Sign & broadcast"}</Button><Button variant="vault" onClick={() => setReview(null)}>Edit transfer</Button></div></div>}</section>}

        {tab === "receive" && <section className="mt-5 rounded-2xl border border-border bg-card p-6 text-center"><h2 className="font-display text-2xl">Receive on {config.name}</h2><p className="mt-2 text-sm text-muted-foreground">This EVM address is shared across the supported networks selected for this wallet.</p><div className="mx-auto mt-6 w-fit rounded-2xl bg-white p-4"><QRCodeSVG value={meta.address} size={220} /></div><p className="mx-auto mt-5 max-w-xl break-all rounded-xl bg-background p-4 font-mono text-sm">{meta.address}</p><Button variant="vault" className="mt-4" onClick={copyAddress}><Copy /> Copy address</Button></section>}

        {tab === "settings" && <div className="mt-5 grid gap-4 xl:grid-cols-2"><section className="rounded-2xl border border-border bg-card p-6"><KeyRound className="size-6 text-accent" /><h2 className="mt-3 font-display text-xl">Recovery backup</h2><p className="mt-2 text-sm text-muted-foreground">Reveal the recovery phrase only when you are somewhere private. It is decrypted locally.</p>{recoveryPhrase ? <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-background p-4 sm:grid-cols-3">{recoveryPhrase.split(" ").map((word, index) => <span key={`${word}-${index}`} className="font-mono text-xs"><b className="mr-1 text-muted-foreground">{index + 1}.</b>{word}</span>)}</div> : <><input type="password" value={recoveryPassword} onChange={(e) => setRecoveryPassword(e.target.value)} placeholder="Wallet password" className="mt-4 h-12 w-full rounded-xl border border-input bg-background px-4 outline-none focus:border-primary" /><Button variant="vault" className="mt-3" onClick={revealRecovery}><KeyRound /> Reveal locally</Button></>}</section><section className="rounded-2xl border border-destructive/30 bg-card p-6"><Trash2 className="size-6 text-destructive" /><h2 className="mt-3 font-display text-xl">Erase local wallet</h2><p className="mt-2 text-sm text-muted-foreground">Deletes the encrypted vault from this browser only. Your BuildAWallet account and Studio design remain.</p><Button variant="vault" className="mt-4 border-destructive/40 text-destructive" onClick={eraseWallet}><Trash2 /> Erase from this device</Button></section></div>}
      </div>
    </section>
  </main></WalletShell>;
}
