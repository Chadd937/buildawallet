import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import {
  Activity as ActivityIcon, ArrowDownLeft, ArrowUpRight, BookUser, Copy, Download, ExternalLink, Eye, EyeOff,
  Coins, Gauge, Loader2, Lock, Plus, Printer, RefreshCw, Settings, Trash2, Wallet as WalletIcon, Radar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { has, type Draft } from "@/lib/catalog";
import { CHAINS, chainById, type ChainDef, type TokenDef } from "@/lib/wallet/chains";
import { deriveAccounts, publicAddresses, type DerivedAccounts } from "@/lib/wallet/derive";
import { addressFor, estimateFee, fetchHoldings, fetchPrices, fetchTokenMetadata, send, validateRecipient, validateTokenAddress, type Holding } from "@/lib/wallet/ops";
import { downloadCsv, store, withCustomTokens, type Contact, type CustomToken, type Watch } from "@/lib/wallet/local";
import { eraseVault, isDeviceVault, unlockVault } from "@/lib/wallet/vault";

type Tab = "portfolio" | "send" | "receive" | "tokens" | "activity" | "contacts" | "watch" | "network" | "settings";

const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const priceId = (h: Holding, c: ChainDef) =>
  h.token ? ({ USDC: "usd-coin", USDT: "tether", DAI: "dai" } as Record<string, string>)[h.symbol] ?? "" : c.coingeckoId;

export function Dashboard({ draft, phrase, onLock, onErased }: { draft: Draft; phrase: string; onLock: () => void; onErased: () => void }) {
  const accounts = useMemo<DerivedAccounts>(() => deriveAccounts(phrase), [phrase]);
  const addrs = useMemo(() => publicAddresses(accounts), [accounts]);
  const [customTokens, setCustomTokens] = useState<CustomToken[]>(() => store.customTokens());
  const chains = useMemo(() => (draft.chains.map(chainById).filter(Boolean) as ChainDef[]).map((chain) => withCustomTokens(chain, customTokens)), [draft.chains, customTokens]);
  const [tab, setTab] = useState<Tab>("portfolio");
  const [hidden, setHidden] = useState(false);
  const spent = useRef(0);
  const qc = useQueryClient();

  // Auto-lock: wipe keys from memory after inactivity.
  useEffect(() => {
    if (!has(draft, "autolock")) return;
    let t = window.setTimeout(onLock, draft.autoLockMin * 60_000);
    const reset = () => { window.clearTimeout(t); t = window.setTimeout(onLock, draft.autoLockMin * 60_000); };
    const evs = ["mousemove", "keydown", "click", "touchstart"];
    evs.forEach((e) => window.addEventListener(e, reset));
    return () => { window.clearTimeout(t); evs.forEach((e) => window.removeEventListener(e, reset)); };
  }, [draft, onLock]);

  const holdingQs = useQueries({
    queries: chains.map((c) => ({
      queryKey: ["holdings", c.id, addressFor(c, addrs)],
      queryFn: () => fetchHoldings(c, addrs),
      refetchInterval: 45_000,
      retry: 1,
    })),
  });
  const prices = useQuery({
    queryKey: ["prices", draft.currency, chains.map((c) => c.coingeckoId).join()],
    queryFn: () => fetchPrices([...chains.map((c) => c.coingeckoId), "usd-coin", "tether", "dai"], draft.currency),
    enabled: has(draft, "prices"),
    refetchInterval: 60_000,
  });
  const usdPrices = useQuery({
    queryKey: ["prices", "usd", chains.map((c) => c.coingeckoId).join()],
    queryFn: () => fetchPrices(chains.map((c) => c.coingeckoId), "usd"),
    refetchInterval: 120_000,
  });

  const showStables = has(draft, "stables");
  const rows = chains.flatMap((c, i) => {
    const hs = holdingQs[i]?.data ?? [];
    return hs.filter((h) => !h.token || showStables || h.token.custom).map((h) => {
      const id = priceId(h, c);
      const price = id ? prices.data?.[id] : undefined;
      return { chain: c, h, fiat: price != null ? price * Number(h.amount) : null };
    });
  });
  const total = rows.reduce((s, r) => s + (r.fiat ?? 0), 0);
  const valuationReady = holdingQs.every((q) => q.isSuccess && !q.isError) && prices.isSuccess && !prices.isError && rows.every((r) => r.fiat != null);
  const fmtFiat = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: draft.currency.toUpperCase(), maximumFractionDigits: 2 }).format(n);
  const blur = hidden ? "blur-md select-none" : "";
  const compact = has(draft, "compact");

  const tabs: { id: Tab; label: string; icon: React.ReactNode; on: boolean }[] = [
    { id: "portfolio", label: "Portfolio", icon: <WalletIcon />, on: true },
    { id: "send", label: "Send", icon: <ArrowUpRight />, on: true },
    { id: "receive", label: "Receive", icon: <ArrowDownLeft />, on: true },
    { id: "tokens", label: "Tokens", icon: <Coins />, on: true },
    { id: "activity", label: "Activity", icon: <ActivityIcon />, on: has(draft, "activity") },
    { id: "contacts", label: "Contacts", icon: <BookUser />, on: has(draft, "addressbook") },
    { id: "watch", label: "Watch", icon: <Eye />, on: has(draft, "watch") },
    { id: "network", label: "Network", icon: <Gauge />, on: has(draft, "gas") || has(draft, "status") },
    { id: "settings", label: "Settings", icon: <Settings />, on: true },
  ];

  return (
    <div className="mx-auto grid max-w-[1500px] gap-0 px-0 pb-20 lg:grid-cols-[220px_minmax(0,1fr)] lg:pb-0">
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center gap-1 overflow-x-auto border-t px-2 skin-border skin-surface lg:sticky lg:top-0 lg:h-[calc(100vh-53px)] lg:flex-col lg:items-stretch lg:border-r lg:border-t-0 lg:px-3 lg:py-5">
        {tabs.filter((t) => t.on).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex min-w-16 shrink-0 flex-col items-center gap-1 rounded-md px-2 py-2 text-[10px] font-semibold lg:min-w-0 lg:flex-row lg:gap-3 lg:px-3 lg:text-sm [&_svg]:size-4 ${tab === t.id ? "skin-accent" : "hover:skin-surface"}`}>
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
        <Button variant="skinGhost" onClick={onLock} className="hidden justify-start rounded-md lg:mt-auto lg:flex"><Lock />Lock wallet</Button>
      </nav>

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="mb-8 grid gap-6 border-b pb-8 skin-border sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] skin-muted">Portfolio</p>
            <p className={`num mt-2 text-4xl font-semibold tracking-tight sm:text-5xl ${blur}`}>{has(draft, "prices") ? (valuationReady ? fmtFiat(total) : "Balance unavailable") : `${rows.length} assets`}</p>
            <p className="mt-2 text-xs skin-muted">{chains.length} mainnet networks · keys stay on this device</p>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:flex">
            {has(draft, "hide") && (
              <Button variant="skinGhost" size="icon" aria-label="Toggle privacy" onClick={() => setHidden(!hidden)}>{hidden ? <Eye /> : <EyeOff />}</Button>
            )}
            <Button variant="skinGhost" size="icon" aria-label="Refresh" onClick={() => qc.invalidateQueries({ queryKey: ["holdings"] })}><RefreshCw /></Button>
            <Button variant="skinGhost" size="icon" aria-label="Add custom token" onClick={() => setTab("tokens")}><Plus /></Button>
            <Button variant="skin" className="col-span-2 rounded-md" onClick={() => setTab("send")}><ArrowUpRight />Send</Button>
            <Button variant="skinGhost" className="col-span-2 rounded-md" onClick={() => setTab("receive")}><ArrowDownLeft />Receive</Button>
          </div>
        </header>

        {tab === "portfolio" && (
          <section>
            <div className="mb-3 hidden grid-cols-[minmax(180px,1.5fr)_minmax(130px,1fr)_minmax(130px,1fr)] gap-4 border-b px-4 pb-3 text-[10px] font-bold uppercase tracking-[0.14em] skin-border skin-muted md:grid"><span>Asset / network</span><span>Balance</span><span className="text-right">Value</span></div>
            {chains.map((c, i) => {
              const q = holdingQs[i]!;
              return (
                <div key={c.id} className="border-b px-1 py-4 transition-colors skin-border hover:skin-surface sm:px-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="size-3 rounded-full" style={{ background: `oklch(0.78 0.17 ${c.hue})` }} />
                      <span className="font-semibold">{c.name}</span>
                      <a href={c.explorerAddress(addressFor(c, addrs))} target="_blank" rel="noreferrer" className="num text-xs skin-muted hover:underline">{short(addressFor(c, addrs))}</a>
                    </div>
                    {q.isLoading && <Loader2 className="size-4 animate-spin skin-muted" />}
                    {q.isError && <button className="text-xs text-destructive" onClick={() => q.refetch()}>Network error · retry</button>}
                  </div>
                   <div className={`mt-2 ${compact ? "text-sm" : ""}`}>
                    {(q.data ?? []).filter((h) => !h.token || showStables || h.token.custom).map((h) => {
                      const id = priceId(h, c);
                      const price = id ? prices.data?.[id] : undefined;
                      const fiat = price != null ? price * Number(h.amount) : null;
                      return (
                         <div key={h.token?.address ?? h.symbol} className={`grid grid-cols-[minmax(100px,1.5fr)_minmax(90px,1fr)_minmax(80px,1fr)] items-center gap-3 ${compact ? "py-1" : "py-2"}`}>
                           <span className="font-semibold">{h.symbol} <span className="block text-xs font-normal skin-muted">{h.token ? `${h.name}${h.token.custom ? " · Custom" : ""}` : "Native asset"}</span></span>
                           <span className={`num text-sm ${blur}`}>{Number(h.amount).toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                           <span className={`num text-right text-sm ${blur}`}>{has(draft, "prices") ? (fiat != null ? fmtFiat(fiat) : "Price unavailable") : "—"}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {has(draft, "csv") && (
              <Button variant="skinGhost" onClick={() => downloadCsv("holdings.csv", [["chain", "asset", "amount", `value_${draft.currency}`], ...rows.map((r) => [r.chain.name, r.h.symbol, r.h.amount, r.fiat != null ? r.fiat.toFixed(2) : ""])])}>
                <Download />Export holdings CSV
              </Button>
            )}
          </section>
        )}

        {tab === "send" && (
          <SendPanel draft={draft} chains={chains} accounts={accounts} addrs={addrs} holdings={holdingQs.map((q) => q.data ?? [])}
            usd={usdPrices.data ?? {}} spent={spent} onSent={() => { qc.invalidateQueries({ queryKey: ["holdings"] }); setTab(has(draft, "activity") ? "activity" : "portfolio"); }} />
        )}
        {tab === "receive" && <ReceivePanel draft={draft} chains={chains} addrs={addrs} />}
        {tab === "tokens" && <TokensPanel chains={chains} customTokens={customTokens} onChange={(tokens) => { store.setCustomTokens(tokens); setCustomTokens(tokens); void qc.invalidateQueries({ queryKey: ["holdings"] }); }} />}
        {tab === "activity" && <ActivityPanel draft={draft} />}
        {tab === "contacts" && <ContactsPanel chains={chains} />}
        {tab === "watch" && <WatchPanel chains={chains} />}
        {tab === "network" && <NetworkPanel draft={draft} chains={chains} />}
        {tab === "settings" && <SettingsPanel draft={draft} onErased={onErased} />}
      </main>
    </div>
  );
}

/* ---------------- SEND ---------------- */
function SendPanel({ draft, chains, accounts, addrs, holdings, usd, spent, onSent }: {
  draft: Draft; chains: ChainDef[]; accounts: DerivedAccounts; addrs: ReturnType<typeof publicAddresses>;
  holdings: Holding[][]; usd: Record<string, number>; spent: React.MutableRefObject<number>; onSent: () => void;
}) {
  const [chainId, setChainId] = useState(chains[0]?.id ?? "");
  const chain = chains.find((c) => c.id === chainId) ?? chains[0];
  const [tokenKey, setTokenKey] = useState<string>("");
  const token: TokenDef | undefined = chain?.tokens.find((t) => t.address === tokenKey);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [btcSpeed, setBtcSpeed] = useState<"economy" | "normal" | "priority">("normal");
  const [review, setReview] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const contacts = store.contacts().filter((c) => chain && chainById(c.chainId)?.family === chain.family);

  const idx = chains.findIndex((c) => c.id === chainId);
  const bal = (holdings[idx] ?? []).find((h) => (token ? h.token?.address.toLowerCase() === token.address.toLowerCase() : !h.token));
  const fee = useQuery({ queryKey: ["fee", chainId, tokenKey], queryFn: () => chain ? estimateFee(chain, token) : Promise.reject(new Error("Network unavailable")), enabled: !!chain, refetchInterval: 30_000 });
  const btcRate = fee.data?.btcRate ? Math.max(1, Math.round(fee.data.btcRate * { economy: 0.5, normal: 1, priority: 1.8 }[btcSpeed])) : undefined;

  const usdRate = token ? (token.custom ? undefined : 1) : chain ? usd[chain.coingeckoId] : undefined;
  const priceKnown = typeof usdRate === "number" && Number.isFinite(usdRate) && usdRate > 0;
  const usdValue = Number(amount || 0) * (priceKnown ? usdRate : 0);
  const safetyPriceMissing = !priceKnown && (has(draft, "bigsend") || has(draft, "limit"));
  const validTo = chain && to ? validateRecipient(chain, to) : false;
  const newRecipient = validTo && has(draft, "newaddr") && !store.knownRecipient(to);
  const bigSend = has(draft, "bigsend") && usdValue >= draft.bigSendUsd;
  const overLimit = has(draft, "limit") && spent.current + usdValue > draft.sessionLimitUsd;
  const insufficient = bal ? Number(amount || 0) > Number(bal.amount) : false;
  const canReview = validTo && !!bal && Number.isFinite(Number(amount)) && Number(amount) > 0 && !insufficient && !overLimit && !safetyPriceMissing;

  async function doSend() {
    if (!chain) return;
    if (!canReview || (bigSend && confirmText !== amount)) { toast.error("Refresh balances and prices, then review this transfer again."); return; }
    setBusy(true);
    try {
      const hash = await send({ chain, accounts, to: to.trim(), amount, token, btcFeeRate: btcRate });
      spent.current += usdValue;
      store.addActivity({ hash, chainId, symbol: token?.symbol ?? chain.symbol, amount, to: to.trim(), at: Date.now() });
      toast.success("Transaction broadcast", { description: hash, action: { label: "View", onClick: () => window.open(chain.explorerTx(hash), "_blank") } });
      if (has(draft, "confetti")) celebrate();
      setReview(false); setAmount(""); setTo(""); setConfirmText("");
      onSent();
    } catch (e) {
      toast.error("Send failed", { description: e instanceof Error ? e.message.slice(0, 240) : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-2xl space-y-6">
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] skin-muted">Transaction</p><h2 className="wallet-heading mt-1 text-2xl font-bold">Send assets</h2><p className="mt-1 text-sm skin-muted">Review the network, recipient, amount, and fee before local signing.</p></div>
      <div className="flex flex-wrap gap-1.5">
        {chains.map((c) => (
          <button key={c.id} onClick={() => { setChainId(c.id); setTokenKey(""); }} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${c.id === chainId ? "skin-accent" : "border skin-border"}`}>{c.name}</button>
        ))}
      </div>
      {chain && (has(draft, "stables") || chain.tokens.some((t) => t.custom)) && chain.tokens.length > 0 && (
        <div className="flex gap-1.5">
          <button onClick={() => setTokenKey("")} className={`num rounded-lg px-3 py-1.5 text-xs ${tokenKey === "" ? "skin-accent" : "border skin-border"}`}>{chain.symbol}</button>
          {chain.tokens.filter((t) => has(draft, "stables") || t.custom).map((t) => (
            <button key={t.address} onClick={() => setTokenKey(t.address)} className={`num rounded-lg px-3 py-1.5 text-xs ${t.address === tokenKey ? "skin-accent" : "border skin-border"}`}>{t.symbol}</button>
          ))}
        </div>
      )}
      <div>
        <label className="text-sm font-semibold">Recipient</label>
        <Input value={to} onChange={(e) => setTo(e.target.value.trim())} placeholder={`${chain?.name ?? "Network"} address`} className="num mt-1 h-12 rounded-xl" spellCheck={false} />
        {to && !validTo && <p className="mt-1 text-xs text-destructive">Not a valid {chain?.name ?? "network"} address.</p>}
        {contacts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {contacts.map((c) => <button key={c.address} onClick={() => setTo(c.address)} className="rounded-full border px-2.5 py-1 text-xs skin-border">@{c.name}</button>)}
          </div>
        )}
      </div>
      <div>
        <div className="flex justify-between text-sm"><label className="font-semibold">Amount</label>
          <span className="num skin-muted">Balance: {bal ? Number(bal.amount).toLocaleString(undefined, { maximumFractionDigits: 6 }) : "…"} {token?.symbol ?? chain?.symbol ?? ""}</span></div>
        <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" className="num mt-1 h-14 rounded-xl text-2xl" />
        <p className="num mt-1 text-xs skin-muted">≈ ${usdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD</p>
        {insufficient && <p className="text-xs text-destructive">Amount exceeds balance.</p>}
        {overLimit && <p className="text-xs text-destructive">This exceeds your session limit of ${draft.sessionLimitUsd.toLocaleString()}. Lock and unlock to reset.</p>}
      </div>
      {chain?.family === "bitcoin" && has(draft, "btcfee") && (
        <div className="grid grid-cols-3 gap-2">
          {(["economy", "normal", "priority"] as const).map((s) => (
            <button key={s} onClick={() => setBtcSpeed(s)} className={`rounded-xl py-2 text-xs font-semibold capitalize ${btcSpeed === s ? "skin-accent" : "border skin-border"}`}>{s}</button>
          ))}
        </div>
      )}
      <p className="text-sm skin-muted">Network fee: <span className="num">{chain?.family === "bitcoin" && btcRate ? `${btcRate} sat/vB` : fee.data?.label ?? "estimating…"}</span></p>
      <Button variant="skin" size="lg" className="w-full" disabled={!canReview} onClick={() => setReview(true)}>Review transaction</Button>

      <Dialog open={review} onOpenChange={(o) => !busy && setReview(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm send</DialogTitle>
            <DialogDescription>Check every character. Mainnet transactions can't be reversed.</DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Network</dt><dd>{chain?.name} mainnet</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Amount</dt><dd className="num font-bold">{amount} {token?.symbol ?? chain?.symbol}</dd></div>
            <div><dt className="text-muted-foreground">To</dt><dd className="num break-all">{to}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Fee</dt><dd className="num">{chain?.family === "bitcoin" && btcRate ? `${btcRate} sat/vB` : fee.data?.label}</dd></div>
          </dl>
          {newRecipient && <p className="rounded-xl bg-zap/15 p-3 text-sm text-zap">⚠ You've never sent to this address. Verify it out-of-band. Address-poisoning scams copy the first and last characters.</p>}
          {bigSend && (
            <div className="rounded-xl bg-pop/15 p-3 text-sm">
              <p className="text-pop">🛡 Large send. Type the amount <b className="num">{amount}</b> to confirm.</p>
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="num mt-2" />
            </div>
          )}
          <Button size="lg" disabled={busy || (bigSend && confirmText !== amount)} onClick={doSend}>
            {busy ? <Loader2 className="animate-spin" /> : <ArrowUpRight />} {busy ? "Signing & broadcasting…" : "Sign and send"}
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function celebrate() {
  const root = document.createElement("div");
  root.className = "pointer-events-none fixed inset-0 z-[100] overflow-hidden";
  const glyphs = ["🎉", "🚀", "💎", "✨", "🔥"];
  for (let i = 0; i < 40; i++) {
    const s = document.createElement("span");
    s.textContent = glyphs[i % glyphs.length]!;
    s.style.cssText = `position:absolute;left:${Math.random() * 100}%;top:-40px;font-size:${18 + Math.random() * 20}px;transition:transform 1.8s cubic-bezier(.2,.7,.3,1),opacity 1.8s;`;
    root.appendChild(s);
    requestAnimationFrame(() => { s.style.transform = `translateY(${window.innerHeight + 80}px) rotate(${Math.random() * 720}deg)`; s.style.opacity = "0"; });
  }
  document.body.appendChild(root);
  setTimeout(() => root.remove(), 2000);
}

/* ---------------- RECEIVE ---------------- */
function ReceivePanel({ draft, chains, addrs }: { draft: Draft; chains: ChainDef[]; addrs: ReturnType<typeof publicAddresses> }) {
  const [chainId, setChainId] = useState(chains[0]?.id ?? "");
  const chain = chainById(chainId)!;
  const address = addressFor(chain, addrs);
  const copy = async () => {
    await navigator.clipboard.writeText(address);
    toast.success("Address copied");
    if (has(draft, "clipboard")) setTimeout(() => navigator.clipboard.writeText("").catch(() => {}), 60_000);
  };
  return (
    <section className="max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-[0.16em] skin-muted">Deposit</p><h2 className="wallet-heading mt-1 text-2xl font-bold">Receive assets</h2>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {chains.map((c) => (
          <button key={c.id} onClick={() => setChainId(c.id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${c.id === chainId ? "skin-accent" : "border skin-border"}`}>{c.name}</button>
        ))}
      </div>
      {has(draft, "qr") && (
        <div className="mx-auto mt-6 w-fit rounded-2xl bg-foreground p-4">
          <QRCodeSVG value={address} size={208} />
        </div>
      )}
      <p className="num mt-5 break-all rounded-xl border p-3 text-center text-sm skin-border">{address}</p>
      <p className="mt-2 text-center text-xs skin-muted">
        Only send {chain.symbol}{chain.tokens.length ? ` or ${chain.tokens.map((t) => t.symbol).join("/")}` : ""} on {chain.name} mainnet to this address.
      </p>
      <Button variant="skin" className="mt-4 w-full" onClick={copy}><Copy />Copy address</Button>
    </section>
  );
}

/* ---------------- CUSTOM TOKENS ---------------- */
function TokensPanel({ chains, customTokens, onChange }: { chains: ChainDef[]; customTokens: CustomToken[]; onChange: (tokens: CustomToken[]) => void }) {
  const tokenChains = chains.filter((chain) => chain.family !== "bitcoin");
  const [chainId, setChainId] = useState(tokenChains[0]?.id ?? "");
  const chain = tokenChains.find((item) => item.id === chainId) ?? tokenChains[0];
  const [address, setAddress] = useState("");
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [decimals, setDecimals] = useState("18");
  const [loading, setLoading] = useState(false);
  const validAddress = chain ? validateTokenAddress(chain, address.trim()) : false;
  const duplicate = chain
    ? chain.tokens.some((token) => token.address.toLowerCase() === address.trim().toLowerCase()) || customTokens.some((token) => token.chainId === chain.id && token.address.toLowerCase() === address.trim().toLowerCase())
    : false;
  const ready = Boolean(chain && validAddress && !duplicate && symbol.trim() && name.trim() && Number.isInteger(Number(decimals)) && Number(decimals) >= 0 && Number(decimals) <= 36);

  async function loadMetadata() {
    if (!chain || !validAddress) return;
    setLoading(true);
    try {
      const meta = await fetchTokenMetadata(chain, address.trim());
      setSymbol(meta.symbol);
      setName(meta.name);
      setDecimals(String(meta.decimals));
      toast.success("Token details loaded");
    } catch (error) {
      toast.error("Enter token details manually", { description: error instanceof Error ? error.message : "Metadata could not be read." });
    } finally {
      setLoading(false);
    }
  }

  function addToken() {
    if (!chain || !ready) return;
    const next: CustomToken[] = [{ chainId: chain.id, address: address.trim(), symbol: symbol.trim().toUpperCase().slice(0, 16), name: name.trim().slice(0, 64), decimals: Number(decimals), custom: true }, ...customTokens];
    onChange(next);
    setAddress("");
    setSymbol("");
    setName("");
    setDecimals(chain.family === "solana" ? "6" : "18");
    toast.success("Custom token added");
  }

  if (!chain) return <section className="max-w-2xl rounded-3xl border p-6 skin-border skin-surface"><h2 className="wallet-heading text-2xl font-bold">Custom tokens</h2><p className="mt-2 text-sm skin-muted">Enable an EVM or Solana network in Studio to add custom tokens.</p></section>;

  return (
    <section className="max-w-3xl space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] skin-muted">Assets</p>
        <h2 className="wallet-heading mt-1 text-2xl font-bold">Custom tokens</h2>
        <p className="mt-1 text-sm skin-muted">Add verified contract or mint addresses for tokens that are not listed by default.</p>
      </div>
      <div className="rounded-3xl border p-5 skin-border skin-surface">
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <label className="text-sm font-semibold">Network
            <select value={chain.id} onChange={(event) => { setChainId(event.target.value); setAddress(""); setSymbol(""); setName(""); setDecimals(event.target.value === "tron" ? "6" : "18"); }} className="mt-1 h-11 w-full rounded-md border bg-transparent px-3 text-sm skin-border">
              {tokenChains.map((item) => <option key={item.id} value={item.id} className="bg-background">{item.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">Token address
            <Input value={address} onChange={(event) => setAddress(event.target.value.trim())} placeholder={`${chain.name} token contract or mint`} className="num mt-1 h-11 rounded-md" spellCheck={false} />
          </label>
        </div>
        {address && !validAddress && <p className="mt-2 text-xs text-destructive">Enter a valid {chain.name} token address.</p>}
        {duplicate && <p className="mt-2 text-xs text-destructive">That token is already listed for {chain.name}.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="skinGhost" disabled={!validAddress || duplicate || loading} onClick={loadMetadata}>{loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Auto-fill details</Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_2fr_120px]">
          <label className="text-sm font-semibold">Symbol<Input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="TOKEN" className="num mt-1 h-11 rounded-md" /></label>
          <label className="text-sm font-semibold">Name<Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Token name" className="mt-1 h-11 rounded-md" /></label>
          <label className="text-sm font-semibold">Decimals<Input inputMode="numeric" value={decimals} onChange={(event) => setDecimals(event.target.value.replace(/[^0-9]/g, ""))} className="num mt-1 h-11 rounded-md" /></label>
        </div>
        <Button variant="skin" className="mt-4 w-full rounded-md" disabled={!ready} onClick={addToken}><Plus />Add token to wallet</Button>
      </div>
      <div className="divide-y rounded-3xl border skin-border skin-surface">
        {customTokens.length === 0 ? <p className="p-5 text-sm skin-muted">No custom tokens added yet.</p> : customTokens.map((token) => (
          <div key={`${token.chainId}-${token.address}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4">
            <span className="min-w-0"><b>{token.symbol}</b><span className="block text-xs skin-muted">{token.name} · {chains.find((item) => item.id === token.chainId)?.name ?? token.chainId}</span><span className="num block truncate text-xs skin-muted">{token.address}</span></span>
            <Button variant="skinGhost" size="icon" aria-label={`Remove ${token.symbol}`} onClick={() => onChange(customTokens.filter((item) => !(item.chainId === token.chainId && item.address === token.address)))}><Trash2 /></Button>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- ACTIVITY ---------------- */
function ActivityPanel({ draft }: { draft: Draft }) {
  const items = store.activity();
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="wallet-heading text-2xl font-bold">Activity</h2>
        {has(draft, "csv") && items.length > 0 && (
          <Button variant="skinGhost" size="sm" onClick={() => downloadCsv("activity.csv", [["date", "chain", "asset", "amount", "to", "hash"], ...items.map((a) => [new Date(a.at).toISOString(), a.chainId, a.symbol, a.amount, a.to, a.hash])])}><Download />CSV</Button>
        )}
      </div>
      {items.length === 0 ? <p className="mt-6 text-sm skin-muted">No sends from this wallet yet. Incoming transfers show in your balances and on each chain's explorer.</p> : (
        <ul className="mt-4 divide-y">
          {items.map((a) => {
            const c = chainById(a.chainId);
            return (
              <li key={a.hash} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span><ArrowUpRight className="mr-1 inline size-4 skin-accent2-text" />{a.amount} {a.symbol} → <span className="num">{short(a.to)}</span>
                  <span className="block text-xs skin-muted">{c?.name} · {new Date(a.at).toLocaleString()}</span></span>
                {c && <a href={c.explorerTx(a.hash)} target="_blank" rel="noreferrer" className="skin-accent-text"><ExternalLink className="size-4" /></a>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ---------------- CONTACTS ---------------- */
function ContactsPanel({ chains }: { chains: ChainDef[] }) {
  const [list, setList] = useState<Contact[]>(store.contacts());
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState(chains[0]?.id ?? "");
  const chain = chainById(chainId)!;
  const valid = name.trim() && validateRecipient(chain, address.trim());
  const save = (l: Contact[]) => { setList(l); store.setContacts(l); };
  return (
    <section className="max-w-2xl rounded-3xl border p-6 skin-border skin-surface">
      <h2 className="text-2xl font-bold">Address book</h2>
      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto]">
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Address" className="num" value={address} onChange={(e) => setAddress(e.target.value)} />
        <select value={chainId} onChange={(e) => setChainId(e.target.value)} className="h-10 rounded-md border bg-transparent px-2 text-sm skin-border">
          {chains.map((c) => <option key={c.id} value={c.id} className="bg-background">{c.name}</option>)}
        </select>
        <Button variant="skin" disabled={!valid} onClick={() => { save([...list, { name: name.trim(), address: address.trim(), chainId }]); setName(""); setAddress(""); }}>Add</Button>
      </div>
      <ul className="mt-4 divide-y">
        {list.map((c, i) => (
          <li key={i} className="flex items-center justify-between py-3 text-sm">
            <span><b>@{c.name}</b> <span className="text-xs skin-muted">{chainById(c.chainId)?.name}</span><span className="num block text-xs skin-muted">{c.address}</span></span>
            <button aria-label="Remove contact" onClick={() => save(list.filter((_, j) => j !== i))}><Trash2 className="size-4 skin-muted" /></button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------- WATCH ---------------- */
function WatchPanel({ chains }: { chains: ChainDef[] }) {
  const [list, setList] = useState<Watch[]>(store.watch());
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState(chains[0]?.id ?? "");
  const chain = chainById(chainId)!;
  const valid = validateRecipient(chain, address.trim());
  const save = (l: Watch[]) => { setList(l); store.setWatch(l); };
  const qs = useQueries({
    queries: list.map((w) => {
      const c = chainById(w.chainId)!;
      const fake = { evm: w.address, solana: w.address, bitcoin: w.address, tron: w.address };
      return { queryKey: ["watch", w.chainId, w.address], queryFn: () => fetchHoldings(c, fake), refetchInterval: 60_000 };
    }),
  });
  return (
    <section className="max-w-2xl rounded-3xl border p-6 skin-border skin-surface">
      <h2 className="text-2xl font-bold">Watch-only</h2>
      <p className="text-sm skin-muted">Track any public address. No keys involved.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto]">
        <Input placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Input placeholder="Address" className="num" value={address} onChange={(e) => setAddress(e.target.value)} />
        <select value={chainId} onChange={(e) => setChainId(e.target.value)} className="h-10 rounded-md border bg-transparent px-2 text-sm skin-border">
          {chains.map((c) => <option key={c.id} value={c.id} className="bg-background">{c.name}</option>)}
        </select>
        <Button variant="skin" disabled={!valid} onClick={() => { save([...list, { label: label.trim() || "Watched", address: address.trim(), chainId }]); setLabel(""); setAddress(""); }}><Radar />Watch</Button>
      </div>
      <ul className="mt-4 space-y-2">
        {list.map((w, i) => (
          <li key={i} className="rounded-xl border p-3 text-sm skin-border">
            <div className="flex justify-between"><b>{w.label} <span className="text-xs font-normal skin-muted">{chainById(w.chainId)?.name}</span></b>
              <button aria-label="Remove" onClick={() => save(list.filter((_, j) => j !== i))}><Trash2 className="size-4 skin-muted" /></button></div>
            <p className="num text-xs skin-muted">{w.address}</p>
            <p className="num mt-1">{qs[i]?.isLoading ? "…" : (qs[i]?.data ?? []).map((h) => `${Number(h.amount).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${h.symbol}`).join(" · ")}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------- NETWORK ---------------- */
function NetworkPanel({ draft, chains }: { draft: Draft; chains: ChainDef[] }) {
  const fees = useQueries({ queries: chains.map((c) => ({ queryKey: ["fee", c.id, ""], queryFn: () => estimateFee(c), refetchInterval: 30_000 })) });
  const status = useQueries({
    queries: chains.map((c) => ({
      queryKey: ["status", c.id],
      enabled: has(draft, "status"),
      refetchInterval: 20_000,
      queryFn: async () => {
        const t = performance.now();
        if (c.family === "evm") {
          const r = await fetch(c.rpc[0]!, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }) });
          const j = (await r.json()) as { result: string };
          return { height: parseInt(j.result, 16), ms: Math.round(performance.now() - t) };
        }
        if (c.family === "bitcoin") {
          const r = await fetch(`${c.rpc[0]!}/blocks/tip/height`);
          return { height: Number(await r.text()), ms: Math.round(performance.now() - t) };
        }
        const { solanaRpc } = await import("@/lib/wallet/rpc.functions");
        const r = await solanaRpc({ data: { method: "getLatestBlockhash", params: [] } });
        return { height: (JSON.parse(r.json) as { context: { slot: number } }).context.slot, ms: Math.round(performance.now() - t) };
      },
    })),
  });
  return (
    <section className="grid gap-3 sm:grid-cols-2">
      {chains.map((c, i) => (
        <div key={c.id} className="rounded-2xl border p-4 skin-border skin-surface">
          <div className="flex items-center justify-between">
            <b>{c.name}</b>
            {has(draft, "status") && <span className={`size-2.5 rounded-full ${status[i]!.isSuccess ? "bg-success" : status[i]!.isError ? "bg-destructive" : "bg-muted"}`} />}
          </div>
          {has(draft, "status") && <p className="num mt-2 text-sm">Block <b>{status[i]!.data?.height.toLocaleString() ?? "…"}</b> <span className="skin-muted">· {status[i]!.data?.ms ?? "–"} ms</span></p>}
          {has(draft, "gas") && <p className="num mt-1 text-sm skin-muted">Fee: {fees[i]!.data?.label ?? "…"}</p>}
        </div>
      ))}
    </section>
  );
}

/* ---------------- SETTINGS ---------------- */
function SettingsPanel({ draft, onErased }: { draft: Draft; onErased: () => void }) {
  const [pw, setPw] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [confirmErase, setConfirmErase] = useState("");
  const [needsPw, setNeedsPw] = useState(true);
  useEffect(() => { isDeviceVault().then((d) => setNeedsPw(!d)).catch(() => {}); }, []);
  return (
    <section className="max-w-2xl space-y-4">
      <div className="rounded-3xl border p-6 skin-border skin-surface">
        <h2 className="text-xl font-bold">Recovery phrase</h2>
        <p className="text-sm skin-muted">{needsPw ? "Re-enter your password to view. " : ""}Do this privately.</p>
        {!revealed ? (
          <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); setErr(""); try { setRevealed(await unlockVault(pw)); } catch (x) { setErr(x instanceof Error ? x.message : "Failed"); } setPw(""); }}>
            {needsPw && <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" />}
            <Button variant="skin" disabled={needsPw && !pw}>Reveal</Button>
          </form>
        ) : (
          <>
            <ol className="num mt-3 grid grid-cols-3 gap-2 text-sm">
              {revealed.split(" ").map((w, i) => <li key={i} className="rounded-lg border px-2 py-1.5 skin-border"><span className="skin-muted">{i + 1}.</span> {w}</li>)}
            </ol>
            <div className="mt-3 flex gap-2 no-print">
              {has(draft, "paper") && <Button variant="skinGhost" onClick={() => window.print()}><Printer />Print paper backup</Button>}
              <Button variant="skinGhost" onClick={() => setRevealed(null)}>Hide</Button>
            </div>
          </>
        )}
        {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
      </div>
      <div className="rounded-3xl border p-6 skin-border skin-surface">
        <h2 className="text-xl font-bold">Your build</h2>
        <p className="text-sm skin-muted">Auto-lock {has(draft, "autolock") ? `${draft.autoLockMin} min` : "off"} · large-send {has(draft, "bigsend") ? `$${draft.bigSendUsd}` : "off"} · session limit {has(draft, "limit") ? `$${draft.sessionLimitUsd}` : "off"}</p>
        <a href="/human/studio" className="mt-3 inline-block text-sm font-semibold skin-accent-text">Edit in Studio →</a>
      </div>
      <div className="rounded-3xl border border-destructive/50 p-6">
        <h2 className="text-xl font-bold text-destructive">Erase wallet from this browser</h2>
        <p className="text-sm skin-muted">Funds stay on-chain. You'll need your recovery phrase to restore. Type ERASE to confirm.</p>
        <div className="mt-3 flex gap-2">
          <Input value={confirmErase} onChange={(e) => setConfirmErase(e.target.value)} placeholder="ERASE" />
          <Button variant="destructive" disabled={confirmErase !== "ERASE"} onClick={async () => { await eraseVault(); store.clearAll(); onErased(); }}><Trash2 />Erase</Button>
        </div>
      </div>
    </section>
  );
}

export { CHAINS };
