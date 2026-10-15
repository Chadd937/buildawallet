// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PAYMENT_CHAINS, PAYMENT_RAILS } from "@/lib/machine/config";
import { DOCUMENTED_X402_NETWORKS, sameChainPaymentPolicy, supportedPaymentNetworks } from "@/lib/machine/payment-policy";
import { legacyAllowance } from "@/lib/machine/legacy-billing.server";

describe("nine-chain canonical payment policy", () => {
  it("supports a matching in-chain payment rail on all nine networks", () => {
    expect(supportedPaymentNetworks).toHaveLength(9);
    for (const chain of PAYMENT_CHAINS) {
      const policy = sameChainPaymentPolicy(chain);
      expect(policy.serviceChain).toBe(chain);
      expect(policy.network).toBe(PAYMENT_RAILS[chain].network);
      expect(policy.collector).toBe(PAYMENT_RAILS[chain].collector);
      expect(policy.currency).toBe(chain === "bitcoin" ? "BTC" : "USDC");
      expect(policy.prepaid.plans.map(p => [p.priceUSDC, p.units])).toEqual([
        ["15.00", 100_000],
        ["49.00", 500_000],
        ["149.00", 2_000_000],
      ]);
    }
  });

  it("does not imply instantaneous x402 settlement on unverified networks", () => {
    expect(DOCUMENTED_X402_NETWORKS).toEqual(["base", "polygon", "solana"]);
    for (const chain of PAYMENT_CHAINS) {
      const policy = sameChainPaymentPolicy(chain);
      expect(policy.x402.potential).toBe(DOCUMENTED_X402_NETWORKS.includes(chain as any));
      expect(policy.x402.confirmedByRuntime).toBe(false);
    }
    expect(sameChainPaymentPolicy("bitcoin").x402.potential).toBe(false);
    expect(sameChainPaymentPolicy("bitcoin").prepaid.quote).toContain("/agent/quote");
  });

  it("rejects non-configured chains without inventing payment rails", () => {
    expect(() => sameChainPaymentPolicy("tron")).toThrow("Unsupported payment network");
  });
});

describe("legacy entitlement compatibility", () => {
  it("retains ORIGINAL allowance rather than silently inflating older paid quotas", () => {
    expect(legacyAllowance("builder")).toEqual({ quota: 500, batchLimit: 0 });
    expect(legacyAllowance("pro")).toEqual({ quota: 5_000, batchLimit: 10 });
    expect(legacyAllowance("scale")).toEqual({ quota: 25_000, batchLimit: 50 });
    expect(legacyAllowance("free")).toBeNull();
  });
});
