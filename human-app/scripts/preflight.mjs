import { loadDeploymentConfig } from "./deployment-config.mjs";
const { values: env } = loadDeploymentConfig();
const missing = ["OPENAI_API_KEY", "OPENAI_MODEL"].filter((name) => !env[name]);
if (missing.length)
  throw new Error(
    `Deployment stopped. Add these settings to human-app/.env or .dev.vars: ${missing.join(", ")}. Do not commit secret values.`,
  );
if (env.OPENAI_BASE_URL && !/^https:\/\//.test(env.OPENAI_BASE_URL))
  throw new Error("The AI endpoint must use HTTPS");
console.log(
  "Required local server settings are present. Login and app D1 readiness will be checked through Wrangler.",
);
