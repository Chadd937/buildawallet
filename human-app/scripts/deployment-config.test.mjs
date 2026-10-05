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
  "vars": {"SUPABASE_URL": "https://configured.example",},
}`;

test("configured public URL is available without a local env file", (t) => {
  const appDirectory = fixture(t, { "wrangler.jsonc": wrangler });
  const { config, values } = loadDeploymentConfig({ appDirectory, environment: {} });
  assert.equal(config.name, "test-worker");
  assert.equal(values.SUPABASE_URL, "https://configured.example");
  assert.deepEqual(deploymentSecrets(values), {});
});

test("local settings resolve consistently and never become public vars", (t) => {
  const appDirectory = fixture(t, {
    "wrangler.jsonc": wrangler,
    ".env": "SUPABASE_URL=https://env.example\nOPENAI_API_KEY=env-secret\nUNRELATED=private\n",
    ".dev.vars":
      "SUPABASE_URL=https://dev.example\nOPENAI_API_KEY=dev-secret\nAUTH_SESSION_SIGNING_KEY=auth-secret\n",
  });
  const { config, values } = loadDeploymentConfig({
    appDirectory,
    environment: { OPENAI_API_KEY: "shell-secret" },
  });
  assert.equal(values.SUPABASE_URL, "https://dev.example");
  assert.equal(values.OPENAI_API_KEY, "shell-secret");
  const builtConfig = {
    name: "test-worker",
    vars: { KEEP: "existing" },
    assets: { directory: "../client" },
  };
  const prepared = prepareDeploymentConfig(builtConfig, config, values);
  assert.deepEqual(prepared.vars, { KEEP: "existing", SUPABASE_URL: "https://dev.example" });
  assert.deepEqual(prepared.assets, builtConfig.assets);
  assert.equal(JSON.stringify(prepared).includes("secret"), false);
  assert.deepEqual(deploymentSecrets(values), {
    OPENAI_API_KEY: "shell-secret",
    AUTH_SESSION_SIGNING_KEY: "auth-secret",
  });
});

test("stale build cannot send secrets to a different Worker", () => {
  assert.throws(
    () => prepareDeploymentConfig({ name: "old-worker" }, { name: "new-worker" }, {}),
    /Rebuild/,
  );
});

test("invalid Wrangler configuration stops deployment", (t) => {
  const appDirectory = fixture(t, { "wrangler.jsonc": "{ invalid json }" });
  assert.throws(() => loadDeploymentConfig({ appDirectory, environment: {} }), /Cannot parse/);
});
