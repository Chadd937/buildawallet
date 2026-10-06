import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";

export function ownerEmailHash(email) {
  const normalized = String(email).trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
    throw new Error("Enter the email address you use with the original HUMAN login.");
  return createHash("sha256").update(normalized).digest("hex");
}
export function storeOwnerHash(directory, hash) {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("Invalid owner identity hash");
  const devVars = new URL(".dev.vars", directory);
  const target = existsSync(devVars) ? devVars : new URL(".env", directory);
  const original = existsSync(target) ? readFileSync(target, "utf8") : "";
  const lines = original
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:export\s+)?OWNER_EMAIL_HASH\s*=/.test(line));
  writeFileSync(target, lines.join("\n").replace(/\n*$/, "\n") + `OWNER_EMAIL_HASH=${hash}\n`, {
    mode: 0o600,
  });
  chmodSync(target, 0o600);
  return target.pathname;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const hash = ownerEmailHash(await prompt.question("Owner HUMAN login email: "));
    const path = storeOwnerHash(new URL("../", import.meta.url), hash);
    console.log(
      `Owner access configured in ${path}. The email itself was not saved. Run npm run deploy to upload the private owner setting.`,
    );
  } finally {
    prompt.close();
  }
}
