import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { x402HTTPResourceServer, type HTTPAdapter, type RoutesConfig } from "@x402/core/http";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { registerExactSvmScheme } from "@x402/svm/exact/server";
import { BASE_COLLECTOR, BASE_MAINNET, SOLANA_COLLECTOR, SOLANA_MAINNET } from "./config";

const facilitator = new HTTPFacilitatorClient({
  url: process.env["X402_FACILITATOR_URL"]?.trim() || "https://facilitator.payai.network",
});
const resource = new x402ResourceServer(facilitator);
registerExactEvmScheme(resource, { networks: [BASE_MAINNET] });
registerExactSvmScheme(resource, {
  networks: [SOLANA_MAINNET],
  rpcUrl: process.env["SOLANA_RPC_URL"]?.trim() || "https://solana-rpc.publicnode.com",
});
const routes: RoutesConfig = {
  "GET /machine/x402/wallet": {
    accepts: [
      { scheme: "exact", network: BASE_MAINNET, payTo: BASE_COLLECTOR, price: "$0.01" },
      { scheme: "exact", network: SOLANA_MAINNET, payTo: SOLANA_COLLECTOR, price: "$0.01" },
    ],
    description: "One live mainnet native-balance read on any supported chain",
    mimeType: "application/json",
  },
};
const server = new x402HTTPResourceServer(resource, routes);
let initialized: Promise<void> | undefined;
const init = () => (initialized ??= server.initialize());
class RequestAdapter implements HTTPAdapter {
  constructor(private request: Request) {}
  getHeader(name: string) {
    return this.request.headers.get(name) ?? undefined;
  }
  getMethod() {
    return this.request.method;
  }
  getPath() {
    return new URL(this.request.url).pathname;
  }
  getUrl() {
    return this.request.url;
  }
  getAcceptHeader() {
    return this.request.headers.get("accept") ?? "application/json";
  }
  getUserAgent() {
    return this.request.headers.get("user-agent") ?? "";
  }
  getQueryParams() {
    const out: Record<string, string | string[]> = {};
    for (const [key, value] of new URL(this.request.url).searchParams)
      out[key] =
        key in out
          ? [...(Array.isArray(out[key]) ? out[key] : [out[key] as string]), value]
          : value;
    return out;
  }
  getQueryParam(name: string) {
    return new URL(this.request.url).searchParams.get(name) ?? undefined;
  }
}
const fromInstructions = (
  result: Extract<Awaited<ReturnType<typeof server.processHTTPRequest>>, { type: "payment-error" }>,
) => {
  const body =
    typeof result.response.body === "string"
      ? result.response.body
      : JSON.stringify(result.response.body ?? {});
  return new Response(body, { status: result.response.status, headers: result.response.headers });
};
async function rememberSettlement(
  settled: Parameters<typeof import("@/lib/owner/receipts.server").recordX402Receipt>[0],
  requirements: Parameters<typeof import("@/lib/owner/receipts.server").recordX402Receipt>[1],
) {
  if (!settled.success) return;
  try {
    const { recordX402Receipt } = await import("@/lib/owner/receipts.server");
    if (!(await recordX402Receipt(settled, requirements)))
      console.error("treasury: settlement receipt was not recognized");
  } catch {
    // A reporting outage must not make a successfully paid caller pay again.
    console.error("treasury: settled payment could not be recorded");
  }
}
export async function paid(request: Request, handler: () => Promise<Response>) {
  try {
    await init();
  } catch (error) {
    initialized = undefined;
    console.error("x402 facilitator initialization failed", error);
    return new Response(JSON.stringify({ error: "Payment service temporarily unavailable" }), {
      status: 503,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  const adapter = new RequestAdapter(request);
  const paymentHeader = request.headers.get("payment-signature");
  const context = {
    adapter,
    path: "/machine/x402/wallet",
    method: "GET",
    ...(paymentHeader ? { paymentHeader } : {}),
  };
  const processed = await server.processHTTPRequest(context);
  if (processed.type === "payment-error") return fromInstructions(processed);
  if (processed.type !== "payment-verified") throw new Error("Payment route unavailable");
  if (processed.beforeHandlerSettlement)
    await rememberSettlement(
      processed.beforeHandlerSettlement.result,
      processed.beforeHandlerSettlement.requirements,
    );
  const response = await handler();
  if (!response.ok) return response;
  const body = Buffer.from(await response.clone().arrayBuffer());
  const settled = await server.processSettlement(
    processed.paymentPayload,
    processed.paymentRequirements,
    processed.declaredExtensions,
    {
      request: { adapter, path: "/machine/x402/wallet", method: "GET" },
      responseBody: body,
      responseHeaders: Object.fromEntries(response.headers),
    },
    undefined,
    processed.beforeHandlerSettlement,
  );
  if (!settled.success)
    return fromInstructions({ type: "payment-error", response: settled.response });
  if (!processed.beforeHandlerSettlement) await rememberSettlement(settled, settled.requirements);
  const headers = new Headers(response.headers);
  Object.entries(settled.headers).forEach(([key, value]) => headers.set(key, value));
  headers.set("cache-control", "no-store, private");
  return new Response(body, { status: response.status, headers });
}
