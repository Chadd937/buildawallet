import { isAddress as isSolanaAddress } from "@solana/addresses";

export type MachineFamily = "evm" | "solana" | "bitcoin";
export type MachineChain = {
  id: string; name: string; family: MachineFamily; symbol: string; decimals: number;
  chainId?: number; env: string; fallback: string; explorer: string;
  stablecoin?: { symbol: string; address: string; decimals: number };
};

export const MACHINE_CHAINS: readonly MachineChain[] = [
  { id: "ethereum", name: "Ethereum", family: "evm", symbol: "ETH", decimals: 18, chainId: 1, env: "ETHEREUM_RPC_URL", fallback: "https://ethereum-rpc.publicnode.com", explorer: "https://etherscan.io", stablecoin: { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 } },
  { id: "base", name: "Base", family: "evm", symbol: "ETH", decimals: 18, chainId: 8453, env: "BASE_RPC_URL", fallback: "https://mainnet.base.org", explorer: "https://basescan.org", stablecoin: { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 } },
  { id: "arbitrum", name: "Arbitrum", family: "evm", symbol: "ETH", decimals: 18, chainId: 42161, env: "ARBITRUM_RPC_URL", fallback: "https://arb1.arbitrum.io/rpc", explorer: "https://arbiscan.io", stablecoin: { symbol: "USDC", address: "0xaf88d065e77c8C2239327C5EDb3A432268e5831", decimals: 6 } },
  { id: "optimism", name: "Optimism", family: "evm", symbol: "ETH", decimals: 18, chainId: 10, env: "OPTIMISM_RPC_URL", fallback: "https://mainnet.optimism.io", explorer: "https://optimistic.etherscan.io", stablecoin: { symbol: "USDC", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 } },
  { id: "polygon", name: "Polygon", family: "evm", symbol: "POL", decimals: 18, chainId: 137, env: "POLYGON_RPC_URL", fallback: "https://polygon-rpc.com", explorer: "https://polygonscan.com", stablecoin: { symbol: "USDC", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 } },
  { id: "bnb", name: "BNB Chain", family: "evm", symbol: "BNB", decimals: 18, chainId: 56, env: "BNB_RPC_URL", fallback: "https://bsc-dataseed.bnbchain.org", explorer: "https://bscscan.com", stablecoin: { symbol: "USDC", address: "0x8AC76a51cc950982D68b83f1D09cd849c35F18", decimals: 18 } },
  { id: "avalanche", name: "Avalanche", family: "evm", symbol: "AVAX", decimals: 18, chainId: 43114, env: "AVALANCHE_RPC_URL", fallback: "https://api.avax.network/ext/bc/C/rpc", explorer: "https://snowtrace.io", stablecoin: { symbol: "USDC", address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", decimals: 6 } },
  { id: "solana", name: "Solana", family: "solana", symbol: "SOL", decimals: 9, env: "SOLANA_RPC_URL", fallback: "https://solana-rpc.publicnode.com", explorer: "https://solscan.io", stablecoin: { symbol: "USDC", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 } },
  { id: "bitcoin", name: "Bitcoin", family: "bitcoin", symbol: "BTC", decimals: 8, env: "BITCOIN_API_URL", fallback: "https://mempool.space/api", explorer: "https://mempool.space" },] as const;

export type MachineChainId = "ethereum" | "base" | "arbitrum" | "optimism" | "polygon" | "bnb" | "avalanche" | "solana" | "bitcoin";
export const machineChain = (id: string) => MACHINE_CHAINS.find((chain) => chain.id === id);
export const rpcUrl = (chain: MachineChain) => process.env[chain.env]?.trim() || chain.fallback;

export function validAddress(chain: MachineChain, value: string) {
  if (chain.family === "evm") return /^0x[0-9a-fA-F]{40}$/.test(value);
  if (chain.family === "solana") return isSolanaAddress(value);
  if (chain.family === "bitcoin") return /^(bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(value);
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
}
