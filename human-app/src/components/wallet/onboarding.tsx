import { useMemo, useState } from "react";
import { Eye, FileUp, KeyRound, Loader2, ShieldCheck, WandSparkles } from "lucide-react";
import { parseBuildBackup } from "@/lib/wallet/build-backup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Draft } from "@/lib/catalog";
import { isValidMnemonic, newMnemonic } from "@/lib/wallet/derive";
import { saveDeviceVault, unlockVault } from "@/lib/wallet/vault";

export function Onboarding({ draft, onReady, onImportBuild }: { draft: Draft; onReady: (phrase: string) => void; onImportBuild: (d: Draft) => void }) {
  const [mode, setMode] = useState<"fresh" | "restore" | "build">(draft.custody);
  const [step, setStep] = useState<"show" | "verify" | "password">(draft.custody === "restore" ? "password" : "show");
  const [len, setLen] = useState<12 | 24>(draft.phraseLength);
  const phrase = useMemo(() => newMnemonic(len === 24 ? 256 : 128), [len]);
  const [buildMsg, setBuildMsg] = useState("");
  const [reveal, setReveal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [restoreText, setRestoreText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const words = phrase.split(" ");
  const checks = useMemo(() => {
    const idx = new Set<number>();
    const r = crypto.getRandomValues(new Uint32Array(8));
    for (const n of r) { if (idx.size < 3) idx.add(n % words.length); }
    return [...idx].sort((a, b) => a - b);
  }, [words.length]);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  const finalPhrase = mode === "fresh" ? phrase : restoreText;
  const canSave = mode === "fresh" || isValidMnemonic(restoreText);

  async function create() {
    setBusy(true);
    setErr("");
    try {
      onReady(await saveDeviceVault(finalPhrase, draft.name));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create the wallet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 text-foreground">
      <div className="mb-8 text-center">
        <p className="num text-xs uppercase tracking-widest text-primary">Choose how to begin</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">Open your wallet your way</h1>
        <p className="mt-2 text-sm text-foreground">Your keys are created and encrypted on this device. They never go to our servers.</p>
      </div>
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        {(["fresh", "restore", "build"] as const).map((m) => {
          const details = m === "fresh" ? [WandSparkles, "Create new", "Generate new recovery words"] : m === "restore" ? [KeyRound, "Restore phrase", "Use 12 or 24 words"] : [FileUp, "Import build", "Load your Studio choices"];
          const Icon = details[0] as typeof WandSparkles;
          return <Button key={m} type="button" variant={mode === m ? "skin" : "skinGhost"} onClick={() => { setMode(m); setStep(m === "fresh" ? "show" : "password"); }} className="h-auto min-h-28 flex-col whitespace-normal p-4 text-center">
            <Icon className="size-7" /><span className="font-bold">{details[1] as string}</span><span className="text-xs font-normal text-foreground">{details[2] as string}</span>
          </Button>;
        })}
      </div>

      {mode === "build" && (
        <section>
          <h1 className="text-3xl font-bold">Import a build backup</h1>
          <p className="mt-2 text-sm text-foreground">Load the .buildawallet.json file you saved on the deploy page. It restores your wallet's name, look, chains, power-ups and limits. Then create new keys or restore your phrase.</p>
          <label className="mt-6 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed p-8 text-sm font-semibold skin-border skin-surface">
            <FileUp className="size-6" /> Choose build backup file
            <input type="file" accept=".json,application/json" className="sr-only" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try { const d = parseBuildBackup(await f.text()); onImportBuild(d); setLen(d.phraseLength); setBuildMsg(`Loaded “${d.name}” · ${d.chains.length} chains · ${d.features.length} power-ups`); setErr(""); setMode("fresh"); setStep("show"); }
              catch (x) { setBuildMsg(""); setErr(x instanceof Error ? x.message : "Could not read that file."); }
              e.target.value = "";
            }} />
          </label>
          {buildMsg && <p className="mt-3 text-sm skin-accent-text">{buildMsg}</p>}
          {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
        </section>
      )}

      {mode === "fresh" && step === "show" && (
        <section>
          {buildMsg && (
            <p className="mb-4 rounded-xl border px-3 py-2 text-sm skin-border skin-surface">
              <span className="skin-accent-text">{buildMsg}</span> ,  new keys below, or{" "}
              <button type="button" className="underline" onClick={() => { setMode("restore"); setStep("password"); }}>use my existing phrase</button>.
            </p>
          )}
          {!reveal && (
            <div className="mb-4 flex gap-2">
              {([12, 24] as const).map((n) => (
                <button key={n} type="button" onClick={() => setLen(n)} className={`flex-1 rounded-xl border py-2 text-sm font-semibold skin-border ${len === n ? "skin-accent" : "skin-surface"}`}>{n} words</button>
              ))}
            </div>
          )}
          <h1 className="text-3xl font-bold">Your recovery phrase</h1>
          <p className="mt-2 text-sm text-foreground">Write these {words.length} words on paper, in order. Anyone with them controls your funds. Never type them into a website or share them.</p>
          <div className="relative mt-6">
            <ol className={`grid grid-cols-3 gap-2 ${reveal ? "" : "select-none blur-md"}`}>
              {words.map((w, i) => (
                <li key={i} className="num rounded-lg border px-2 py-2 text-sm skin-border skin-surface"><span>{i + 1}.</span> {w}</li>
              ))}
            </ol>
            {!reveal && (
              <button onClick={() => setReveal(true)} className="absolute inset-0 grid place-items-center text-sm font-bold">
                <span className="rounded-xl px-4 py-2 skin-accent"><Eye className="mr-2 inline size-4" />Reveal (make sure nobody is watching)</span>
              </button>
            )}
          </div>
          <label className="mt-5 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I wrote it down offline
          </label>
          <Button variant="skin" size="lg" className="mt-5 w-full" disabled={!reveal || !saved} onClick={() => setStep("verify")}>Continue</Button>
        </section>
      )}

      {mode === "fresh" && step === "verify" && (
        <section>
          <h1 className="text-3xl font-bold">Prove you saved it</h1>
          <p className="mt-2 text-sm text-foreground">Type the requested words.</p>
          <div className="mt-6 space-y-3">
            {checks.map((i) => (
              <label key={i} className="block text-sm">
                Word #{i + 1}
                <Input autoCapitalize="none" autoComplete="off" spellCheck={false} className="mt-1 h-11 rounded-xl" value={answers[i] ?? ""} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value.trim().toLowerCase() })} />
              </label>
            ))}
          </div>
          <div className="mt-5 flex gap-2">
            <Button variant="skinGhost" onClick={() => setStep("show")}>Back</Button>
            <Button variant="skin" className="flex-1" disabled={!checks.every((i) => answers[i] === words[i])} onClick={create}>{busy ? <Loader2 className="animate-spin" /> : null}Verified · open wallet</Button>
          </div>
        </section>
      )}

      {mode !== "build" && step === "password" && (
        <section>
          <h1 className="text-3xl font-bold">{mode === "fresh" ? "Open your wallet" : "Restore your wallet"}</h1>
          <p className="mt-2 text-sm text-foreground">Your phrase is encrypted on this device only, with a key that never leaves this browser. Your phrase is the backup.</p>
          {mode === "restore" && (
            <Textarea autoCapitalize="none" autoComplete="off" spellCheck={false} rows={4} placeholder="Enter your 12 or 24 words separated by spaces"
              value={restoreText} onChange={(e) => setRestoreText(e.target.value)} className="num mt-5 rounded-xl" />
          )}
          {mode === "restore" && restoreText.trim() && !isValidMnemonic(restoreText) && <p className="mt-2 text-xs text-destructive">Not a valid BIP-39 phrase yet.</p>}
          {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
          <Button variant="skin" size="lg" className="mt-6 w-full" disabled={!canSave || busy} onClick={create}>
            {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />} {busy ? "Encrypting…" : (mode === "fresh" ? "Open my wallet" : "Restore wallet")}
          </Button>
        </section>
      )}
    </div>
  );
}

export function UnlockScreen({ name, avatar, onUnlock, onForget }: { name: string; avatar: string; onUnlock: (phrase: string) => void; onForget: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid min-h-[80vh] place-items-center px-5">
      <form className="w-full max-w-sm text-center" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        try { onUnlock(await unlockVault(pw)); } catch (x) { setErr(x instanceof Error ? x.message : "Unlock failed"); } finally { setBusy(false); setPw(""); }
      }}>
        <div className="mx-auto grid size-20 place-items-center rounded-3xl text-4xl skin-surface">{avatar}</div>
        <h1 className="mt-4 text-2xl font-bold">{name}</h1>
        <p className="text-sm skin-muted">Locked</p>
        <Input autoFocus type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} className="mt-6 h-12 rounded-xl" autoComplete="current-password" />
        {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
        <Button variant="skin" size="lg" className="mt-4 w-full" disabled={!pw || busy}>{busy ? <Loader2 className="animate-spin" /> : "Unlock"}</Button>
        <button type="button" onClick={onForget} className="mt-6 text-xs skin-muted underline">Forgot password? Restore with phrase</button>
      </form>
    </div>
  );
}
