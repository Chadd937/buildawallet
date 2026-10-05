// @vitest-environment node
import { SignJWT } from "jose";
import { afterEach, expect, it } from "vitest";
import { verifyAccountToken } from "@/integrations/auth/auth-middleware";

const key = "test-only-shared-account-signing-key";

afterEach(() => {
  delete process.env["AUTH_SESSION_SIGNING_KEY"];
  delete process.env["AUTH_JWT_ISSUER"];
  delete process.env["AUTH_JWT_AUDIENCE"];
});

it("accepts the Login Worker account token contract", async () => {
  process.env["AUTH_SESSION_SIGNING_KEY"] = key;
  const subject = "4b7a4c2e-f995-5c18-8d3f-729e08482803";
  const token = await new SignJWT({ verified: true })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("buildawallet-auth")
    .setAudience("buildawallet-app")
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(key));
  await expect(verifyAccountToken(token)).resolves.toMatchObject({ userId: subject });
});

it("rejects an account token for another app", async () => {
  process.env["AUTH_SESSION_SIGNING_KEY"] = key;
  const token = await new SignJWT({ verified: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("buildawallet-auth")
    .setAudience("another-app")
    .setSubject("4b7a4c2e-f995-5c18-8d3f-729e08482803")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(key));
  await expect(verifyAccountToken(token)).rejects.toThrow();
});
