import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Mail, MailCheck, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getSession,
  logout,
  requestEmailConfirmation,
  verifyEmailCode,
} from "@/integrations/auth/client";

type Stage = "email" | "sent" | "verified";

const AFTER_SETUP_PATH = "/human/setup";

function confirmationError() {
  if (typeof window === "undefined") return "";
  const status = new URLSearchParams(window.location.search).get("auth");
  if (status === "expired") return "That confirmation link expired. Request a new email below.";
  if (status === "invalid")
    return "That confirmation link is invalid or has already been used. Request a new email below.";
  return "";
}

export function EmailCodeConfirmation({
  onVerifiedChange,
  redirectPath = AFTER_SETUP_PATH,
  nextLabel = "your wallet build",
}: {
  onVerifiedChange: (verified: boolean) => void;
  redirectPath?: string;
  nextLabel?: string;
}) {
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(confirmationError);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const session = await getSession();
        if (!active) return;
        const verified = session.authenticated && session.verified;
        if (verified) {
          setEmail(session.emailHint ?? "");
          setStage("verified");
          setError("");
        }
        onVerifiedChange(verified);
      } catch {
        if (!active) return;
        setError("Sign-in could not be checked. Please try again.");
        onVerifiedChange(false);
      } finally {
        if (active) setBusy(false);
      }
    };
    void check();
    const checkAfterReturn = () => void check();
    window.addEventListener("focus", checkAfterReturn);
    document.addEventListener("visibilitychange", checkAfterReturn);
    return () => {
      active = false;
      window.removeEventListener("focus", checkAfterReturn);
      document.removeEventListener("visibilitychange", checkAfterReturn);
    };
  }, [onVerifiedChange]);

  async function sendLink(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    const normalized = email.trim().toLowerCase();
    try {
      await requestEmailConfirmation(normalized, redirectPath);
      setEmail(normalized);
      setCode("");
      setStage("sent");
    } catch (sendError) {
      setError(
        sendError instanceof Error ? sendError.message : "Could not send confirmation email.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await verifyEmailCode(email, code);
      setStage("verified");
      onVerifiedChange(true);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Could not confirm that code.");
    } finally {
      setBusy(false);
    }
  }

  async function changeEmail() {
    setBusy(true);
    await logout();
    setStage("email");
    setEmail("");
    setCode("");
    setError("");
    onVerifiedChange(false);
    setBusy(false);
  }

  if (busy && stage === "email" && !email) {
    return (
      <div className="mt-2 flex h-12 items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Checking sign-in…
      </div>
    );
  }

  if (stage === "verified") {
    return (
      <div className="mt-2 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <CheckCircle2 className="size-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Email confirmed</p>
            <p className="truncate text-xs text-muted-foreground">
              {email || "This browser is signed in to your BuildAWallet account."}
            </p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={changeEmail}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-border bg-surface p-4">
      {stage === "email" ? (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            We&apos;ll email you a secure{" "}
            <span className="font-semibold text-foreground">confirmation code</span>. Enter the
            six-digit code below to continue to {nextLabel}.
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
              {busy ? <Loader2 className="animate-spin" /> : <Mail />} Email confirmation code
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
                We sent a confirmation code to{" "}
                <span className="font-semibold text-foreground">{email}</span>. Enter it below to
                sign in and continue to {nextLabel}.
              </p>
              <p className="mt-2 text-muted-foreground">Your code expires after ten minutes.</p>
            </div>
          </div>
          <form onSubmit={confirmCode} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Confirmation code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="h-11 flex-1 rounded-xl text-center font-mono tracking-[0.3em]"
            />
            <Button type="submit" disabled={busy || code.length !== 6}>
              {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Confirm code
            </Button>
          </form>
          <p className="mt-3 text-sm text-muted-foreground">
            Don&apos;t see it within a minute or two? Check your{" "}
            <span className="font-semibold text-foreground">spam or junk folder</span>.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void sendLink()}
            >
              <RotateCcw /> Resend email
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setStage("email");
                setError("");
              }}
            >
              Use another email
            </Button>
          </div>
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
