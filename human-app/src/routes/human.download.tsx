import { createFileRoute } from "@tanstack/react-router";
import { Download, Home, Info, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletShell } from "@/components/wallet-shell";

export const Route = createFileRoute("/human/download")({
  head: () => ({ meta: [
    { title: "BuildAWallet Android App | Self-Custody Crypto Wallet" },
    { name: "description", content: "Download the signed BuildAWallet Android wallet. Build, create or restore your self-custody wallet directly inside the app with local signing." },
    { property: "og:title", content: "BuildAWallet Android App" },
    { property: "og:description", content: "Build your crypto wallet directly on Android. Wallet creation, recovery and signing stay on the phone." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: AndroidDownloadPage,
});

const APK_URL = "https://github.com/Chadd937/buildawallet/releases/download/android-latest/BuildAWallet-Wallet.apk";
const SHA_URL = "https://github.com/Chadd937/buildawallet/releases/download/android-latest/BuildAWallet-Wallet.apk.sha256";

function AndroidDownloadPage() {
  return <WalletShell><main className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_.9fr]">
    <section className="rounded-2xl border-2 border-primary bg-card p-6 text-center sm:p-8">
      <p className="font-mono text-[10px] uppercase text-primary">BuildAWallet for Android</p>
      <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">Build the wallet on your phone.</h1>
      <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">The Android app is completely separate from the website builder. Install it, then choose the wallet name, look and networks and create a new wallet or restore an existing one entirely inside the app.</p>
      <Button variant="arcade" size="xl" className="mt-7 w-full" asChild><a href={APK_URL}><Download /> Download signed Android APK</a></Button>
      <a className="mt-3 block font-mono text-[10px] text-muted-foreground underline" href={SHA_URL}>View published SHA-256 checksum</a>
      <p className="mt-4 flex items-start gap-2 rounded-lg bg-secondary p-3 text-left text-xs text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0 text-accent" /> Android may ask you to allow installation from your browser or files app. Keep the recovery phrase offline and verify the published checksum when sideloading.</p>
    </section>

    <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <Smartphone className="size-7 text-primary" />
      <h2 className="mt-3 font-display text-2xl">Mobile wallet flow</h2>
      <ol className="mt-5 space-y-3 text-sm text-muted-foreground">
        <li><strong className="text-foreground">1. Install BuildAWallet.</strong> The signed APK is a standalone mobile wallet builder.</li>
        <li><strong className="text-foreground">2. Build inside the app.</strong> Name the wallet, choose a theme and select the mainnets you want enabled.</li>
        <li><strong className="text-foreground">3. Create or restore locally.</strong> Generate a new BIP-39 recovery phrase or restore one you already control.</li>
        <li><strong className="text-foreground">4. Verify your backup.</strong> New wallets require a recovery-word check before activation.</li>
        <li><strong className="text-foreground">5. Use the wallet.</strong> Read native balances, receive, review, sign and broadcast supported EVM transfers.</li>
      </ol>
      <div className="mt-7 rounded-xl border border-border bg-background/50 p-4 text-sm text-muted-foreground">
        Supported mainnets: Ethereum, Base, Polygon, Arbitrum, Optimism, Avalanche C-Chain and BNB Chain. Recovery material is encrypted with Android Keystore and never sent to BuildAWallet.
      </div>
      <Button variant="vault" className="mt-7 w-full" asChild><a href="/"><Home /> Back to BuildAWallet.xyz</a></Button>
    </section>
  </main></WalletShell>;
}
