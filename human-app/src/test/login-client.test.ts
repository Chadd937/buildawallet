import { afterEach, expect, it, vi } from "vitest";
import { getSession, logout, requestEmailConfirmation, verifyEmailCode } from "@/integrations/auth/client";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it("uses the original HUMAN Worker for session, email, verification and logout", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json({ authenticated: false, verified: false }))
    .mockResolvedValueOnce(Response.json({ ok: true, sent: true, expiresIn: 600 }))
    .mockResolvedValueOnce(Response.json({ ok: true, authenticated: true, verified: true }))
    .mockResolvedValueOnce(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(getSession()).resolves.toEqual({ authenticated: false, verified: false });
  await requestEmailConfirmation(" Person@Example.com ", "/human/setup");
  await expect(verifyEmailCode(" Person@Example.com ", "123456"))
    .resolves.toMatchObject({ authenticated: true, verified: true });
  await logout();
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
    "/api/human/account", "/api/human/account/email",
    "/api/human/account/verify", "/api/human/account/logout",
  ]);
  for (const [, options] of fetchMock.mock.calls) expect(options.credentials).toBe("include");
  expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({
    email: "person@example.com", next: "/human/setup",
  });
  expect(JSON.parse(fetchMock.mock.calls[2]![1].body)).toEqual({
    email: "person@example.com", code: "123456",
  });
  expect(localStorage.getItem("buildawallet-account-email")).toBeNull();
});

it("shows errors from the original HUMAN login without marking the user verified", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(
    { detail: "Incorrect confirmation code" }, { status: 400 },
  )));
  await expect(verifyEmailCode("person@example.com", "000000"))
    .rejects.toThrow("Incorrect confirmation code");
});
