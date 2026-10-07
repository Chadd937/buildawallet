import { loadDeploymentConfig, validateAiDeployment, validateX402Deployment } from "./deployment-config.mjs";
const { config, values } = loadDeploymentConfig();
const provider = validateAiDeployment(config, values);
const facilitator = validateX402Deployment(values);
console.log(
  `AI configuration ready (${provider}); x402 facilitator ready (${facilitator}). Login and app D1 readiness will be checked through Wrangler.`,
);
