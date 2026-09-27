import { createRemoteJWKSet, jwtVerify } from "jose";

export interface HumanAccessEnv {
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function humanAccessAllowed(assertion: string | undefined, env: HumanAccessEnv): Promise<boolean> {
  const team = env.CF_ACCESS_TEAM_DOMAIN?.replace(/\/$/, "");
  const audience = env.CF_ACCESS_AUD;
  if (!assertion || !audience || !team ||
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(team)) return false;
  try {
    let keys = keySets.get(team);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(`${team}/cdn-cgi/access/certs`));
      keySets.set(team, keys);
    }
    const { payload } = await jwtVerify(assertion, keys, {
      issuer: team, audience, algorithms: ["RS256"],
    });
    // An Access service token is for machines and must not open HUMAN pages.
    return payload.type === "app" && typeof payload.email === "string" && payload.email.length > 0;
  } catch {
    return false;
  }
}
