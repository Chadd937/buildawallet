import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { EmailCodeConfirmation } from "@/components/human/email-code-confirmation";
import { Input } from "@/components/ui/input";
import { StepShell } from "@/components/human/step-shell";
import { useDraft } from "@/hooks/use-draft";
import { AVATARS } from "@/lib/catalog";

export const Route = createFileRoute("/human/setup")({
  head: () => ({
    meta: [
      { title: "Name your wallet ,  BuildAWallet" },
      { name: "description", content: "Step 1: name your self-custody wallet, choose an avatar and confirm your email." },
      { property: "og:title", content: "Name your wallet ,  BuildAWallet" },
      { property: "og:description", content: "Step 1: name your self-custody wallet, choose an avatar and confirm your email." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Setup,
});

function Setup() {
  const { draft, update } = useDraft();
  const [emailVerified, setEmailVerified] = useState(false);
  const handleVerifiedChange = useCallback((verified: boolean) => setEmailVerified(verified), []);
  return (
    <StepShell step={1} title="Who's this wallet?" subtitle="Give it a name and a face, then confirm your email." next="/human/studio" canNext={draft.name.trim().length > 0 && emailVerified}>
      <label className="text-sm font-semibold" htmlFor="wname">Wallet name</label>
      <Input id="wname" maxLength={24} value={draft.name} onChange={(e) => update({ name: e.target.value })} className="mt-2 h-12 rounded-xl text-lg" />

      <p className="mt-6 text-sm font-semibold">Avatar</p>
      <div className="mt-2 grid grid-cols-6 gap-2 sm:grid-cols-12">
        {AVATARS.map((a) => (
          <button key={a} type="button" aria-label={`Avatar ${a}`} aria-pressed={draft.avatar === a} onClick={() => update({ avatar: a })}
            className={`aspect-square rounded-xl text-2xl transition hover:scale-110 ${draft.avatar === a ? "bg-primary/20 ring-2 ring-primary" : "bg-surface"}`}>
            {a}
          </button>
        ))}
      </div>

      <p className="mt-6 text-sm font-semibold">Confirm your email</p>
      <EmailCodeConfirmation onVerifiedChange={handleVerifiedChange} />
    </StepShell>
  );
}
