import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { jwtVerify } from "jose";

const unauthorized = (message: string) => new Error(`Unauthorized: ${message}`);

export async function verifyAccountToken(token: string) {
  const key = process.env["AUTH_SESSION_SIGNING_KEY"];
  if (!key) throw new Error("Account authentication is not configured");
  const issuer = process.env["AUTH_JWT_ISSUER"] || "buildawallet-auth";
  const audience = process.env["AUTH_JWT_AUDIENCE"] || "buildawallet-app";
  const { payload } = await jwtVerify(token, new TextEncoder().encode(key), {
    algorithms: ["HS256"],
    issuer,
    audience,
  });
  if (!payload.sub || payload["verified"] !== true)
    throw unauthorized("Email confirmation is required");
  return { userId: payload.sub, claims: payload };
}

export async function accountFromRequest(request: Request) {
  const match = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "");
  if (!match?.[1]) throw unauthorized("No account session was provided");
  try {
    return await verifyAccountToken(match[1]);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Account authentication")) throw error;
    throw unauthorized("The account session is invalid or expired");
  }
}

export const requireAccountAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    if (!request?.headers) throw unauthorized("No request headers are available");
    const account = await accountFromRequest(request);
    return next({ context: account });
  },
);
