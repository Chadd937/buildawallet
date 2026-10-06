// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BASE_COLLECTOR, BASE_MAINNET, BASE_USDC } from "@/lib/machine/config";
const mocks = vi.hoisted(() => ({ process: vi.fn(), settle: vi.fn(), record: vi.fn() }));
vi.mock("@x402/core/server", () => ({
  HTTPFacilitatorClient: class {},
  x402ResourceServer: class {},
}));
vi.mock("@x402/evm/exact/server", () => ({ registerExactEvmScheme: vi.fn() }));
vi.mock("@x402/svm/exact/server", () => ({ registerExactSvmScheme: vi.fn() }));
vi.mock("@x402/core/http", () => ({
  x402HTTPResourceServer: class {
    initialize() {
      return Promise.resolve();
    }
    processHTTPRequest = mocks.process;
    processSettlement = mocks.settle;
  },
}));
vi.mock("@/lib/owner/receipts.server", () => ({ recordX402Receipt: mocks.record }));
import { paid } from "@/lib/machine/x402.server";
const requirements = {
  network: BASE_MAINNET,
  payTo: BASE_COLLECTOR,
  asset: BASE_USDC,
  amount: "10000",
};
const settlement = {
  success: true,
  transaction: "0x" + "a".repeat(64),
  network: BASE_MAINNET,
  requirements,
  headers: { "PAYMENT-RESPONSE": "settled-receipt" },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.process.mockResolvedValue({
    type: "payment-verified",
    paymentPayload: {},
    paymentRequirements: requirements,
  });
  mocks.settle.mockResolvedValue(settlement);
  mocks.record.mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
const request = () =>
  new Request("https://buildawallet.xyz/machine/x402/wallet?chain=base&address=collector");
it("a receipt-storage outage preserves the settled paid response and receipt header", async () => {
  mocks.record.mockRejectedValue(new Error("D1 unavailable"));
  const response = await paid(request(), async () => new Response("paid-result"));
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("paid-result");
  expect(response.headers.get("payment-response")).toBe("settled-receipt");
});
it("failed settlements never enter the income ledger", async () => {
  mocks.settle.mockResolvedValue({
    success: false,
    response: { status: 402, headers: {}, body: "not-settled" },
  });
  expect((await paid(request(), async () => new Response("result"))).status).toBe(402);
  expect(mocks.record).not.toHaveBeenCalled();
});
it("records a before-handler settlement even if the data read fails afterward", async () => {
  mocks.process.mockResolvedValue({
    type: "payment-verified",
    paymentPayload: {},
    paymentRequirements: requirements,
    beforeHandlerSettlement: { result: settlement, requirements },
  });
  expect(
    (await paid(request(), async () => new Response("upstream unavailable", { status: 503 })))
      .status,
  ).toBe(503);
  expect(mocks.record).toHaveBeenCalledTimes(1);
  expect(mocks.settle).not.toHaveBeenCalled();
});
