try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AUTH_SESSION_SIGNING_KEY",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length)
  throw new Error(`Deployment stopped. Missing server configuration: ${missing.join(", ")}`);
const url = process.env.SUPABASE_URL;
if (!/^https:\/\//.test(url)) throw new Error("Supabase must use HTTPS");
if (process.env.OPENAI_BASE_URL && !/^https:\/\//.test(process.env.OPENAI_BASE_URL))
  throw new Error("The AI endpoint must use HTTPS");
const headers = {
  "content-type": "application/json",
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
if (!process.env.SUPABASE_SERVICE_ROLE_KEY.startsWith("sb_secret_"))
  headers.authorization = `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`;
for (const table of [
  "machine_challenges",
  "machine_sessions",
  "api_accounts",
  "api_account_keys",
  "api_checkout_quotes",
  "api_payment_redemptions",
  "human_ai_conversations",
]) {
  const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, { headers });
  if (!response.ok)
    throw new Error(
      `Database readiness failed for ${table} (HTTP ${response.status}). Apply the app migrations before deploying.`,
    );
}
const zero = "00000000-0000-0000-0000-000000000000";
const checks = [
  [
    "activate_api_checkout",
    { p_user_id: zero, p_quote_id: zero, p_tx: "", p_paid_at: new Date().toISOString() },
  ],
  [
    "activate_machine_payment",
    {
      p_chain: "",
      p_wallet: "",
      p_plan: "invalid",
      p_tx: "",
      p_paid_at: new Date().toISOString(),
      p_amount: 0,
    },
  ],
];
for (const [name, body] of checks) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (response.status !== 400 || result.code !== "P0001")
    throw new Error(`Missing or unexpected database function: ${name}. Deployment stopped.`);
}
console.log("Database and required server configuration checks passed.");
