/** Studio catalog. Every feature id here maps to real behavior in the web wallet and Android build. */

export type Skin = {
  id: string;
  name: string;
  vibe: string;
  rarity: "Common" | "Rare" | "Epic" | "Legendary";
  // user-selectable wallet skin colors (data, applied as CSS variables at runtime)
  bg: string;
  surface: string;
  accent: string;
  accent2: string;
  text: string;
};

export const SKINS: Skin[] = [
  { id: "acid", name: "Acid Vault", vibe: "Neon lime on void", rarity: "Common", bg: "#07090a", surface: "#11161a", accent: "#c6ff3d", accent2: "#ff3da8", text: "#f4f7f2" },
  { id: "pixel", name: "Pixel Pop", vibe: "Arcade coral glow", rarity: "Rare", bg: "#140b1d", surface: "#22122f", accent: "#ff7a59", accent2: "#ffd84d", text: "#fff4ee" },
  { id: "gold", name: "Gold Rush", vibe: "Black metal + bullion", rarity: "Legendary", bg: "#0b0906", surface: "#1a150c", accent: "#ffcf4a", accent2: "#ff8a1f", text: "#fff8e6" },
  { id: "circuit", name: "Midnight Circuit", vibe: "Electric blue traces", rarity: "Epic", bg: "#050a17", surface: "#0d1730", accent: "#5fa8ff", accent2: "#3dffd9", text: "#eef4ff" },
  { id: "ocean", name: "Ocean Glass", vibe: "Aqua depth", rarity: "Rare", bg: "#04161c", surface: "#0b2a33", accent: "#5ff0ff", accent2: "#8a7bff", text: "#eafcff" },
  { id: "bubblegum", name: "Bubblegum", vibe: "Hot pink candy", rarity: "Epic", bg: "#1a0614", surface: "#2c0d23", accent: "#ff4fb8", accent2: "#7dff9b", text: "#fff0fa" },
  { id: "matrix", name: "Terminal", vibe: "Green phosphor", rarity: "Common", bg: "#020602", surface: "#0a140a", accent: "#39ff6a", accent2: "#d2ff3d", text: "#d8ffe0" },
  { id: "paper", name: "Clean Paper", vibe: "Light, calm, minimal", rarity: "Common", bg: "#f5f3ee", surface: "#ffffff", accent: "#1b1b1b", accent2: "#ff5a3d", text: "#141414" },
  { id: "sunset", name: "Miami Sunset", vibe: "Orange to violet", rarity: "Legendary", bg: "#160a12", surface: "#2a1220", accent: "#ff9d3d", accent2: "#c34dff", text: "#fff2e8" },
];

export type FeatureCategory = "Core" | "Assets" | "Security" | "Privacy" | "Power tools" | "Style";

export type Feature = {
  id: string;
  name: string;
  detail: string;
  category: FeatureCategory;
  emoji: string;
  core?: boolean; // always on
  rarity: "Common" | "Rare" | "Epic" | "Legendary";
};

export const FEATURES: Feature[] = [
  { id: "send", name: "Send & receive", detail: "Signed locally, broadcast straight to mainnet", category: "Core", emoji: "↗", core: true, rarity: "Common" },
  { id: "portfolio", name: "Multichain portfolio", detail: "One phrase, every selected chain, one total", category: "Core", emoji: "◎", core: true, rarity: "Common" },
  { id: "review", name: "Transaction review", detail: "Full recipient, amount and fee check before signing", category: "Core", emoji: "✓", core: true, rarity: "Common" },
  { id: "qr", name: "QR receive", detail: "Scannable address codes for every chain", category: "Core", emoji: "▦", rarity: "Common" },
  { id: "prices", name: "Live fiat prices", detail: "Real-time market prices in your currency", category: "Assets", emoji: "$", rarity: "Common" },
  { id: "stables", name: "Stablecoin vault", detail: "USDC, USDT and DAI balances and transfers", category: "Assets", emoji: "◈", rarity: "Rare" },
  { id: "watch", name: "Watch-only tracker", detail: "Track any public address without its keys", category: "Assets", emoji: "👁", rarity: "Rare" },
  { id: "activity", name: "Activity log", detail: "Every send from this wallet with explorer links", category: "Assets", emoji: "≡", rarity: "Common" },
  { id: "csv", name: "CSV export", detail: "Download holdings and activity for taxes", category: "Assets", emoji: "⇩", rarity: "Rare" },
  { id: "autolock", name: "Auto-lock timer", detail: "Wipes keys from memory after inactivity", category: "Security", emoji: "⏱", rarity: "Common" },
  { id: "bigsend", name: "Large-send guard", detail: "Type the amount again above your threshold", category: "Security", emoji: "🛡", rarity: "Epic" },
  { id: "newaddr", name: "New-recipient warning", detail: "Flags first-time addresses before you sign", category: "Security", emoji: "⚠", rarity: "Epic" },
  { id: "limit", name: "Session spend limit", detail: "Cap how much fiat value can leave per unlock", category: "Security", emoji: "⛔", rarity: "Legendary" },
  { id: "clipboard", name: "Clipboard wipe", detail: "Clears copied addresses after 60 seconds", category: "Security", emoji: "⌫", rarity: "Rare" },
  { id: "paper", name: "Paper backup", detail: "Print a recovery sheet, offline", category: "Security", emoji: "🖨", rarity: "Rare" },
  { id: "hide", name: "Privacy blur", detail: "Hide balances with one tap", category: "Privacy", emoji: "◐", rarity: "Common" },
  { id: "addressbook", name: "Address book", detail: "Name and reuse trusted contacts", category: "Power tools", emoji: "@", rarity: "Common" },
  { id: "gas", name: "Gas & fee tracker", detail: "Live network fees across your chains", category: "Power tools", emoji: "⛽", rarity: "Rare" },
  { id: "status", name: "Network status", detail: "Live block heights and RPC health", category: "Power tools", emoji: "📡", rarity: "Epic" },
  { id: "btcfee", name: "BTC fee control", detail: "Choose economy, normal or priority sat/vB", category: "Power tools", emoji: "₿", rarity: "Epic" },
  { id: "compact", name: "Compact layout", detail: "Denser rows for power users", category: "Style", emoji: "▤", rarity: "Common" },
  { id: "confetti", name: "Send celebration", detail: "A little party when a transfer lands", category: "Style", emoji: "🎉", rarity: "Legendary" },
];

