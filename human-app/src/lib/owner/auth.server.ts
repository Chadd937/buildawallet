import { timingSafeEqual } from "node:crypto";
import { accountFromRequest } from "@/integrations/auth/account.server";
import { workerEnvironment } from "@/lib/db/context.server";

export async function isOwnerRequest(request: Request) {
  const ownerHash = workerEnvironment().OWNER_EMAIL_HASH;
  if (!ownerHash || !/^[a-f0-9]{64}$/i.test(ownerHash)) return false;
  try {
    const account = await accountFromRequest(request);
    if (!/^[a-f0-9]{64}$/i.test(account.userId)) return false;
    return timingSafeEqual(Buffer.from(ownerHash, "hex"), Buffer.from(account.userId, "hex"));
  } catch {
    return false;
  }
}

export function ownerResponse(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store, private");
  headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  headers.set("vary", "Cookie");
  return new Response(response.body, { status: response.status, headers });
}
