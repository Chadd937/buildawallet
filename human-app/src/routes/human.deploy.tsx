import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Monitor, Smartphone, ArrowLeft, Download, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Ticker } from "@/components/human/step-shell";
import { PhonePreview } from "@/components/human/phone-preview";
import { useDraft } from "@/hooks/use-draft";
import { CHAINS } from "@/lib/wallet/chains";
import { downloadBuildBackup } from "@/lib/wallet/build-backup";

export const Route = createFileRoute("/human/deploy")({
  head: () => ({
    meta: [
      { title: "Deploy your wallet ,  BuildAWallet" },
      { name: "description", content: "Save a backup of your wallet build, then launch it on the web or download the Android app." },
      { property: "og:title", content: "Deploy your wallet ,  BuildAWallet" },
      { property: "og:description", content: "Back up your build, then launch on web or Android." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Deploy,
});

function Deploy() {
  const { draft } = useDraft();
  const [saved, setSaved] = useState(false);
  return (
    <div className="studio-background min-h-screen">
      <Ticker />
      <div className="mx-auto max-w-6xl px-5 py-12">
        <Link to="/human/studio" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Studio
        </Link>
        <div className="mt-6 grid items-center gap-10 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="num text-xs uppercase tracking-[0.25em] text-primary">Build locked in</p>
            <h1 className="mt-2 text-4xl font-black sm:text-6xl">
              Deploy <span className="text-splash">{draft.name || "your wallet"}</span>
            </h1>
            <p className="mt-3 max-w-xl text-muted-foreground">
              {draft.chains.length} of {CHAINS.length} mainnet chains · {draft.features.length} power-ups. Same keys, same look, everywhere.
            </p>

            <div className="mt-8 rounded-3xl border border-border bg-surface p-6">
              <p className="num text-xs uppercase tracking-[0.25em] text-zap">Step 1 · Save your build</p>
              <p className="mt-2 font-display text-xl font-bold">Back up this wallet build</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Downloads a small file with your name, look, chains, power-ups and limits. Import it on any device or in the Android app to get this exact wallet back. It never contains your keys or recovery phrase.
              </p>
              <Button variant="splash" className="mt-4" onClick={() => { downloadBuildBackup(draft); setSaved(true); }}>
                {saved ? <Check /> : <Download />} {saved ? "Backup saved ,  download again" : "Save build backup"}
              </Button>
            </div>

            <p className="num mt-8 text-xs uppercase tracking-[0.25em] text-primary">Step 2 · Launch</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Link to="/human/wallet" className="group rounded-3xl border border-border bg-surface p-6 transition hover:-translate-y-1 hover:border-primary hover:shadow-neon">
                <Monitor className="size-8 text-primary" />
                <p className="mt-4 font-display text-xl font-bold">Web wallet</p>
                <p className="mt-1 text-sm text-muted-foreground">Create new, restore a phrase, or import a build backup. Keys encrypted on this device.</p>
                <p className="mt-4 text-sm font-bold text-primary">Enter →</p>
              </Link>
              <Link to="/human/android" className="group rounded-3xl border border-border bg-surface p-6 transition hover:-translate-y-1 hover:border-pop hover:shadow-pop">
                <Smartphone className="size-8 text-pop" />
                <p className="mt-4 font-display text-xl font-bold">Android app</p>
                <p className="mt-1 text-sm text-muted-foreground">Download your Android build. The app offers the same create, restore and import options.</p>
                <p className="mt-4 text-sm font-bold text-pop">Get the APK →</p>
              </Link>
            </div>
          </div>
          <PhonePreview draft={draft} />
        </div>
      </div>
    </div>
  );
}
