export const ORIGIN = "https://buildawallet.xyz";

export const BASE_COLLECTOR = "0xBcCA6AED433d9020C50D44560F9679F1B5eB511d";
export const SOLANA_COLLECTOR = "Ew8mbrKwD6LGaSX28a6XGmXqeQSs2hykRibjXVhftTRC";
export const BITCOIN_COLLECTOR = "bc1p8rqzak39nf7rk95z4x0jwvscp45x2yu5mazzu70jf9nslyqppdpsnv3l37";
export const EVM_MAINNETS = {
  ethereum: "eip155:1",
  base: "eip155:8453",
  arbitrum: "eip155:42161",
  optimism: "eip155:10",
  polygon: "eip155:137",
  bnb: "eip155:56",
  avalanche: "eip155:43114",
} as const;
export const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
export const BITCOIN_MAINNET = "bip122:000000000019d6689c085ae165831e934ff763ae46a2e3b6c5c2b0c1f4f4f";

export const BASE_MAINNET = EVM_MAINNETS.base;
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const SOLANA_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SOLANA_COLLECTOR_ATA = "Hp6uUt3RmYYVmeSYyf6LpimgddHbL9QJ1LG9TbK5pJiQ";

export const PLANS = {
  builder: {
    id: "builder",
    name: "Starter",
    priceUSDC: "15.00",
    amountAtomic: 15_000_000n,
    units: 100_000,
    batchLimit: 0,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceUSDC: "49.00",
    amountAtomic: 49_000_000n,
    units: 500_000,
    batchLimit: 10,
  },
  scale: {
    id: "scale",
    name: "Scale",
    priceUSDC: "149.00",
    amountAtomic: 149_000_000n,
    units: 2_000_000,
    batchLimit: 50,
  },
} as const;
export type PlanId = keyof typeof PLANS;
export const publicPlans = () =>
  Object.values(PLANS).map(({ amountAtomic: _hidden, ...plan }) => ({ ...plan, durationDays: 30 }));
export const planById = (value: unknown) =>
  typeof value === "string" && Object.hasOwn(PLANS, value) ? PLANS[value as PlanId] : null;

export const FREE_UNITS = 1_000;
export const FREE_PLAN_ID = "free";

export const PAYMENT_CHAINS = [
  "ethereum",
  "base",
  "arbitrum",
  "optimism",
  "polygon",
  "bnb",
  "avalanche",
  "solana",
  "bitcoin",
] as const;
export type PaymentChain = (typeof PAYMENT_CHAINS)[number];

export const PAYMENT_RAILS = {
  ethereum: {
    network: EVM_MAINNETS.ethereum,
    asset: "USDC",
    assetAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    decimals: 6,
    collector: BASE_COLLECTOR,
  },
  base: {
    network: EVM_MAINNETS.base,
    asset: "USDC",
    assetAddress: BASE_USDC,
    decimals: 6,
    collector: BASE_COLLECTOR,
  },
  arbitrum: {
    network: EVM_MAINNETS.arbitrum,
    asset: "USDC",
    assetAddress: "0xaf88d065e77c8C2239327C5EDb3A432268e5831",
    decimals: 6,
    collector: BASE_COLLECTOR,
  },
  optimism: {
    network: EVM_MAINNETS.optimism,
    asset: "USDC",
    assetAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    decimals: 6,
    collector: BASE_COLLECTOR,
  },
  polygon: {
    network: EVM_MAINNETS.polygon,
    asset: "USDC",
    assetAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    decimals: 6,
    collector: BASE_COLLECTOR,
  },
  bnb: {
    network: EVM_MAINNETS.bnb,
    asset: "USDC",
    assetAddress: "0x8AC76a51cc950982D68b83f1D09cd849c35F18",
    decimals: 18,
    collector: BASE_COLLECTOR,
  },
  avalanche: {
    network: EVM_MAINNETS.avalanche,
    asset: "USDC",
    assetAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    decimals: 6,
    collector: BASE_COLLECTOR,
  },
  solana: {
    network: SOLANA_MAINNET,
    asset: "USDC",
    assetAddress: SOLANA_USDC,
    decimals: 6,
    collector: SOLANA_COLLECTOR,
  },
  bitcoin: {
    network: BITCOIN_MAINNET,
    asset: "BTC",
    assetAddress: null,
    decimals: 8,
    collector: BITCOIN_COLLECTOR,
  },
} as const;

export const X402_PRICE_USD = "$0.01";
export const AGENT_SETTLEMENT_THRESHOLD_ATOMIC = "1000000";
export const PREPAID_BILLING = {
  mode: "prepaid",
  perRequestOnchainPayment: true,
  plans: "/machine/v1/plans",
  x402: "/machine/v1/{chain}/...",
  dashboard: "/nonhuman/dashboard",
  agentAccount: "/machine/v1/agent/account?chain={chain}&wallet={address}",
  accountingBatchThresholdUSD: "1.00",
  paymentChains: PAYMENT_CHAINS,
  paymentRails: PAYMENT_RAILS,
  x402Chains: ["ethereum", "base", "arbitrum", "optimism", "polygon", "bnb", "avalanche", "solana"] as const,
} as const;

export function paymentRail(chain: string) {
  if (Object.hasOwn(PAYMENT_RAILS, chain)) return PAYMENT_RAILS[chain as PaymentChain];
  throw new RangeError("Payment collection is not configured for this network.");
}
export function paymentCollector(chain: string) {
  return paymentRail(chain).collector;
}
