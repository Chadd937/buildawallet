import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Download, FileJson, Info, Smartphone, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletShell } from "@/components/wallet-shell";
import { useWalletDraft } from "@/hooks/use-wallet-draft";

export const Route = createFileRoute("/human/download")({
  head: () => ({ meta: [
    { title: "BuildAWallet Android App | Self-Custody Crypto Wallet" },
    { name: "description", content: "Download the signed BuildAWallet Android wallet. Create or restore your self-custody wallet directly on your phone, with local signing and optional Studio design import." },
    { property: "og:title", content: "BuildAWallet Android App" },
    { property: "og:description", content: "Build your crypto wallet directly on Android. Keys stay on the phone; Studio designs can be imported separately." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: AndroidDownloadPage,
});

const APK_URL = "https://github.com/Chadd937/buildawallet/releases/download/android-latest/BuildAWallet-Wallet.apk";
const SHA_URL = "https://github.com/Chadd937/buildawallet/releases/download/android-latest/BuildAWallet-Wallet.apk.sha256";

function AndroidDownloadPage() {
  const { draft } = useWalletDraft();
  const designPayload = useMemo(() => ({ schema: "buildawallet-human-v1", ...draft }), [draft]);
  const applyDesignUrl = `buildawallet://import?data=${encodeURIComponent(JSON.stringify(designPayload))}`;

  const downloadDesign = () => {
    const blob = new Blob([JSON.stringify(designPayload, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${draft.name.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "my-wallet"}-design.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
  };

  return <WalletShell><main className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_.9fr]">
    <section className="rounded-2xl border-2 border-primary bg-card p-6 text-center sm:p-8">
      <p className="font-mono text-[10px] uppercase text-primary">BuildAWallet for Android</p>
      <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">Build the wallet on your phone.</h1>
      <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">The APK is the BuildAWallet mobile app—not the output of the website builder. Install it, then create a new wallet or restore an existing one inside the app. Recovery phrases and signing stay on the device.</p>
      <div className="mx-auto mt-7 w-fit rounded-2xl bg-white p-4"><QRCodeSVG value={APK_URL} size={220} /></div>
      <Button variant="arcade" size="xl" className="mt-6 w-full" asChild><a href={APK_URL}><Download /> Download signed Android APK</a></Button>
      <a className="mt-3 block font-mono text-[10px] text-muted-foreground underline" href={SHA_URL}>View published SHA-256 checksum</a>
      <p className="mt-4 flex items-start gap-2 rounded-lg bg-secondary p-3 text-left text-xs text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0 text-accent" /> Android may ask you to allow installation from your browser or files app. Keep the recovery phrase offline and verify the published checksum when sideloading.</p>
    </section>

    <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <Smartphone className="size-7 text-primary" />
      <h2 className="mt-3 font-display text-2xl">Mobile flow</h2>
      <ol className="mt-5 space-y-3 text-sm text-muted-foreground">
        <li><strong className="text-foreground">1. Install BuildAWallet.</strong> The signed app is reusable; you do not need a website build first.</li>
        <li><strong className="text-foreground">2. Build inside the app.</strong> Choose your wallet identity, networks and look.</li>
        <li><strong className="text-foreground">3. Create or restore locally.</strong> The recovery phrase is handled on-device and protected by Android Keystore.</li>
        <li><strong className="text-foreground">4. Use the wallet.</strong> Read balances, receive, review, sign and broadcast supported EVM transfers.</li>
      </ol>

      <div className="mt-7 border-t border-border pt-6">
        <h3 className="font-display text-xl">Already designed one in Studio?</h3>
        <p className="mt-2 text-sm text-muted-foreground">Import only the visual/settings blueprint. No seed phrase, private key, browser password or Android key is included.</p>
        <Button variant="vault" size="lg" className="mt-4 w-full" asChild><a href={applyDesignUrl}><WandSparkles /> Apply current Studio design</a></Button>
        <Button variant="vault" size="lg" className="mt-3 w-full" onClick={downloadDesign}><FileJson /> Download design JSON</Button>
      </div>

      <div className="mt-7 flex flex-wrap gap-3">
        <Button variant="vault" asChild><Link to="/human/studio"><ArrowLeft /> Open Studio</Link></Button>
        <Button variant="arcade" asChild><Link to="/human/setup">Build desktop wallet</Link></Button>
      </div>
    </section>
  </main></WalletShell>;
}
