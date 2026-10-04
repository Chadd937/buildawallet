import { readJsonBody } from "@/lib/body";
export const json = (data: unknown, status = 200, headers?: HeadersInit) => Response.json(data, { status, headers: { "cache-control": "no-store", ...headers } });
export const apiError = (error: unknown) => {
  if (error instanceof RangeError) return json({ error: error.message }, 400);
  const message = error instanceof Error ? error.message : "Request failed";
  if (/required|invalid|must|mismatch/i.test(message)) return json({ error: message }, 400);
  console.error("machine-api", error);
  return json({ error: "Service temporarily unavailable" }, 503);
};
export async function objectBody(request: Request) {
  const value: unknown = await readJsonBody(request, 32_000);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RangeError("JSON object required");
  return value as Record<string, unknown>;
}
export const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type,payment-signature", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" };