export type Preset = { id: string; name: string; tagline: string; emoji: string; skin: string; chains: string[]; features: string[] };

export const PRESETS: Preset[] = [
  { id: "degen", name: "Degen Mode", tagline: "Every chain, every tool", emoji: "🚀", skin: "acid",
    chains: ["ethereum", "base", "arbitrum", "optimism", "polygon", "bnb", "avalanche", "solana", "bitcoin", "tron"],
    features: FEATURES.map((f) => f.id) },
  { id: "fortress", name: "Fortress", tagline: "Maximum safety rails", emoji: "🏰", skin: "circuit",
    chains: ["ethereum", "bitcoin"], features: ["send", "portfolio", "review", "qr", "prices", "autolock", "bigsend", "newaddr", "limit", "clipboard", "paper", "hide", "addressbook"] },
  { id: "stacker", name: "Stablecoin Stacker", tagline: "Dollars on cheap chains", emoji: "💵", skin: "ocean",
    chains: ["base", "arbitrum", "polygon", "solana", "tron"], features: ["send", "portfolio", "review", "qr", "prices", "stables", "activity", "csv", "addressbook", "gas"] },
  { id: "hodl", name: "HODL Bitcoin", tagline: "Just sats, done right", emoji: "₿", skin: "gold",
    chains: ["bitcoin"], features: ["send", "portfolio", "review", "qr", "prices", "btcfee", "autolock", "paper", "hide"] },
];

export const CURRENCIES = ["usd", "eur", "gbp", "jpy", "cad", "aud", "chf", "inr", "brl"] as const;
export const AVATARS = ["🦊", "🐸", "🦄", "🐳", "🦍", "🐉", "👾", "🤖", "💎", "🔥", "🌙", "⚡"];
export const MEMES = ["WAGMI", "GM", "HODL", "LFG", "WEN MOON", "NOT YOUR KEYS", "DYOR", "FEW UNDERSTAND", "SER", "BULLISH"];

export type Draft = {
  name: string;
  avatar: string;
  skin: string;
  custody: "fresh" | "restore";
  phraseLength: 12 | 24;
  chains: string[];
  features: string[];
  autoLockMin: number;
  bigSendUsd: number;
  sessionLimitUsd: number;
  currency: (typeof CURRENCIES)[number];
  platform: "web" | "android" | "both";
};

export const DEFAULT_DRAFT: Draft = {
  name: "My Wallet",
  avatar: "🦊",
  skin: "acid",
  custody: "fresh",
  phraseLength: 12,
  chains: ["ethereum", "base", "solana", "bitcoin"],
  features: ["send", "portfolio", "review", "qr", "prices", "stables", "activity", "autolock", "newaddr", "hide", "addressbook"],
  autoLockMin: 10,
  bigSendUsd: 1000,
  sessionLimitUsd: 5000,
  currency: "usd",
  platform: "both",
};

export const skinById = (id: string) => SKINS.find((s) => s.id === id) ?? SKINS[0]!;
export const has = (d: Draft, f: string) => d.features.includes(f) || FEATURES.find((x) => x.id === f)?.core === true;
