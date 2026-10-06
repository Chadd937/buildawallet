import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { formatUnits } from "ethers";
import { ArrowUpRight, LockKeyhole, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { connectCollector, signReviewedWithdrawal } from "@/lib/owner/signing";
import type {
  TreasuryAsset,
  TreasuryChain,
  TreasurySnapshot,
  WithdrawalQuote,
} from "@/lib/owner/types";

export const Route = createFileRoute("/owner")({
  head: () => ({
    meta: [
      { title: "Owner treasury : BuildAWallet" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: OwnerTreasury,
});

async function ownerFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "include", cache: "no-store" });
  if (response.status === 404)
    throw new Error(
      "Owner access is unavailable. Sign in with your configured owner email, then reopen /owner.",
    );
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Treasury request unavailable.");
  return data;
}
const units = (atomic: string | null, decimals = 6) =>
  atomic === null ? "Unavailable" : formatUnits(atomic, decimals);
const txUrl = (chain: TreasuryChain, tx: string) =>
  chain === "base" ? `https://basescan.org/tx/${tx}` : `https://solscan.io/tx/${tx}`;

function OwnerTreasury() {
  const [snapshot, setSnapshot] = useState<TreasurySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [chain, setChain] = useState<TreasuryChain>("base");
  const [asset, setAsset] = useState<TreasuryAsset>("usdc");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [connected, setConnected] = useState("");
  const [quote, setQuote] = useState<WithdrawalQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [submitted, setSubmitted] = useState<{ chain: TreasuryChain; tx: string } | null>(null);
  const [status, setStatus] = useState("");
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setSnapshot(await ownerFetch<TreasurySnapshot>("/owner/treasury"));
    } catch (e) {
      setSnapshot(null);
      setQuote(null);
      setError(e instanceof Error ? e.message : "Treasury unavailable.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  function invalidate() {
    setQuote(null);
    setActionError("");
  }
  async function connect() {
    setBusy(true);
    setActionError("");
    setQuote(null);
    try {
      await ownerFetch("/owner/access");
      setConnected(await connectCollector(chain));
    } catch (e) {
      setConnected("");
      setActionError(e instanceof Error ? e.message : "Wallet connection unavailable.");
    } finally {
      setBusy(false);
    }
  }
  async function review() {
    setBusy(true);
    setActionError("");
    setQuote(null);
    try {
      if (!connected) throw new Error("Connect the collector wallet first.");
      setQuote(
        await ownerFetch<WithdrawalQuote>("/owner/withdrawal/prepare", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chain, asset, to, amount }),
        }),
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Withdrawal review unavailable.");
    } finally {
      setBusy(false);
    }
  }
  async function sign() {
    if (
      !quote ||
      quote.chain !== chain ||
      quote.asset !== asset ||
      quote.to !== to.trim() ||
      quote.amount !== amount.trim()
    )
      return;
    setBusy(true);
    setActionError("");
    try {
      await ownerFetch("/owner/access");
      const tx = await signReviewedWithdrawal(quote);
      setSubmitted({ chain, tx });
      setQuote(null);
      setStatus("Submitted. Check the on-chain status before making another withdrawal.");
    } catch (e) {
      setQuote(null);
      setActionError(
        `${e instanceof Error ? e.message : "Wallet request interrupted."} Check your wallet activity before trying again.`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function checkStatus() {
    if (!submitted) return;
    setBusy(true);
    setActionError("");
    try {
      const result = await ownerFetch<{
        found: boolean;
        success?: boolean;
        confirmationStatus?: string;
      }>(
        `/owner/withdrawal/status?chain=${submitted.chain}&tx=${encodeURIComponent(submitted.tx)}`,
      );
      setStatus(
        !result.found
          ? "Not found yet. Check again shortly."
          : result.success === false
            ? "The transaction failed on-chain. Check the explorer for details."
            : submitted.chain === "base"
              ? "Transaction included on Base. See the explorer for confirmations."
              : `Solana status: ${result.confirmationStatus ?? "processed"}.`,
      );
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Status unavailable.");
    } finally {
      setBusy(false);
    }
  }
  const native = chain === "base" ? "ETH" : "SOL";
  const income =
    snapshot?.ledger.totals.reduce((sum, row) => sum + BigInt(row.amountAtomic), 0n).toString() ??
    "0";
  return (
    <main className="min-h-screen px-5 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="num flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-primary">
              <LockKeyhole className="size-4" />
              Owner access
            </p>
            <h1 className="mt-3 text-3xl font-black sm:text-5xl">Your treasury</h1>
            <p className="mt-4 max-w-2xl leading-7">
              Crypto collections for your app and agent services. Your connected wallet approves and
              signs every withdrawal.
            </p>
          </div>
          <Button variant="outline" onClick={() => void refresh()} disabled={loading || busy}>
            <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        {error && (
          <p
            role="alert"
            className="mt-8 rounded-2xl border border-destructive/40 bg-surface p-5 text-destructive"
          >
            {error}
          </p>
        )}
        {!snapshot && loading && (
          <p className="mt-8" role="status">
            Loading your treasury…
          </p>
        )}
        {snapshot && (
          <>
            <div className="mt-8 grid gap-5 md:grid-cols-2">
              {snapshot.collectors.map((collector) => (
                <section
                  key={collector.chain}
                  className="rounded-3xl border border-border bg-surface/95 p-6"
                >
                  <h2 className="flex items-center gap-2 text-xl font-bold">
                    <Wallet className="size-5 text-primary" />
                    {collector.chain === "base" ? "Base" : "Solana"} collector
                  </h2>
                  <div className="mt-5 text-3xl font-bold">
                    {units(collector.usdcAtomic)}{" "}
                    <span className="text-base text-primary">USDC</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {units(collector.nativeAtomic, collector.nativeDecimals)}{" "}
                    {collector.nativeSymbol} for network fees
                  </p>
                  <p className="mt-5 break-all font-mono text-xs">{collector.address}</p>
                  <a
                    href={collector.explorer}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    View collector
                    <ArrowUpRight className="size-4" />
                  </a>
                  {collector.error && (
                    <p className="mt-3 text-sm text-destructive">{collector.error}</p>
                  )}
                </section>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Last read: {new Date(snapshot.observedAt).toLocaleString()}. Balances include on-chain
              deposits and withdrawals; recorded receipts below are a separate payment ledger.
            </p>
            <section className="mt-8 rounded-3xl border border-border bg-surface/95 p-6 sm:p-8">
              <h2 className="text-2xl font-bold">Withdraw on your device</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6">
                Connect the wallet account that controls the collector. Choose an amount and
                receiving address, review the transfer, then approve it in your wallet. Keep some
                ETH or SOL for network fees. Solana USDC uses the configured collection token
                account.
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  Chain
                  <select
                    value={chain}
                    disabled={busy}
                    onChange={(e) => {
                      setChain(e.target.value as TreasuryChain);
                      setConnected("");
                      invalidate();
                    }}
                    className="mt-2 w-full rounded-xl border border-border bg-background p-3"
                  >
                    <option value="base">Base mainnet</option>
                    <option value="solana">Solana mainnet</option>
                  </select>
                </label>
                <label className="text-sm">
                  Asset
                  <select
                    value={asset}
                    disabled={busy}
                    onChange={(e) => {
                      setAsset(e.target.value as TreasuryAsset);
                      invalidate();
                    }}
                    className="mt-2 w-full rounded-xl border border-border bg-background p-3"
                  >
                    <option value="usdc">USDC</option>
                    <option value="native">{native}</option>
                  </select>
                </label>
                <label className="text-sm">
                  Receiving wallet address
                  <Input
                    className="mt-2"
                    autoComplete="off"
                    value={to}
                    disabled={busy}
                    onChange={(e) => {
                      setTo(e.target.value);
                      invalidate();
                    }}
                  />
                </label>
                <label className="text-sm">
                  Amount ({asset === "usdc" ? "USDC" : native})
                  <Input
                    className="mt-2"
                    inputMode="decimal"
                    autoComplete="off"
                    value={amount}
                    disabled={busy}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      invalidate();
                    }}
                  />
                </label>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={() => void connect()}
                  disabled={busy || Boolean(submitted)}
                >
                  Connect collector wallet
                </Button>
                <Button
                  onClick={() => void review()}
                  disabled={busy || !connected || !to || !amount || Boolean(submitted)}
                >
                  {busy ? "Working…" : "Review withdrawal"}
                </Button>
              </div>
              {connected && (
                <p className="mt-3 break-all text-xs text-primary">
                  Connected: {connected}.{" "}
                  {chain === "solana" ? "Use Solana mainnet in Phantom." : "Using Base mainnet."}
                </p>
              )}
              {actionError && (
                <p role="alert" className="mt-4 text-sm text-destructive">
                  {actionError}
                </p>
              )}
              {quote && (
                <div className="mt-6 rounded-2xl border border-primary/35 bg-primary/5 p-5">
                  <h3 className="text-lg font-bold">Review before signing</h3>
                  <p className="mt-3 font-semibold">
                    Send {quote.amount} {quote.asset === "usdc" ? "USDC" : native} on{" "}
                    {quote.chain === "base" ? "Base" : "Solana"} mainnet
                  </p>
                  <p className="mt-2 break-all text-sm">From: {quote.from}</p>
                  <p className="mt-2 break-all text-sm">To: {quote.to}</p>
                  <p className="mt-3 text-sm">
                    {quote.chain === "base" ? "Maximum" : "Estimated"} network fee:{" "}
                    {units(quote.networkFeeAtomic, quote.chain === "base" ? 18 : 9)} {native}
                  </p>
                  {BigInt(quote.accountRentAtomic) > 0n && (
                    <p className="mt-2 text-sm">
                      New receiving token-account rent: {units(quote.accountRentAtomic, 9)} SOL
                    </p>
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">
                    Review expires after 60 seconds. Check the full address and the wallet's own
                    confirmation before approving.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button onClick={() => void sign()} disabled={busy}>
                      Approve in my wallet
                    </Button>
                    <Button variant="outline" disabled={busy} onClick={() => setQuote(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              {submitted && (
                <div className="mt-6 rounded-2xl border border-border p-5">
                  <p role="status" className="text-sm">
                    {status}
                  </p>
                  <a
                    href={txUrl(submitted.chain, submitted.tx)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 block break-all text-sm text-primary hover:underline"
                  >
                    {submitted.tx}
                  </a>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => void checkStatus()} disabled={busy}>
                      Check on-chain status
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setSubmitted(null);
                        setAmount("");
                        setQuote(null);
                        setStatus("");
                      }}
                    >
                      Start another withdrawal
                    </Button>
                  </div>
                </div>
              )}
            </section>
            <section className="mt-8 rounded-3xl border border-border bg-surface/95 p-6 sm:p-8">
              <h2 className="text-2xl font-bold">Recorded collections</h2>
              <p className="mt-3 text-3xl font-bold">
                {snapshot.ledger.error ? "Unavailable" : units(income)}{" "}
                <span className="text-base text-primary">USDC</span>
              </p>
              <p className="mt-3 text-sm leading-6">
                Subscriptions include current account and agent plans plus preserved legacy
                receipts. Pay-per-call records start with this treasury release; they do not
                reconstruct older settlements or unrelated deposits.
              </p>
              {snapshot.ledger.error && (
                <p className="mt-4 text-sm text-destructive">{snapshot.ledger.error}</p>
              )}
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {snapshot.ledger.totals.map((row) => (
                  <div
                    key={row.source + row.chain}
                    className="rounded-2xl border border-border p-4"
                  >
                    <p className="text-xs text-muted-foreground">
                      {row.source} · {row.chain}
                    </p>
                    <p className="mt-2 font-bold">{units(row.amountAtomic)} USDC</p>
                    <p className="mt-1 text-xs">{row.count} receipts</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[740px] text-left text-sm">
                  <caption className="mb-3 text-left text-xs text-muted-foreground">
                    Latest 100 recorded payments
                  </caption>
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-3 pr-4">Source</th>
                      <th className="pr-4">Chain</th>
                      <th className="pr-4">USDC</th>
                      <th className="pr-4">Paid</th>
                      <th>Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.ledger.receipts.map((receipt) => (
                      <tr
                        key={receipt.source + receipt.chain + receipt.tx}
                        className="border-b border-border/60"
                      >
                        <td className="py-4 pr-4">
                          {receipt.source}
                          {receipt.plan && (
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {receipt.plan}
                            </span>
                          )}
                        </td>
                        <td className="pr-4">{receipt.chain}</td>
                        <td className="pr-4 font-mono">{units(receipt.amountAtomic)}</td>
                        <td className="pr-4 text-xs">
                          {new Date(receipt.paidAt).toLocaleString()}
                        </td>
                        <td>
                          <a
                            href={txUrl(receipt.chain, receipt.tx)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs text-primary hover:underline"
                          >
                            {receipt.tx.slice(0, 10)}…{receipt.tx.slice(-6)}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!snapshot.ledger.error && snapshot.ledger.receipts.length === 0 && (
                  <p className="py-6 text-sm text-muted-foreground">No recorded payments yet.</p>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
