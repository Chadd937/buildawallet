/** Non-secret, browser-local wallet data (activity, contacts, watch list). */
import type { ChainDef, TokenDef } from "./chains";

export type Activity = { hash: string; chainId: string; symbol: string; amount: string; to: string; at: number };
export type Contact = { name: string; address: string; chainId: string };
export type Watch = { label: string; address: string; chainId: string };
export type CustomToken = TokenDef & { chainId: string; custom: true };

function read<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
const write = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));

export const store = {
  activity: () => read<Activity[]>("baw-activity", []),
  addActivity: (a: Activity) => write("baw-activity", [a, ...store.activity()].slice(0, 500)),
  contacts: () => read<Contact[]>("baw-contacts", []),
  setContacts: (c: Contact[]) => write("baw-contacts", c),
  watch: () => read<Watch[]>("baw-watch", []),
  setWatch: (w: Watch[]) => write("baw-watch", w),
  customTokens: () => read<CustomToken[]>("baw-custom-tokens", []),
  setCustomTokens: (tokens: CustomToken[]) => write("baw-custom-tokens", tokens),
  tokensFor: (chainId: string) => store.customTokens().filter((token) => token.chainId === chainId),
  knownRecipient: (addr: string) =>
    store.activity().some((a) => a.to.toLowerCase() === addr.toLowerCase()) ||
    store.contacts().some((c) => c.address.toLowerCase() === addr.toLowerCase()),
  clearAll: () => ["baw-activity", "baw-contacts", "baw-watch", "baw-custom-tokens"].forEach((k) => localStorage.removeItem(k)),
};

export function withCustomTokens(chain: ChainDef, customTokens: CustomToken[]): ChainDef {
  const extra = customTokens
    .filter((token) => token.chainId === chain.id)
    .filter((token) => !chain.tokens.some((listed) => listed.address.toLowerCase() === token.address.toLowerCase()))
    .map(({ chainId: _chainId, ...token }) => token);
  return extra.length ? { ...chain, tokens: [...chain.tokens, ...extra] } : chain;
}

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
