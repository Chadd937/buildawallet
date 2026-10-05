import { useEffect, useRef, useState } from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const POLICY_VERSION = "2026-10-05-v3";
const WEB_ACCEPTANCE_KEY = `buildawallet:web-legal:${POLICY_VERSION}`;
const ANDROID_ACCEPTANCE_KEY = `buildawallet:android-legal:${POLICY_VERSION}`;
const POLICY_ORIGIN = "https://buildawallet.xyz";

type GateMode = "web" | "android";

// Web: shown only on the main landing page "/". Deep links (e.g. email sign-in
// links) go straight to their page. Android: shown at app start on any page.
export function LegalEntryGate({ isLanding }: { isLanding: boolean }) {
  const [mode, setMode] = useState<GateMode>("web");
  const [accepted, setAccepted] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const checkboxRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const nextMode = navigator.userAgent.includes("BuildAWalletAndroid/") ? "android" : "web";
    const key = nextMode === "android" ? ANDROID_ACCEPTANCE_KEY : WEB_ACCEPTANCE_KEY;
    setMode(nextMode);
    setAccepted(window.localStorage.getItem(key) === "accepted");
  }, []);

  useEffect(() => {
    if (!accepted) checkboxRef.current?.focus();
  }, [accepted]);

  if (accepted) return null;
  if (mode === "web" && !isLanding) return null;

  const isAndroid = mode === "android";
  const accept = () => {
    if (!agreed) return;
    const key = isAndroid ? ANDROID_ACCEPTANCE_KEY : WEB_ACCEPTANCE_KEY;
    window.localStorage.setItem(key, "accepted");
    setAccepted(true);
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-background/95 px-4 py-5 backdrop-blur-xl sm:grid sm:place-items-center sm:py-8">
      <main
        aria-describedby="legal-description"
        aria-labelledby="legal-title"
        aria-modal="true"
        className="glass mx-auto w-full max-w-2xl rounded-3xl p-5 shadow-card sm:p-8"
        role="dialog"
      >
        <div className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase text-primary">
          <ShieldCheck className="size-4" />
          BuildAWallet · {isAndroid ? "Android wallet" : "Before you continue"}
        </div>
        <h1 id="legal-title" className="mt-3 text-3xl font-black sm:text-5xl">
          Terms &amp; privacy acknowledgment
        </h1>
        <p id="legal-description" className="mt-4 text-sm leading-6 text-muted-foreground">
          BuildAWallet is self-custody software. Before using the {isAndroid ? "Android wallet" : "website or wallet tools"}, review the Terms of Service and Privacy Policy.
        </p>

        <nav aria-label="Legal policies" className="mt-5 flex flex-wrap gap-2">
          <PolicyLink href={`${POLICY_ORIGIN}/terms`}>Terms of Service</PolicyLink>
          <PolicyLink href={`${POLICY_ORIGIN}/privacy`}>Privacy Policy</PolicyLink>
          <PolicyLink href={`${POLICY_ORIGIN}/privacy-choices`}>Your Privacy Choices</PolicyLink>
        </nav>

        <div className="mt-5 rounded-2xl border border-border bg-surface p-4 text-xs leading-5 text-muted-foreground sm:text-sm">
          <strong className="text-foreground">Notice at collection:</strong> Cloudflare may process ordinary network and security metadata when delivering this page. If you sign in, BuildAWallet and its transactional email provider process the email and authentication data needed to deliver and verify a sign-in link. If you use wallet or API features, public wallet addresses, transaction identifiers and blockchain or RPC requests may be processed to provide the feature you requested. See the Privacy Policy for categories, purposes, recipients and retention.
        </div>
        <div className="mt-3 rounded-2xl border border-zap/30 bg-zap/5 p-4 text-xs leading-5 text-zap sm:text-sm">
          <strong>Privacy baseline:</strong> BuildAWallet does not sell personal information or share it for cross-context behavioral advertising, and does not use session-replay, keystroke-recording, or advertising-pixel tracking on its own pages. Wallet recovery phrases and private keys must never be submitted to BuildAWallet.
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-sm leading-6">
          <Checkbox
            ref={checkboxRef}
            aria-describedby="legal-fine-print"
            checked={agreed}
            className="mt-1 size-5"
            onCheckedChange={(value) => setAgreed(value === true)}
          />
          <span>
            I am at least 18 years old (or the age of legal majority where I live), I have read and agree to the{" "}
            <a className="font-semibold text-primary hover:underline" href={`${POLICY_ORIGIN}/terms`} rel="noopener noreferrer" target="_blank">Terms of Service</a>, and I acknowledge the{" "}
            <a className="font-semibold text-primary hover:underline" href={`${POLICY_ORIGIN}/privacy`} rel="noopener noreferrer" target="_blank">Privacy Policy</a>.
          </span>
        </label>
        <p id="legal-fine-print" className="mt-3 text-xs leading-5 text-muted-foreground">
          This acknowledgment does not waive any privacy right that cannot legally be waived. Privacy choices remain available whether or not you use the service.
        </p>
        <Button className="mt-5 w-full" disabled={!agreed} onClick={accept} size="lg" variant="splash">
          I agree · Enter {isAndroid ? "Android wallet" : "BuildAWallet"}
        </Button>
      </main>
    </div>
  );
}

function PolicyLink({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <a className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-2 text-xs font-semibold text-primary hover:border-primary" href={href} rel="noopener noreferrer" target="_blank">
      {children}<ExternalLink className="size-3" />
    </a>
  );
}
