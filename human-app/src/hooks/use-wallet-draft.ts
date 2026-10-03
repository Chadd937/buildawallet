import { useCallback, useEffect, useState } from "react";
import { defaultDraft, type WalletDraft } from "@/lib/wallet-data";

const STORAGE_KEY = "buildawallet-human-draft-v1";

function migrateDraft(value: Partial<WalletDraft>): WalletDraft {
  const security = Array.isArray(value.security)
    ? value.security.map((item) => item === "Android Keystore" ? "Browser vault" : item)
    : defaultDraft.security;
  return {
    ...defaultDraft,
    ...value,
    security: Array.from(new Set(security)),
  };
}

export function useWalletDraft() {
  const [draft, setDraftState] = useState<WalletDraft>(defaultDraft);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const migrated = migrateDraft(JSON.parse(stored));
        setDraftState(migrated);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      }
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
