import { loadDeploymentConfig, validateAiDeployment } from "./deployment-config.mjs";
const { config, values } = loadDeploymentConfig();
const provider = validateAiDeployment(config, values);
console.log(
  `AI configuration ready (${provider}). Login and app D1 readiness will be checked through Wrangler.`,
);
