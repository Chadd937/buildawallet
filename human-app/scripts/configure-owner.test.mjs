import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { ownerEmailHash, storeOwnerHash } from "./configure-owner.mjs";

test("owner email uses the original Login normalization and hash contract", () => {
  assert.equal(ownerEmailHash(" Owner@Example.test "), ownerEmailHash("owner@example.test"));
  assert.throws(() => ownerEmailHash("not an email"));
});
test("owner setup preserves existing secrets, chooses the active file and never saves the email", (t) => {
  const path = mkdtempSync(join(tmpdir(), "baw-owner-"));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  writeFileSync(join(path, ".env"), "BASE_RPC_URL=keep-this\n");
  writeFileSync(join(path, ".dev.vars"), "SOLANA_RPC_URL=keep-this-too\nOWNER_EMAIL_HASH=old\n");
  const file = storeOwnerHash(pathToFileURL(path + "/"), ownerEmailHash("owner@example.test"));
  assert.equal(file, join(path, ".dev.vars"));
  const contents = readFileSync(file, "utf8");
  assert.ok(contents.includes("SOLANA_RPC_URL=keep-this-too"));
  assert.equal(contents.match(/OWNER_EMAIL_HASH=/g).length, 1);
  assert.ok(!contents.includes("owner@example.test"));
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(readFileSync(join(path, ".env"), "utf8"), "BASE_RPC_URL=keep-this\n");
});
