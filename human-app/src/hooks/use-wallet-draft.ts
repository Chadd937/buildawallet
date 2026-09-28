import { useCallback, useEffect, useState } from "react";
import { defaultDraft, type WalletDraft } from "@/lib/wallet-data";

const STORAGE_KEY = "buildawallet-human-draft-v1";

export function useWalletDraft() {
  const [draft, setDraftState] = useState<WalletDraft>(defaultDraft);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setDraftState({ ...defaultDraft, ...JSON.parse(stored) });
    } catch {
      setDraftState(defaultDraft);
    }
    setReady(true);
  }, []);

  const setDraft = useCallback((next: WalletDraft | ((current: WalletDraft) => WalletDraft)) => {
    setDraftState((current) => {
      const value = typeof next === "function" ? next(current) : next;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      return value;
    });
  }, []);

  return { draft, setDraft, ready };
}
