export const PERIOD_SECONDS = 30 * 24 * 60 * 60;

export const PLANS = {
  builder: { id: "builder", name: "Builder", priceUSDC: "12.00", amountAtomic: 12_000_000n, units: 500, batchLimit: 0 },
  pro: { id: "pro", name: "Pro", priceUSDC: "39.00", amountAtomic: 39_000_000n, units: 5_000, batchLimit: 10 },
  scale: { id: "scale", name: "Scale", priceUSDC: "99.00", amountAtomic: 99_000_000n, units: 25_000, batchLimit: 50 },
} as const;
export type PlanId = keyof typeof PLANS;
export function planById(value: unknown) {
  return typeof value === "string" && Object.hasOwn(PLANS, value) ? PLANS[value as PlanId] : null;
}
export function publicPlans() {
  return Object.values(PLANS).map(({ amountAtomic: _internal, ...publicPlan }) => ({
    ...publicPlan, durationDays: 30, humanBlueprint: true,
  }));
}
