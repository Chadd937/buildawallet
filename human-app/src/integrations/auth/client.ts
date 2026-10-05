export type AuthSession = {
  authenticated: boolean;
  verified: boolean;
  accountId?: string;
  accessToken?: string;
  expiresIn?: number;
  emailHint?: string;
};

const EMAIL_HINT_KEY = "buildawallet-account-email";

async function responseBody(response: Response) {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

function errorMessage(body: Record<string, unknown>, fallback: string) {
  return typeof body["detail"] === "string" ? body["detail"] : fallback;
}

function emailHint() {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(EMAIL_HINT_KEY) || undefined;
}

export async function getSession(): Promise<AuthSession> {
  const response = await fetch("/auth/session", {
    credentials: "include",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!response.ok) return { authenticated: false, verified: false };
  const session = (await responseBody(response)) as AuthSession;
  const hint = emailHint();
  return hint ? { ...session, emailHint: hint } : session;
}

export async function requestEmailConfirmation(email: string, next: string) {
  const normalized = email.trim().toLowerCase();
  const response = await fetch("/auth/email/request", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ email: normalized, next }),
  });
  const body = await responseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Could not send confirmation email"));
  if (typeof window !== "undefined") window.localStorage.setItem(EMAIL_HINT_KEY, normalized);
  return body as { ok: true; sent: true; expiresIn: number };
}

export async function verifyEmailCode(email: string, code: string) {
  const response = await fetch("/auth/email/verify", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase(), code }),
  });
  const body = await responseBody(response);
  if (!response.ok) throw new Error(errorMessage(body, "Could not verify confirmation code"));
  return body as AuthSession & { ok: true; redirectTo: string };
}

export async function logout() {
  await fetch("/auth/logout", { method: "POST", credentials: "include" });
  if (typeof window !== "undefined") window.localStorage.removeItem(EMAIL_HINT_KEY);
}
