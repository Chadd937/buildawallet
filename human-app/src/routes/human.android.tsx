import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Download, Fingerprint, Loader2, ShieldOff, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Ticker } from "@/components/human/step-shell";
import { PhonePreview } from "@/components/human/phone-preview";
import { useDraft } from "@/hooks/use-draft";
import { buildAndroidProject, validPackage } from "@/lib/android-project";

export const Route = createFileRoute("/human/android")({
  head: () => ({
    meta: [
      { title: "Build your Android wallet ,  BuildAWallet" },
      { name: "description", content: "Configure and download your custom Android wallet app with biometric unlock and screenshot protection." },
      { property: "og:title", content: "Build your Android wallet ,  BuildAWallet" },
      { property: "og:description", content: "Your wallet build, as an Android app." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AndroidBuild,
});

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "wallet";

function AndroidBuild() {
  const { draft, ready } = useDraft();
  const [origin, setOrigin] = useState("");
  const [appName, setAppName] = useState("");
  const [pkg, setPkg] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [shots, setShots] = useState(true);
  const [ext, setExt] = useState(true);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  useEffect(() => {
    if (ready) { setAppName(draft.name); setPkg(`xyz.buildawallet.${slug(draft.name)}`); }
  }, [ready, draft.name]);

  const walletUrl = origin ? `${origin}/human/wallet` : "";
  const apkUrl = origin ? `${origin}/downloads/BuildAWallet-1.0.0.apk` : "";
  const secureWalletUrl = /^https:\/\//.test(walletUrl);
  const ok = appName.trim().length > 0 && validPackage(pkg) && /^\d+\.\d+\.\d+$/.test(version) && secureWalletUrl;

  async function download() {
    setBusy(true);
    try {
      const [a = 1, b = 0, c = 0] = version.split(".").map(Number);
      const blob = await buildAndroidProject(
        { appName: appName.trim(), packageId: pkg, versionName: version, versionCode: a * 10000 + b * 100 + c, walletUrl, blockScreenshots: shots, allowExternalLinks: ext },
        draft,
      );
      const url = URL.createObjectURL(blob);
      const el = document.createElement("a");
      el.href = url;
      el.download = `${slug(appName)}-android-${version}.zip`;
      el.click();
      URL.revokeObjectURL(url);
      setStep(3);
      toast.success("Android project downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Build failed");
    } finally {
      setBusy(false);
    }
  }

  function downloadApk() {
    if (!apkUrl) return;
    const el = document.createElement("a");
    el.href = apkUrl;
    el.download = "BuildAWallet-1.0.0.apk";
    document.body.appendChild(el);
    el.click();
    el.remove();
    setStep(3);
    toast.success("BuildAWallet Android APK download started");
  }

  return (
    <div className="studio-background min-h-screen">
      <Ticker />
      <div className="mx-auto max-w-6xl px-5 py-10">
        <Link to="/human/deploy" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Deploy options</Link>
        <h1 className="mt-4 text-4xl font-black sm:text-6xl">Android <span className="text-splash">build</span></h1>
        <ol className="mt-6 flex gap-2 text-xs font-semibold">
          {["Configure", "Build", "Install"].map((s, i) => (
            <li key={s} className={`rounded-full px-3 py-1.5 ${step === i + 1 ? "bg-pop text-pop-foreground" : step > i + 1 ? "bg-surface-2" : "text-muted-foreground"}`}>{i + 1}. {s}</li>
          ))}
        </ol>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_auto]">
          <div className="space-y-6">
            {step === 1 && (
              <section className="glass rounded-3xl p-6">
                <h2 className="text-xl font-bold">App details</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold">App name<Input className="mt-1" maxLength={30} value={appName} onChange={(e) => setAppName(e.target.value)} /></label>
                  <label className="text-sm font-semibold">Version<Input className="num mt-1" value={version} onChange={(e) => setVersion(e.target.value)} /></label>
                  <label className="text-sm font-semibold sm:col-span-2">Package ID
                    <Input className="num mt-1" value={pkg} onChange={(e) => setPkg(e.target.value.toLowerCase())} />
                    {!validPackage(pkg) && <span className="mt-1 block text-xs font-normal text-destructive">Use reverse-domain format, e.g. xyz.buildawallet.mywallet</span>}
                  </label>
                </div>
                {!secureWalletUrl && <p className="mt-3 text-xs text-destructive">Publish BuildAWallet on HTTPS before generating a live Android release.</p>}
                <div className="mt-6 space-y-2">
                  <Toggle icon={<Fingerprint className="size-5 text-primary" />} title="Biometric unlock" detail="Fingerprint, face or device PIN on every launch. Always on." checked disabled onChange={() => {}} />
                  <Toggle icon={<ShieldOff className="size-5 text-pop" />} title="Block screenshots" detail="Prevents screen capture and recents previews of your balances and phrase." checked={shots} onChange={setShots} />
                  <Toggle icon={<Smartphone className="size-5 text-zap" />} title="Open explorer links in browser" detail="Tapping a transaction link opens your phone's browser." checked={ext} onChange={setExt} />
                </div>
                <Button size="lg" variant="pop" className="mt-6 w-full" disabled={!ok} onClick={() => setStep(2)}>Continue</Button>
                <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">Official BuildAWallet Android app</p>
                      <p className="mt-1 text-xs text-muted-foreground">Use the finished signed APK now. No Android Studio or build step required.</p>
                    </div>
                    <Button size="sm" variant="outline" disabled={!apkUrl} onClick={downloadApk}><Download />APK</Button>
                  </div>
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="glass rounded-3xl p-6">
                <h2 className="text-xl font-bold">Build package</h2>
                <dl className="mt-4 grid gap-2 text-sm">
                  {[["App", appName], ["Package", pkg], ["Version", version], ["Chains", String(draft.chains.length)], ["Power-ups", String(draft.features.length)], ["Wallet", walletUrl]].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4"><dt className="text-muted-foreground">{k}</dt><dd className="num truncate">{v}</dd></div>
                  ))}
                </dl>
                <p className="mt-4 text-sm text-muted-foreground">You get a complete Android Studio project plus a GitHub Actions pipeline that produces a signed APK and Play Store bundle with checksums. Signing uses your own key, so only you can publish updates.</p>
                <div className="mt-6 flex gap-2">
                  <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                  <Button size="lg" variant="pop" className="flex-1" disabled={busy || !secureWalletUrl} onClick={download}>
                    {busy ? <Loader2 className="animate-spin" /> : <Download />} Download Android project
                  </Button>
                </div>
              </section>
            )}

            {step === 3 && (
              <section className="glass rounded-3xl p-6">
                <h2 className="text-xl font-bold">Install BuildAWallet on Android</h2>
                <div className="mt-5 grid items-center gap-6 sm:grid-cols-[auto_1fr]">
                  <div className="rounded-2xl bg-foreground p-4"><QRCodeSVG value={apkUrl || walletUrl} size={180} /></div>
                  <ol className="space-y-3 text-sm">
                    <li><b>1. Download:</b> use the APK button below or scan the QR code with your Android phone.</li>
                    <li><b>2. Install:</b> if Android asks, allow your browser to install apps from this source, then open BuildAWallet.</li>
                    <li><b>3. Your keys:</b> the app keeps wallet data on the device. Your recovery phrase is never sent to BuildAWallet servers.</li>
                  </ol>
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Button size="lg" variant="pop" onClick={downloadApk} disabled={!apkUrl}><Download />Download official APK</Button>
                  <Button variant="outline" onClick={download}><Download />Build Android project</Button>
                  <Button asChild><Link to="/human/wallet">Open web wallet</Link></Button>
                </div>
              </section>
            )}
          </div>
          <PhonePreview draft={{ ...draft, name: appName || draft.name }} />
        </div>
      </div>
    </div>
  );
}

function Toggle({ icon, title, detail, checked, onChange, disabled }: { icon: React.ReactNode; title: string; detail: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-3">
      <span className="flex items-center gap-3">{icon}<span><span className="block text-sm font-semibold">{title}</span><span className="block text-xs text-muted-foreground">{detail}</span></span></span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </label>
  );
}
