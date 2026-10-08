import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, LogOut, Plus, ReceiptText, Trash2, Wallet } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getSession, logout } from "@/integrations/auth/client";
import { EmailCodeConfirmation } from "@/components/human/email-code-confirmation";
import { Badge, Code, CopyButton, PageHero, Panel, Section } from "@/components/machine/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FREE_UNITS, PLANS, PAYMENT_CHAINS, paymentRail, type PlanId } from "@/lib/machine/config";
import { claimFreeUnits, confirmCheckout, createAccountKey, createCheckoutQuote, getAccountOverview, revokeAccountKey } from "@/lib/machine/account.functions";

const TITLE = "API dashboard ,  BuildAWallet Machine";
const DESC = "Sign in by email, buy API units on any supported payment network, manage API keys and see every metered call.";
export const Route = createFileRoute("/nonhuman/dashboard")({
  head: () => ({ meta: [{ title: TITLE }, { name: "description", content: DESC }, { property: "og:title", content: TITLE }, { property: "og:description", content: DESC }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Dashboard,
});

const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : ", ");

function Dashboard() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  useEffect(() => {
    let active = true;
    void getSession().then((session) => {
      if (!active) return;
      setSignedIn(session.authenticated && session.verified);
      setEmail(session.emailHint ?? "");
    }).catch(() => { if (active) setSignedIn(false); });
    return () => { active = false; };
  }, []);
  const onVerified = useCallback((v: boolean) => { if (v) setSignedIn(true); }, []);
  const qc = useQueryClient();

  return (
    <>
      <PageHero eyebrow="Human API program" title={<>Your keys.<br />Your units.</>}>
        For developers and businesses building on the machine API. Sign in with your email, buy units with USDC, create API keys for your agents and apps, and see every call they make.
      </PageHero>
      {signedIn === null ? <p className="mx-auto max-w-6xl px-5 text-sm text-muted-foreground md:px-10"><Loader2 className="mr-2 inline size-4 animate-spin" />Checking sign-in…</p>
        : !signedIn ? (
          <Section title="Sign in" intro="No password. We'll email you a sign-in link that brings you back here.">
            <div className="max-w-xl"><EmailCodeConfirmation onVerifiedChange={onVerified} redirectPath="/nonhuman/dashboard" nextLabel="your dashboard" /></div>
          </Section>
        ) : (
          <>
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 md:px-10">
              <p className="truncate text-sm text-muted-foreground">Signed in with <b className="text-foreground">{email || "a verified email"}</b></p>
              <Button variant="ghost" size="sm" onClick={async () => { await qc.cancelQueries(); qc.clear(); await logout(); setSignedIn(false); setEmail(""); }}><LogOut /> Sign out</Button>
            </div>
            <SignedIn />
          </>
        )}
    </>
  );
}

function SignedIn() {
  const fetchOverview = useServerFn(getAccountOverview);
  const { data, isLoading, error } = useQuery({ queryKey: ["api-account"], queryFn: () => fetchOverview() });
  if (isLoading) return <p className="mx-auto max-w-6xl px-5 py-8 text-sm text-muted-foreground md:px-10"><Loader2 className="mr-2 inline size-4 animate-spin" />Loading your account…</p>;
  if (error || !data) return <p className="mx-auto max-w-6xl px-5 py-8 text-sm text-destructive md:px-10">Your account could not be loaded. Refresh to try again.</p>;
  const a = data.account;
  const active = Boolean(a?.expires_at && new Date(a.expires_at).getTime() > Date.now());
  const remaining = a ? Math.max(a.quota - a.used, 0) : 0;
  const pct = a && a.quota ? Math.min(100, Math.round((a.used / a.quota) * 100)) : 0;
  const keyNames = Object.fromEntries(data.keys.map((k) => [k.id, k.name]));

  return (
    <>
      <Section eyebrow="Plan" title="Your plan" intro="Units are spent only when a metered call succeeds. Buying again before expiry adds units and extends 30 days.">
        <Panel>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-display text-2xl font-black uppercase">{a?.plan_id ? (a.plan_id === "free" ? "Free" : PLANS[a.plan_id as PlanId]?.name ?? a.plan_id) : "No plan yet"}</h3>
            {active ? <Badge tone="primary">active</Badge> : a ? <Badge tone="pop">expired</Badge> : <Badge>inactive</Badge>}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Stat label="Units left" value={remaining.toLocaleString()} />
            <Stat label="Used this term" value={(a?.used ?? 0).toLocaleString()} />
            <Stat label="Expires" value={fmt(a?.expires_at)} />
          </div>
          {!a && <FreeClaim />}
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
        </Panel>
      </Section>
      <Checkout quotes={data.quotes} />
      <Keys keys={data.keys} active={active} />
      <Section eyebrow="Usage" title="Recent calls" intro="The last 100 metered calls across all your keys. Free calls are not listed.">
        {data.usage.length === 0 ? <Panel><p className="text-sm text-muted-foreground">No metered calls yet. Try one with a key: <code>GET /machine/v1/base/wallet/&lt;address&gt;</code>.</p></Panel> : (
          <Table head={["Time", "Endpoint", "Chain", "Units", "Key", "Result"]} rows={data.usage.map((u) => [fmt(u.created_at), u.endpoint, u.chain || ", ", String(u.units), u.key_id ? keyNames[u.key_id] ?? "revoked" : ", ", u.allowed ? "charged" : "quota exceeded"])} />
        )}
      </Section>
      <Section eyebrow="Billing" title="Payments">
        {data.payments.length === 0 ? <Panel><p className="text-sm text-muted-foreground">No payments yet.</p></Panel> : (
          <Table head={["Paid", "Plan", "Chain", "Amount", "Transaction"]} rows={data.payments.map((p) => [fmt(p.paid_at), PLANS[p.plan_id as PlanId]?.name ?? p.plan_id, p.chain, formatAtomic(p.amount_atomic, p.chain === "bnb" ? 18 : p.chain === "bitcoin" ? 8 : 6), p.tx])} />
        )}
      </Section>
    </>
  );
}

function formatAtomic(value: string, decimals: number) {
  const n = BigInt(value);
  const base = 10n ** BigInt(decimals);
  const whole = n / base;
  const fraction = (n % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div><div className="mt-1 font-display text-lg font-black">{value}</div></div>;
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card/70">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"><tr>{head.map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className="max-w-[260px] truncate p-3 font-mono">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

type Quote = { id: string; plan_id: string; chain: string; payer: string; amount_atomic: string; asset: string; decimals: number; created_at: string; expires_at: string };

function Checkout({ quotes }: { quotes: Quote[] }) {
  const qc = useQueryClient();
  const startFn = useServerFn(createCheckoutQuote);
  const confirmFn = useServerFn(confirmCheckout);
  const [planId, setPlanId] = useState<PlanId>("pro");
  const [chain, setChain] = useState<(typeof PAYMENT_CHAINS)[number]>("base");
  const [payer, setPayer] = useState("");
  const [tx, setTx] = useState("");
  const [note, setNote] = useState<{ tone: "ok" | "wait" | "err"; text: string } | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const quote = quotes[0] && quotes[0].id !== dismissed ? quotes[0] : undefined;

  const start = useMutation({
    mutationFn: () => startFn({ data: { planId, chain, payer: payer.trim() } }),
    onSuccess: () => { setDismissed(null); void qc.invalidateQueries({ queryKey: ["api-account"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not start checkout"),
  });
  const confirm = useMutation({
    mutationFn: (quoteId: string) => confirmFn({ data: { quoteId, tx: tx.trim() } }),
    onSuccess: (r) => {
      if (r.status === "pending") setNote({ tone: "wait", text: r.message });
      else { setNote({ tone: "ok", text: `Plan active ,  ${r.units.toLocaleString()} units until ${fmt(r.expiresAt)}.` }); toast.success("Plan active"); setTx(""); }
      void qc.invalidateQueries({ queryKey: ["api-account"] });
    },
    onError: (e) => setNote({ tone: "err", text: e instanceof Error ? e.message : "Payment could not be verified" }),
  });

  const qPlan = quote ? PLANS[quote.plan_id as PlanId] : null;
  const rail = quote ? paymentRail(quote.chain) : null;
  const displayAmount = quote && rail ? formatAtomic(quote.amount_atomic, quote.decimals) : "";

  return (
    <Section eyebrow="Checkout" title="Buy units on your network" intro="1) Choose a plan and payment network. 2) Send the quoted asset amount from that wallet. 3) Paste the transaction id. We verify the payment on-chain; each transaction works once.">
      {!quote ? (
        <Panel>
          <div className="grid gap-3 sm:grid-cols-3">
            {Object.values(PLANS).map((p) => (
              <button key={p.id} type="button" onClick={() => setPlanId(p.id)} className={`rounded-xl border p-3 text-left ${planId === p.id ? "border-primary bg-primary/10" : "border-border"}`}>
                <div className="font-display text-sm font-black uppercase">{p.name}</div><div className="text-xs text-muted-foreground">{p.priceUSDC} USDC · {p.units.toLocaleString()} units</div>
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            {PAYMENT_CHAINS.map((c) => <button key={c} type="button" onClick={() => setChain(c)} className={`rounded-full px-4 py-1.5 font-mono text-[11px] uppercase tracking-widest ${chain === c ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>{c === "bitcoin" ? "BTC" : paymentRail(c).asset} · {c}</button>)}
          </div>
          <label className="mt-4 block text-sm font-semibold" htmlFor="payer">Paying wallet address ({chain})</label>
          <Input id="payer" value={payer} onChange={(e) => setPayer(e.target.value)} placeholder={chain === "bitcoin" ? "bc1p…" : chain === "solana" ? "Solana address" : chain === "tron" ? "T…" : "0x…"} className="mt-2 h-11 rounded-xl font-mono" />
          <Button className="mt-4" disabled={start.isPending || payer.trim().length < 26} onClick={() => start.mutate()}>{start.isPending ? <Loader2 className="animate-spin" /> : <Wallet />} Continue to payment</Button>
        </Panel>
      ) : (
        <Panel className="border-primary/40">
          <div className="grid gap-6 md:grid-cols-[auto_1fr]">
            <div className="rounded-xl bg-foreground p-3"><QRCodeSVG value={rail?.collector ?? ""} size={150} /></div>
            <div className="min-w-0 space-y-3 text-sm">
              <p>Send at least <b className="text-primary">{displayAmount} {quote.asset}</b> on <b className="uppercase">{quote.chain}</b> for the <b>{qPlan?.name}</b> plan.</p>
              <div><div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">To</div><div className="flex items-center gap-2"><code className="truncate">{rail?.collector}</code><CopyButton value={rail?.collector ?? ""} /></div></div>
              <div><div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">From (must match)</div><code className="block truncate">{quote.payer}</code></div>
              <p className="text-xs text-muted-foreground">Only the quoted asset is accepted. Open until {fmt(quote.expires_at)}. EVM payments need confirmations; Solana must be finalized; Bitcoin requires confirmation.</p>
              <label className="block font-semibold" htmlFor="tx">Transaction id</label>
              <Input id="tx" value={tx} onChange={(e) => setTx(e.target.value)} placeholder={quote.chain === "bitcoin" ? "Bitcoin tx id" : quote.chain === "solana" ? "Solana signature" : quote.chain === "tron" ? "Tron tx id" : "0x… (66 characters)"} className="h-11 rounded-xl font-mono" />
              <Button disabled={confirm.isPending || tx.trim().length < 40} onClick={() => confirm.mutate(quote.id)}>{confirm.isPending ? <Loader2 className="animate-spin" /> : <ReceiptText />} {confirm.isPending ? "Checking the chain…" : "Verify payment"}</Button>
              <Button variant="ghost" size="sm" className="ml-2" onClick={() => { setDismissed(quote.id); setNote(null); }}>Change plan or wallet</Button>
              {note ? <p role="status" className={`text-sm ${note.tone === "err" ? "text-destructive" : note.tone === "ok" ? "text-primary" : "text-zap"}`}>{note.text}</p> : null}
            </div>
          </div>
        </Panel>
      )}
    </Section>
  );
}

type Key = { id: string; name: string; token_hint: string; created_at: string; last_used_at: string | null; revoked_at: string | null };

function Keys({ keys, active }: { keys: Key[]; active: boolean }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createAccountKey);
  const revokeFn = useServerFn(revokeAccountKey);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => createFn({ data: { name: name.trim() } }),
    onSuccess: (r) => { setFresh(r.apiKey); setName(""); void qc.invalidateQueries({ queryKey: ["api-account"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create key"),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => { toast.success("Key revoked"); void qc.invalidateQueries({ queryKey: ["api-account"] }); },
  });
  const live = keys.filter((k) => !k.revoked_at);

  return (
    <Section eyebrow="Access" title="API keys" intro="Give each agent or app its own key so you can see and revoke them separately. Keys start with baw_acct_ and are shown once; we store only a hash.">
      <Panel>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Key name, e.g. trading-agent" className="h-11 flex-1 rounded-xl" />
          <Button disabled={create.isPending || !name.trim()} onClick={() => create.mutate()}>{create.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Create key</Button>
        </div>
        {!active ? <p className="mt-2 text-xs text-muted-foreground">Keys work once you have an active plan.</p> : null}
        {fresh ? (
          <div className="mt-4 rounded-xl border border-zap/50 bg-zap/10 p-4">
            <p className="text-sm font-semibold text-zap">Copy this key now ,  it won't be shown again.</p>
            <div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 truncate font-mono text-xs">{fresh}</code><CopyButton value={fresh} /></div>
            <div className="mt-3"><Code title="try it" code={`curl -H "Authorization: Bearer ${fresh}" \\\n  ${typeof window !== "undefined" ? window.location.origin : ""}/machine/v1/usage`} /></div>
          </div>
        ) : null}
        <div className="mt-4 divide-y divide-border">
          {live.length === 0 ? <p className="py-3 text-sm text-muted-foreground">No active keys.</p> : live.map((k) => (
            <div key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0"><div className="flex items-center gap-2 font-semibold"><KeyRound className="size-4 text-primary" />{k.name}</div><div className="font-mono text-xs text-muted-foreground">{k.token_hint} · created {fmt(k.created_at)} · last used {fmt(k.last_used_at)}</div></div>
              <Button variant="ghost" size="sm" disabled={revoke.isPending} onClick={() => revoke.mutate(k.id)}><Trash2 /> Revoke</Button>
            </div>
          ))}
        </div>
      </Panel>
      <p className="mt-3 text-xs text-muted-foreground">Using MCP? See <Link to="/nonhuman/mcp" className="text-primary underline">client setup</Link>.</p>
    </Section>
  );
}

function FreeClaim() {
  const claim = useServerFn(claimFreeUnits);
  const qc = useQueryClient();
  const m = useMutation({ mutationFn: () => claim(), onSuccess: (r) => { toast.success(`${r.units.toLocaleString()} free units added`); qc.invalidateQueries({ queryKey: ["api-account"] }); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Could not claim") });
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 p-3">
      <p className="text-sm text-muted-foreground"><b className="text-foreground">{FREE_UNITS.toLocaleString()} free units</b> for new accounts ,  no payment, 30 days.</p>
      <button type="button" onClick={() => m.mutate()} disabled={m.isPending} className="rounded-lg bg-primary px-3 py-1.5 font-display text-xs font-black uppercase text-primary-foreground disabled:opacity-60">{m.isPending ? "Adding…" : "Claim free units"}</button>
    </div>
  );
}
