export type ChainFamily = "evm" | "solana" | "bitcoin";

export type TokenDef = { symbol: string; name: string; address: string; decimals: number; custom?: boolean };

export type ChainDef = {
  id: string;
  name: string;
  family: ChainFamily;
  symbol: string;
  decimals: number;
  coingeckoId: string;
  chainId?: number;
  rpc: string[];
  explorer: string; // base URL; address/tx paths appended
  explorerTx: (hash: string) => string;
  explorerAddress: (addr: string) => string;
  tokens: TokenDef[];
  tagline: string;
  hue: number; // used only for decorative chain chips
};

const evm = (
  id: string,
  name: string,
  chainId: number,
  symbol: string,
  coingeckoId: string,
  rpc: string[],
  explorer: string,
  tokens: TokenDef[],
  tagline: string,
  hue: number,
): ChainDef => ({
  id, name, family: "evm", symbol, decimals: 18, coingeckoId, chainId, rpc, explorer,
  explorerTx: (h) => `${explorer}/tx/${h}`,
  explorerAddress: (a) => `${explorer}/address/${a}`,
  tokens, tagline, hue,
});

export const CHAINS: ChainDef[] = [
  evm("ethereum", "Ethereum", 1, "ETH", "ethereum",
    ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com", "https://cloudflare-eth.com"],
    "https://etherscan.io",
    [
      { symbol: "USDC", name: "USD Coin", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
      { symbol: "USDT", name: "Tether USD", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
      { symbol: "DAI", name: "Dai", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
    ], "The settlement layer", 230),
  evm("base", "Base", 8453, "ETH", "ethereum",
    ["https://mainnet.base.org", "https://base-rpc.publicnode.com"],
    "https://basescan.org",
    [{ symbol: "USDC", name: "USD Coin", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 }],
    "Cheap, fast L2", 220),
  evm("arbitrum", "Arbitrum", 42161, "ETH", "ethereum",
    ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com"],
    "https://arbiscan.io",
    [
      { symbol: "USDC", name: "USD Coin", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
      { symbol: "USDT", name: "Tether USD", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
    ], "DeFi powerhouse", 210),
  evm("optimism", "Optimism", 10, "ETH", "ethereum",
    ["https://mainnet.optimism.io", "https://optimism-rpc.publicnode.com"],
    "https://optimistic.etherscan.io",
    [{ symbol: "USDC", name: "USD Coin", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 }],
    "Superchain native", 10),
  evm("polygon", "Polygon", 137, "POL", "polygon-ecosystem-token",
    ["https://polygon-rpc.com", "https://polygon-bor-rpc.publicnode.com"],
    "https://polygonscan.com",
    [
      { symbol: "USDC", name: "USD Coin", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
      { symbol: "USDT", name: "Tether USD", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 },
    ], "Payments & gaming", 280),
  evm("bnb", "BNB Chain", 56, "BNB", "binancecoin",
    ["https://bsc-dataseed.bnbchain.org", "https://bsc-rpc.publicnode.com"],
    "https://bscscan.com",
    [
      { symbol: "USDT", name: "Tether USD", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
      { symbol: "USDC", name: "USD Coin", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
    ], "Huge token universe", 85),
  evm("avalanche", "Avalanche", 43114, "AVAX", "avalanche-2",
    ["https://api.avax.network/ext/bc/C/rpc", "https://avalanche-c-chain-rpc.publicnode.com"],
    "https://snowtrace.io",
    [{ symbol: "USDC", name: "USD Coin", address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", decimals: 6 }],
    "Sub-second finality", 15),
  {
    id: "solana", name: "Solana", family: "solana", symbol: "SOL", decimals: 9, coingeckoId: "solana",
    rpc: [], explorer: "https://solscan.io",
    explorerTx: (h) => `https://solscan.io/tx/${h}`,
    explorerAddress: (a) => `https://solscan.io/account/${a}`,
    tokens: [{ symbol: "USDC", name: "USD Coin", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 }],
    tagline: "High-speed L1", hue: 160,
  },
  {
    id: "bitcoin", name: "Bitcoin", family: "bitcoin", symbol: "BTC", decimals: 8, coingeckoId: "bitcoin",
    rpc: ["https://mempool.space/api", "https://blockstream.info/api"], explorer: "https://mempool.space",
    explorerTx: (h) => `https://mempool.space/tx/${h}`,
    explorerAddress: (a) => `https://mempool.space/address/${a}`,
    tokens: [], tagline: "Native SegWit", hue: 45,
  },
  {
    id: "tron", name: "Tron", family: "tron", symbol: "TRX", decimals: 6, coingeckoId: "tron",
    rpc: ["https://api.trongrid.io"], explorer: "https://tronscan.org",
    explorerTx: (h) => `https://tronscan.org/#/transaction/${h}`,
    explorerAddress: (a) => `https://tronscan.org/#/address/${a}`,
    tokens: [{ symbol: "USDT", name: "Tether USD", address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", decimals: 6 }],
    tagline: "Stablecoin highway", hue: 0,
  },
];

export const chainById = (id: string) => CHAINS.find((c) => c.id === id);
