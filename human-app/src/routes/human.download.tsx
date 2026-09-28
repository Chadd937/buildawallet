import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Download, Info, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletShell } from "@/components/wallet-shell";
import { useWalletDraft } from "@/hooks/use-wallet-draft";

export const Route = createFileRoute("/human/download")({
  head: () => ({ meta: [
    { title: "Download Your Wallet | BuildAWallet" },
    { name: "description", content: "Scan the QR code to get your BuildAWallet Android build and review your wallet summary." },
    { property: "og:title", content: "Download Your Wallet | BuildAWallet" },
    { property: "og:description", content: "Scan to download your custom wallet build." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: DownloadPage,
});

function DownloadPage() {
  const { draft } = useWalletDraft();
  const [url, setUrl] = useState("https://buildawallet.xyz/human/download");
  const [build, setBuild] = useState<{ buildId: string; status: string; apkUrl?: string; sha256?: string; message?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUrl(window.location.href);
    const buildId = window.localStorage.getItem("buildawallet-human-build-id");
    if (!buildId) { setBuild(null); setLoading(false); return; }
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/human/build/${encodeURIComponent(buildId)}`, { cache: "no-store", credentials: "include" });
        const data = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) setBuild({ buildId, status: data.status || "queued", apkUrl: data.apkUrl, sha256: data.sha256, message: data.message });
      } catch {
        if (!cancelled) setBuild({ buildId, status: "unavailable", message: "Build service is not reachable yet." });
      } finally { if (!cancelled) setLoading(false); }
    };
    poll();
    const timer = window.setInterval(poll, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const buildId = build?.buildId || "NOT-STARTED";
  const ready = build?.status === "complete" && Boolean(build?.apkUrl);

  return <WalletShell><main className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-2">
    <section className="rounded-2xl border-2 border-primary bg-card p-6 text-center sm:p-8">
      <p className="font-mono text-[10px] uppercase text-primary">Build #{buildId} · {loading ? "checking" : (build?.status || "not started")}</p>
      <h1 className="mt-2 font-display text-4xl leading-tight">{ready ? `${draft.name} is ready.` : "Your Android build"}</h1>
      <p className="mt-2 text-muted-foreground">{ready ? "Scan with your Android phone or download the signed APK directly." : (build?.message || "Release the wallet from Studio to start an Android build.")}</p>
      <div className="pulse-border mx-auto mt-6 w-fit rounded-2xl border-2 border-border bg-foreground p-4"><QRCodeSVG value={ready && build?.apkUrl ? new URL(build.apkUrl, window.location.origin).toString() : url} size={220} bgColor="transparent" fgColor="currentColor" className="text-background" /></div>
      {ready ? <Button variant="arcade" size="xl" className="mt-6 w-full" asChild><a href={build!.apkUrl!}><Download /> Download signed APK</a></Button> : <Button variant="arcade" size="xl" className="mt-6 w-full" disabled><Download /> APK not ready yet</Button>}
      <p className="mt-4 flex items-start gap-2 rounded-lg bg-secondary p-3 text-left text-xs text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0 text-accent" /> BuildAWallet only labels a file as an APK when the Android build service reports a completed signed artifact. No seed phrase or private key is included in the build configuration.</p>
      {build?.sha256 && <p className="mt-3 break-all font-mono text-[10px] text-muted-foreground">SHA-256: {build.sha256}</p>}
    </section>
    <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <h2 className="flex items-center gap-2 font-display text-xl"><Smartphone className="size-5 text-primary" /> Build summary</h2>
      <dl className="mt-5 space-y-4 text-sm">
        {[["Skin", draft.theme], ["Custody", draft.custody]].map(([k, v]) => <div key={k} className="flex justify-between border-b border-border pb-2"><dt className="text-muted-foreground">{k}</dt><dd className="font-display">{v}</dd></div>)}
        {([["Chains", draft.chains], ["Security", draft.security], ["Features", draft.features]] as const).map(([k, list]) => <div key={k}><dt className="mb-2 text-muted-foreground">{k} ({list.length})</dt><dd className="flex flex-wrap gap-1">{list.map((x) => <span key={x} className="rounded-full border border-border px-2 py-0.5 text-xs">{x}</span>)}</dd></div>)}
      </dl>
      <Button variant="vault" asChild className="mt-6"><Link to="/human/studio"><ArrowLeft /> Back to Studio</Link></Button>
    </section>
  </main></WalletShell>;
}
