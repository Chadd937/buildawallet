import { createHash } from "node:crypto";
import { workerEnvironment } from "@/lib/db/context.server";

const unauthorized = (message: string) => new Error(`Unauthorized: ${message}`);

/** Validate the original Login project's HttpOnly session, without a second token system. */
export async function accountFromRequest(request: Request) {
  const origin = new URL(request.url).origin;
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (!["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      request.headers.get("origin") !== origin)
  )
    throw unauthorized("A same-origin request is required");
  const env = workerEnvironment();
  const name = env.AUTH_COOKIE_NAME || "site_session";
  const cookies = (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim());
  const matches = cookies.filter((part) => part.startsWith(`${name}=`));
  if (matches.length !== 1) throw unauthorized("No account session was provided");
  const token = matches[0]!.slice(name.length + 1);
  if (!/^[A-Za-z0-9_-]{40,128}$/.test(token)) throw unauthorized("The account session is invalid");
  const db = env.AUTH_DB;
  if (!db) throw new Error("Login D1 binding is not configured");
  const prefix = env.AUTH_TABLE_PREFIX || "auth";
  if (prefix !== "auth" && prefix !== "human") throw new Error("Unsupported Login table prefix");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const row = await db
    .prepare(
      `SELECT a.email_hash FROM ${prefix}_sessions s
    JOIN ${prefix}_email_accounts a ON a.email_hash=s.email_hash
    WHERE s.token_hash=? AND s.expires_at>? AND a.verified_at>0`,
    )
    .bind(tokenHash, Math.floor(Date.now() / 1000))
    .first<{ email_hash: string }>();
  if (!row) throw unauthorized("The account session is invalid or expired");
  return { userId: row.email_hash };
}
