import { MACHINE_CHAINS, machineChain } from "./chains";
import { PAYMENT_CHAINS, PAYMENT_RAILS, PLANS, X402_PRICE_USD } from "./config";

/**
 * Policy for NEW nine-chain access. Legacy agent-pay entitlements and payment
 * routes remain untouched until a separate, audited migration.
 *
 * Per-call x402 is restricted to payment networks confirmed by the current
 * managed facilitator documentation; every other network can pay for prepaid
 * access with its own on-chain asset, including BTC on Bitcoin.
 */
export const DOCUMENTED_X402_NETWORKS = ["base", "polygon", "solana"] as const;

export const x402Eligible = (chain: string) =>
  (DOCUMENTED_X402_NETWORKS as readonly string[]).includes(chain);

export function sameChainPaymentPolicy(serviceChain: string) {
  if (!PAYMENT_CHAINS.includes(serviceChain as (typeof PAYMENT_CHAINS)[number]))
    throw new RangeError("Unsupported payment network");
  const chain = machineChain(serviceChain);
  if (!chain) throw new RangeError("Unsupported service chain");
  const rail = PAYMENT_RAILS[serviceChain as keyof typeof PAYMENT_RAILS];
  return {
    serviceChain: chain.id,
    network: rail.network,
    currency: rail.asset,
    assetAddress: rail.assetAddress,
    collector: rail.collector,
    decimals: rail.decimals,
    prepaid: {
      quote: "/api/public/machine/v1/agent/quote",
      activate: "/api/public/machine/v1/agent/activate",
      plans: Object.values(PLANS).map(({ id, name, priceUSDC, units }) => ({
        id, name, priceUSDC, units, durationDays: 30,
      })),
      note: "Quote with chain matching the requested service, your payer wallet and planId. Pay the exact quoted amount on that chain; confirm the transaction to obtain an API key. A prepaid key can subsequently read any supported chain.",
    },
    x402: x402Eligible(chain.id)
      ? { potential: true, confirmedByRuntime: false, priceUSD: X402_PRICE_USD,
          note: "Availability requires a configured facilitator that supports this network and exact scheme. Verify its payment-required header before signing." }
      : { potential: false, confirmedByRuntime: false,
          reason: chain.id === "bitcoin"
            ? "Bitcoin BTC payments use verified on-chain prepaid purchase; no BTC x402 scheme is configured."
            : "The configured CDP facilitator has not been verified for this network; use same-chain prepaid purchase." },
  };
}

export const supportedPaymentNetworks = MACHINE_CHAINS.map(({ id }) => sameChainPaymentPolicy(id));
