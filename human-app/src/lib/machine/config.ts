export const ORIGIN = "https://buildawallet.xyz";
export const BASE_COLLECTOR = "0xBcCA6AED433d9020C50D44560F9679F1B5eB511d";
export const SOLANA_COLLECTOR = "Ew8mbrKwD6LGaSX28a6XGmXqeQSs2hykRibjXVhftTRC";
export const BASE_MAINNET = "eip155:8453";
export const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const SOLANA_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SOLANA_COLLECTOR_ATA = "Hp6uUt3RmYYVmeSYyf6LpimgddHbL9QJ1LG9TbK5pJiQ";

export const PLANS = {
  builder: { id: "builder", name: "Starter", priceUSDC: "12.00", amountAtomic: 12_000_000n, units: 100_000, batchLimit: 0 },
  pro: { id: "pro", name: "Pro", priceUSDC: "39.00", amountAtomic: 39_000_000n, units: 500_000, batchLimit: 10 },
  scale: { id: "scale", name: "Scale", priceUSDC: "99.00", amountAtomic: 99_000_000n, units: 2_000_000, batchLimit: 50 },
} as const;
export type PlanId = keyof typeof PLANS;
export const publicPlans = () => Object.values(PLANS).map(({ amountAtomic: _hidden, ...plan }) => ({ ...plan, durationDays: 30 }));
export const planById = (value: unknown) => typeof value === "string" && Object.hasOwn(PLANS, value) ? PLANS[value as PlanId] : null;

/** One-time welcome allowance for a new human dashboard account. */
export const FREE_UNITS = 1_000;
export const FREE_PLAN_ID = "free";
