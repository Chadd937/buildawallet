import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Mail } from "lucide-react";
import { SetupPage } from "@/components/setup-page";
import { Button } from "@/components/ui/button";
import { useWalletDraft } from "@/hooks/use-wallet-draft";

export const Route = createFileRoute("/human/setup")({
  head: () => ({
    meta: [
      { title: "Name Your Wallet | BuildAWallet" },
      {
        name: "description",
        content: "Name your Human wallet and confirm your BuildAWallet account by email.",
      },
      { property: "og:title", content: "Name Your Wallet | BuildAWallet" },
      { property: "og:description", content: "Start your personalized wallet build." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HumanIdentity,
});

function HumanIdentity() {
  const { draft, setDraft } = useWalletDraft();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/human/account", { credentials: "include", cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setVerified(Boolean(data.authenticated && data.verified)))
      .catch(() => undefined);
  }, []);

  const sendCode = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/human/account/email", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not send confirmation email.");
      setSent(true);
      setMessage("Confirmation code sent. Check your email.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send confirmation email.");
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/human/account/verify", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not confirm that code.");
      setVerified(true);
      setMessage("Email confirmed. Your BuildAWallet account is ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not confirm that code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SetupPage
      step={1}
      eyebrow="01 / Identity"
      title="Name your future wallet."
      description="Name the wallet first, then confirm your email to create your BuildAWallet account. Visual styling moves to Studio, where you can remix everything later."
      field="theme"
      choices={[]}
      canContinue={Boolean(draft.name.trim()) && verified}
      next="/human/custody"
      back="/"
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <label className="block">
          <span className="mb-2 block font-mono text-[10px] uppercase text-muted-foreground">
            Wallet name
          </span>
          <input
            className="h-14 w-full rounded-xl border border-input bg-background px-4 text-lg text-foreground outline-none focus:border-primary"
            maxLength={32}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Nova Wallet"
          />
          <span className="mt-2 block text-xs text-muted-foreground">
            You can rename it later in Studio.
          </span>
        </label>

        <section className="rounded-xl border border-border bg-background/65 p-4">
          <div className="mb-4 flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
              {verified ? <CheckCircle2 className="size-5" /> : <Mail className="size-5" />}
            </span>
            <div>
              <p className="font-display text-sm">BuildAWallet account</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {verified
                  ? "Email confirmed. This browser is signed in."
                  : "Use a one-time email code. No password is required."}
              </p>
            </div>
          </div>

          {!verified && (
            <div className="space-y-3">
              <input
                type="email"
                autoComplete="email"
                className="h-12 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-primary"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
              {!sent ? (
                <Button type="button" variant="vault" className="w-full" disabled={busy || !email.trim()} onClick={sendCode}>
                  {busy ? "Sending…" : "Email me a confirmation code"}
                </Button>
              ) : (
                <>
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    className="h-12 w-full rounded-lg border border-input bg-card px-3 text-center font-mono text-lg tracking-[0.35em] text-foreground outline-none focus:border-primary"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                  />
                  <Button type="button" variant="arcade" className="w-full" disabled={busy || code.length !== 6} onClick={confirmCode}>
                    {busy ? "Confirming…" : "Confirm email"}
                  </Button>
                  <button type="button" className="w-full text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={sendCode} disabled={busy}>
                    Send a new code
                  </button>
                </>
              )}
            </div>
          )}

          {message && (
            <p className={`mt-3 text-xs ${verified ? "text-primary" : "text-muted-foreground"}`} role="status">
              {message}
            </p>
          )}
        </section>
      </div>
    </SetupPage>
  );
}
