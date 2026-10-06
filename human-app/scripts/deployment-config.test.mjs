import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import {
  deploymentSecrets,
  loadDeploymentConfig,
  prepareDeploymentConfig,
  validateAiDeployment,
} from "./deployment-config.mjs";

function fixture(t, files) {
  const directory = mkdtempSync(join(tmpdir(), "baw-deploy-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const [name, contents] of Object.entries(files))
    writeFileSync(join(directory, name), contents);
  return pathToFileURL(`${directory}/`);
}

const wrangler = `{
  // Wrangler supports JSONC comments and trailing commas.
  "name": "test-worker",
  "vars": {"AUTH_COOKIE_NAME": "site_session",},
}`;

test("configured Login cookie is available without a local env file", (t) => {
  const appDirectory = fixture(t, { "wrangler.jsonc": wrangler });
  const { config, values } = loadDeploymentConfig({ appDirectory, environment: {} });
  assert.equal(config.name, "test-worker");
  assert.equal(values.AUTH_COOKIE_NAME, "site_session");
  assert.deepEqual(deploymentSecrets(values), {});
});

test("local settings resolve consistently and never become public vars", (t) => {
  const appDirectory = fixture(t, {
    "wrangler.jsonc": wrangler,
    ".env": "AI_PROVIDER=openai\nAUTH_COOKIE_NAME=env_cookie\nOPENAI_API_KEY=env-secret\nUNRELATED=private\n",
    ".dev.vars":
      "AUTH_COOKIE_NAME=dev_cookie\nOPENAI_API_KEY=dev-secret\nBASE_RPC_URL=auth-secret\n",
  });
  const { config, values, overrides } = loadDeploymentConfig({
    appDirectory,
    environment: { OPENAI_API_KEY: "shell-secret" },
  });
  assert.equal(values.AUTH_COOKIE_NAME, "dev_cookie");
  assert.equal(overrides.AUTH_COOKIE_NAME, "dev_cookie");
  assert.equal(values.OPENAI_API_KEY, "shell-secret");
  const builtConfig = {
    name: "test-worker",
    vars: { KEEP: "existing" },
    assets: { directory: "../client" },
  };
  const prepared = prepareDeploymentConfig(builtConfig, config, values);
  assert.deepEqual(prepared.vars, { KEEP: "existing", AUTH_COOKIE_NAME: "dev_cookie", AI_PROVIDER: "openai" });
  assert.deepEqual(prepared.assets, builtConfig.assets);
  assert.equal(JSON.stringify(prepared).includes("secret"), false);
  assert.deepEqual(deploymentSecrets(values), {
    OPENAI_API_KEY: "shell-secret",
    BASE_RPC_URL: "auth-secret",
  });
});

test("stale build cannot send secrets to a different Worker", () => {
  assert.throws(
    () => prepareDeploymentConfig({ name: "old-worker" }, { name: "new-worker" }, {}),
    /Rebuild/,
  );
});

test("owner identity is uploaded only as a server secret", () => {
  const hash = "a".repeat(64);
  const values = { OWNER_EMAIL_HASH: hash, AI_PROVIDER: "workers-ai" };
  const prepared = prepareDeploymentConfig({ name: "test-worker", vars: {} }, { name: "test-worker" }, values);
  assert.equal(JSON.stringify(prepared).includes(hash), false);
  assert.deepEqual(deploymentSecrets(values), { OWNER_EMAIL_HASH: hash });
});

test("invalid Wrangler configuration stops deployment", (t) => {
  const appDirectory = fixture(t, { "wrangler.jsonc": "{ invalid json }" });
  assert.throws(() => loadDeploymentConfig({ appDirectory, environment: {} }), /Cannot parse/);
});

test("Workers AI deployment needs its binding and model, without any OpenAI key", () => {
  const values = { AI_PROVIDER: "workers-ai", AI_MODEL: "@cf/meta/llama-3.1-8b-instruct-fast" };
  assert.equal(validateAiDeployment({ ai: { binding: "AI" } }, values), "workers-ai");
  assert.deepEqual(deploymentSecrets({ ...values, OPENAI_API_KEY: "unused-secret", OPENAI_MODEL: "unused", BASE_RPC_URL: "private-rpc" }), { BASE_RPC_URL: "private-rpc" });
  assert.throws(() => validateAiDeployment({}, values), /binding/);
  assert.throws(() => validateAiDeployment({ ai: { binding: "AI" } }, { ...values, AI_MODEL: "" }), /AI_MODEL/);
});

test("OpenAI credentials are required only for an explicitly selected OpenAI provider", () => {
  assert.throws(() => validateAiDeployment({}, { AI_PROVIDER: "openai" }), /OPENAI_API_KEY, OPENAI_MODEL/);
  const values = { AI_PROVIDER: "openai", OPENAI_API_KEY: "private", OPENAI_MODEL: "configured-model" };
  assert.equal(validateAiDeployment({}, values), "openai");
  assert.throws(() => validateAiDeployment({}, { ...values, OPENAI_BASE_URL: "http://example.com" }), /HTTPS/);
  assert.throws(() => validateAiDeployment({}, { AI_PROVIDER: "unknown" }), /AI_PROVIDER/);
});
