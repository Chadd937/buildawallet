import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Mail, MailCheck, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

type Stage = "email" | "sent" | "verified";

/** Where the emailed sign-in link lands: the step right after /human/setup. */
const AFTER_SETUP_PATH = "/human/setup";

export function EmailCodeConfirmation({ onVerifiedChange, redirectPath = AFTER_SETUP_PATH, nextLabel = "your wallet build" }: { onVerifiedChange: (verified: boolean) => void; redirectPath?: string; nextLabel?: string }) {
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const verified = Boolean(data.user?.email_confirmed_at);
      if (verified) {
        setEmail(data.user?.email ?? "");
        setStage("verified");
      }
      onVerifiedChange(verified);
      setBusy(false);
    }).catch(() => {
      if (!active) return;
      setError("Sign-in could not be checked. Please try again.");
      onVerifiedChange(false);
      setBusy(false);
    });
    // Picks up a sign-in completed from the emailed link in another tab.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const user = session?.user;
      if (user?.email_confirmed_at) {
        setEmail(user.email ?? "");
        setStage("verified");
        onVerifiedChange(true);
      } else {
        setStage("email");
        onVerifiedChange(false);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [onVerifiedChange]);

  async function sendLink(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    const normalized = email.trim().toLowerCase();
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}${redirectPath}`,
      },
    });
    if (sendError) {
      setError(sendError.message);
    } else {
      setEmail(normalized);
      setStage("sent");
    }
    setBusy(false);
  }

  async function changeEmail() {
    setBusy(true);
    await supabase.auth.signOut();
    setStage("email");
    setEmail("");
    setError("");
    onVerifiedChange(false);
    setBusy(false);
  }

  if (busy && stage === "email" && !email) {
    return <div className="mt-2 flex h-12 items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Checking sign-in…</div>;
  }

  if (stage === "verified") {
    return (
      <div className="mt-2 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <CheckCircle2 className="size-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Signed in</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={changeEmail}>Change</Button>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-border bg-surface p-4">
      {stage === "email" ? (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            We'll email you a <span className="font-semibold text-foreground">sign-in link</span> (not a code). Open it on this device and you'll continue straight to {nextLabel}.
          </p>
          <form onSubmit={sendLink} className="flex flex-col gap-3 sm:flex-row">
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              className="h-11 flex-1 rounded-xl"
              required
            />
            <Button type="submit" disabled={busy || !email.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : <Mail />} Email me a sign-in link
            </Button>
          </form>
        </>
      ) : (
        <div>
          <div className="flex items-start gap-3">
            <MailCheck className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="text-sm">
              <p className="font-semibold">Check your inbox</p>
              <p className="mt-1 text-muted-foreground">
                We sent a sign-in link to <span className="font-semibold text-foreground">{email}</span>. Click the link in that email to sign in ,  it will bring you to {nextLabel} automatically.
              </p>
              <p className="mt-2 text-muted-foreground">
                Don't see it within a minute or two? Check your <span className="font-semibold text-foreground">spam or junk folder</span>.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void sendLink()}><RotateCcw /> Resend link</Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setStage("email"); setError(""); }}>Use another email</Button>
          </div>
        </div>
      )}
      {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
