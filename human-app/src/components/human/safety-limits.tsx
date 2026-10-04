import { Slider } from "@/components/ui/slider";
import { useDraft } from "@/hooks/use-draft";
import { CURRENCIES } from "@/lib/catalog";

export function SafetyLimits() {
  const { draft, update } = useDraft();
  return (
    <section className="border-t border-border px-5 py-12">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-2xl font-black sm:text-3xl">Safety rails</h2>
        <p className="mt-1 text-sm text-muted-foreground">Real limits enforced inside your deployed wallet.</p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-sm font-semibold">Auto-lock after <span className="num text-primary">{draft.autoLockMin} min</span></p>
            <Slider className="mt-3" min={1} max={60} step={1} value={[draft.autoLockMin]} onValueChange={([v]) => v !== undefined && update({ autoLockMin: v })} />
          </div>
          <div>
            <p className="text-sm font-semibold">Large-send warning above <span className="num text-primary">${draft.bigSendUsd.toLocaleString()}</span></p>
            <Slider className="mt-3" min={50} max={20000} step={50} value={[draft.bigSendUsd]} onValueChange={([v]) => v !== undefined && update({ bigSendUsd: v })} />
          </div>
          <div>
            <p className="text-sm font-semibold">Session limit <span className="num text-primary">${draft.sessionLimitUsd.toLocaleString()}</span></p>
            <Slider className="mt-3" min={100} max={100000} step={100} value={[draft.sessionLimitUsd]} onValueChange={([v]) => v !== undefined && update({ sessionLimitUsd: v })} />
          </div>
          <div>
            <p className="text-sm font-semibold">Display currency</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CURRENCIES.map((c) => (
                <button key={c} type="button" onClick={() => update({ currency: c })}
                  className={`num rounded-lg px-2.5 py-1 text-xs uppercase ${draft.currency === c ? "bg-primary text-primary-foreground" : "bg-surface-2"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
