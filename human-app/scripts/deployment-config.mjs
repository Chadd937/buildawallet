import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import ts from "typescript";

export const publicNames = ["AUTH_COOKIE_NAME", "AUTH_TABLE_PREFIX"];
export const secretNames = [
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_BASE_URL",
  "BASE_RPC_URL",
  "SOLANA_RPC_URL",
  "ETHEREUM_RPC_URL",
  "ARBITRUM_RPC_URL",
  "OPTIMISM_RPC_URL",
  "POLYGON_RPC_URL",
  "BNB_RPC_URL",
  "AVALANCHE_RPC_URL",
];

export function loadDeploymentConfig({
  appDirectory = new URL("../", import.meta.url),
  environment = process.env,
} = {}) {
  const configFile = new URL("wrangler.jsonc", appDirectory);
  const parsed = ts.parseConfigFileTextToJson(
    configFile.pathname,
    readFileSync(configFile, "utf8"),
  );
  if (parsed.error) throw new Error("Cannot parse wrangler.jsonc. Deployment stopped.");
  const config = parsed.config;
  const values = Object.fromEntries(
    publicNames
      .filter((name) => config.vars?.[name] !== undefined)
      .map((name) => [name, String(config.vars[name])]),
  );
  // Shell values take precedence over .dev.vars, then .env, then Wrangler vars.
  for (const filename of [".env", ".dev.vars"]) {
    try {
      Object.assign(values, parseEnv(readFileSync(new URL(filename, appDirectory), "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  Object.assign(values, environment);
  return { config, values };
}

export function prepareDeploymentConfig(builtConfig, sourceConfig, values) {
  if (builtConfig.name !== sourceConfig.name)
    throw new Error("Built Worker name differs from wrangler.jsonc. Rebuild before deploying.");
  return {
    ...builtConfig,
    vars: {
      ...builtConfig.vars,
      ...Object.fromEntries(
        publicNames
          .filter((name) => values[name] !== undefined)
          .map((name) => [name, values[name]]),
      ),
    },
  };
}

export function deploymentSecrets(values) {
  return Object.fromEntries(
    secretNames.filter((name) => values[name]).map((name) => [name, values[name]]),
  );
}
