import { useCallback, useEffect, useState } from "react";
import { DEFAULT_DRAFT, FEATURES, type Draft } from "@/lib/catalog";

const KEY = "baw-draft-v2";
const listeners = new Set<(d: Draft) => void>();

export function readDraft(): Draft {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_DRAFT;
    const d = { ...DEFAULT_DRAFT, ...JSON.parse(raw) } as Draft;
    const core = FEATURES.filter((f) => f.core).map((f) => f.id);
    d.features = Array.from(new Set([...core, ...d.features]));
    if (!d.chains.length) d.chains = DEFAULT_DRAFT.chains;
    return d;
  } catch {
    return DEFAULT_DRAFT;
  }
}

export function useDraft() {
  const [draft, setState] = useState<Draft>(DEFAULT_DRAFT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(readDraft());
    setReady(true);
    const l = (d: Draft) => setState(d);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);

  const update = useCallback((patch: Partial<Draft> | ((d: Draft) => Partial<Draft>)) => {
    const cur = readDraft();
    const next = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) };
    localStorage.setItem(KEY, JSON.stringify(next));
    listeners.forEach((l) => l(next));
  }, []);

  return { draft, update, ready };
}
