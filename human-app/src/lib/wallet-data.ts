export type WalletDraft = {
  name: string;
  avatar: string;
  custody: string;
  chains: string[];
  security: string[];
  features: string[];
  theme: string;
};

export const defaultDraft: WalletDraft = {
  name: "Nova Wallet",
  avatar: "N",
  custody: "Self custody",
  chains: ["Ethereum", "Base", "Polygon"],
  security: ["Android Keystore", "Recovery phrase", "Transaction review"],
  features: ["Send & receive", "Multi-network balances", "Local transaction signing"],
  theme: "Acid Vault",
};

export const chainOptions = [
  ["Ethereum", "ETH", "Apps, tokens, and collectibles"],
  ["Base", "BASE", "Low-cost Ethereum layer 2"],
  ["Arbitrum", "ARB", "Ethereum scaling and DeFi"],
  ["Polygon", "POL", "Gaming, payments, and apps"],
  ["Optimism", "OP", "Superchain ecosystem"],
  ["Avalanche", "AVAX", "Avalanche C-Chain"],
  ["BNB Chain", "BNB", "Broad token and app support"],
] as const;

export const featureGroups = [
  { key: "Wallet", items: [
    ["Send & receive", "Native mainnet transfers with explicit review", "↗"],
    ["Multi-network balances", "Read the same self-custody account across selected EVM chains", "◎"],
    ["Local transaction signing", "Sign on the Android device; keys never leave it", "✓"],
  ]},
  { key: "Recovery", items: [
    ["Recovery phrase backup", "Show and back up the BIP-39 phrase on-device", "KEY"],
    ["Wallet restore", "Restore an existing BIP-39 recovery phrase", "↻"],
    ["Local wallet erase", "Remove encrypted wallet material from the device", "×"],
  ]},
  { key: "Build", items: [
    ["Custom wallet identity", "Carry the Studio wallet name and avatar into the app design", "◌"],
    ["Theme metadata", "Carry the selected Studio skin into the Android wallet", "◇"],
    ["Network selection", "Only show the live networks selected during setup", "⌘"],
  ]},
] as const;

export const presets = [
  { name: "Everyday EVM", detail: "Simple self-custody send and receive", score: 96, features: ["Send & receive", "Multi-network balances", "Recovery phrase backup"] },
  { name: "Local Vault", detail: "On-device signing and recovery first", score: 98, features: ["Local transaction signing", "Recovery phrase backup", "Local wallet erase"] },
  { name: "Multichain Core", detail: "One EVM account across selected networks", score: 94, features: ["Multi-network balances", "Network selection", "Send & receive"] },
];
