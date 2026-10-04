import { DEFAULT_DRAFT, FEATURES, SKINS, CURRENCIES, AVATARS, type Draft } from "@/lib/catalog";
import { CHAINS } from "@/lib/wallet/chains";

/** Wallet build backup: the design only (name, look, chains, power-ups, limits). Never contains keys. */
export const BUILD_BACKUP_TYPE = "buildawallet-build";
export const BUILD_BACKUP_VERSION = 1;

export function buildBackupJson(d: Draft) {
  return JSON.stringify({ type: BUILD_BACKUP_TYPE, version: BUILD_BACKUP_VERSION, savedAt: new Date().toISOString(), build: d }, null, 2);
}

export function downloadBuildBackup(d: Draft) {
  const blob = new Blob([buildBackupJson(d)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const slug = d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "wallet";
  a.href = url;
  a.download = `${slug}.buildawallet.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const num = (v: unknown, min: number, max: number, dflt: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;

export function parseBuildBackup(text: string): Draft {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("That file isn't a BuildAWallet build backup."); }
  const o = raw as { type?: unknown; build?: Partial<Record<keyof Draft, unknown>> };
  if (!o || o.type !== BUILD_BACKUP_TYPE || typeof o.build !== "object" || !o.build) throw new Error("That file isn't a BuildAWallet build backup.");
  const b = o.build;
  const chainIds = new Set(CHAINS.map((c) => c.id));
  const featIds = new Set(FEATURES.map((f) => f.id));
  const chains = Array.isArray(b.chains) ? b.chains.filter((c): c is string => typeof c === "string" && chainIds.has(c)) : [];
  const features = Array.isArray(b.features) ? b.features.filter((f): f is string => typeof f === "string" && featIds.has(f)) : [];
  return {
    ...DEFAULT_DRAFT,
    name: typeof b.name === "string" && b.name.trim() ? b.name.slice(0, 24) : DEFAULT_DRAFT.name,
    avatar: typeof b.avatar === "string" && (AVATARS as readonly string[]).includes(b.avatar) ? b.avatar : DEFAULT_DRAFT.avatar,
    skin: typeof b.skin === "string" && SKINS.some((s) => s.id === b.skin) ? b.skin : DEFAULT_DRAFT.skin,
    phraseLength: b.phraseLength === 24 ? 24 : 12,
    chains: chains.length ? chains : DEFAULT_DRAFT.chains,
    features: features.length ? features : DEFAULT_DRAFT.features,
    autoLockMin: num(b.autoLockMin, 1, 60, DEFAULT_DRAFT.autoLockMin),
    bigSendUsd: num(b.bigSendUsd, 50, 20000, DEFAULT_DRAFT.bigSendUsd),
    sessionLimitUsd: num(b.sessionLimitUsd, 100, 100000, DEFAULT_DRAFT.sessionLimitUsd),
    currency: typeof b.currency === "string" && (CURRENCIES as readonly string[]).includes(b.currency) ? (b.currency as Draft["currency"]) : DEFAULT_DRAFT.currency,
    platform: b.platform === "web" || b.platform === "android" ? b.platform : "both",
  };
}
