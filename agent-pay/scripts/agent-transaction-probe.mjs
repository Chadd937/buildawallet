#!/usr/bin/env node
/**
 * BuildAWallet agent transaction probe.
 * READ-ONLY: no API key, no payment signature, no signing, no transaction broadcast.
 * Tests public discovery and the exact paths an unauthenticated autonomous agent sees.
 */
const origin = (process.env.BAW_ORIGIN || "https://buildawallet.xyz").replace(/\/$/, "");
const baseAddress = "0xBcCA6AED433d9020C50D44560F9679F1B5eB511d";
const solAddress = "Ew8mbrKwD6LGaSX28a6XGmXqeQSs2hykRibjXVhftTRC";
const solSignature = "3iFnuNMJqoGsCSEntBP1G4Ztr4dFkWhEC81cyTmnqvq8f87Ad5mkV99yS1CibBxxPdQqNiB6sxGkCiGoYK224a6P";
// A syntactically valid *placeholder* for testing authorization, NOT a real Base transaction.
const baseTxPlaceholder = "0x" + "0".repeat(64);
const results = [];

async function request(path, options = {}) {
  const response = await fetch(origin + path, {
    redirect: "manual",
    signal: AbortSignal.timeout(12000),
    ...options,
  });
  const raw = await response.text();
  let body = null;
  try {
    if (raw.startsWith("event:") || raw.startsWith("data:")) {
      const dataLine = raw.split(/\r?\n/).find(line => line.startsWith("data:"));
      if (dataLine) body = JSON.parse(dataLine.slice(5).trim());
    } else body = JSON.parse(raw);
  } catch { /* retain short text summary only */ }
  return {
    status: response.status,
    type: response.headers.get("content-type") ?? "",
    paymentRequired: response.headers.has("payment-required"),
    body,
    snippet: raw.slice(0, 250),
  };
}
async function probe(label, path, options, evaluate) {
  try {
    const response = await request(path, options);
    const outcome = evaluate(response);
    const level = outcome.pass ? "PASS" : outcome.warn ? "WARN" : "FAIL";
    console.log(level + " " + label + " — HTTP " + response.status + " — " + outcome.detail);
    results.push({ label, level, http: response.status, detail: outcome.detail });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.log("FAIL " + label + " — " + detail);
    results.push({ label, level: "FAIL", http: null, detail });
  }
}
const valid = r => ({ pass: r.status === 200, detail: r.body?.error ?? (r.status === 200 ? "successful discovery" : r.snippet) });
const denied = r => ({
  pass: r.status === 401,
  warn: r.status === 429 || r.status === 503,
  detail: r.status === 401 ? "correctly requires a subscribed API key; no data or charge" :
    (r.body?.error ?? "unexpected access response"),
});
const paidChallenge = r => ({
  pass: r.status === 402 && r.paymentRequired,
  warn: r.status === 503 || r.status === 429,
  detail: r.status === 402
    ? (r.paymentRequired ? "valid x402 payment challenge; payment NOT submitted" : "missing payment-required header")
    : (r.body?.error ?? "no x402 challenge; check RPC/facilitator/rate limiting"),
});
function mcpRequest(name, args) {
  return {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: name === "list" ? "tools/list" : "tools/call",
      params: name === "list" ? {} : { name, arguments: args } }),
  };
}
console.log("BuildAWallet simulated AGENT: public transaction queries and x402 challenge");
console.log("Target: " + origin + " — payment disabled; no keys/signatures submitted.\n");

await probe("Agent discovery", "/.well-known/agent.json", {}, valid);
await probe("Transaction subscription quote", "/machine/quote?chain=solana&kind=transaction&access=subscription", {}, valid);
await probe("Real Solana signature, no API key",
  "/machine/v1/solana/transaction/" + solSignature, {}, denied);
await probe("Base transaction format, no API key",
  "/machine/v1/base/transaction/" + baseTxPlaceholder, {}, denied);
await probe("MCP transaction tools advertised", "/mcp", mcpRequest("list"), r => {
  const tools = r.body?.result?.tools ?? [];
  const names = tools.map(t => t.name);
  const good = r.status === 200 && names.includes("solana_transaction") && names.includes("base_transaction");
  return { pass: good, detail: good ? "base_transaction and solana_transaction are discoverable" :
    "missing transaction MCP tool(s) or discovery failed" };
});
await probe("MCP Solana transaction call, no API key", "/mcp",
  mcpRequest("solana_transaction", { tx: solSignature }), r => {
    const error = r.body?.result?.isError === true;
    return { pass: r.status === 200 && error,
      warn: r.status === 429 || r.status === 503,
      detail: error ? "agent received error response as expected, without a key: " +
        (r.body?.result?.content?.[0]?.text ?? "").slice(0, 130) :
        "unexpected result; inspect MCP authentication" };
  });
await probe("Free public Solana signature history",
  "/machine/public/solana/" + solAddress + "/history?limit=2", {}, r => ({
    pass: r.status === 200 && Array.isArray(r.body?.transactions),
    warn: r.status === 429 || r.status === 503,
    detail: Array.isArray(r.body?.transactions)
      ? "returned " + r.body.transactions.length + " recent signature(s)"
      : (r.body?.error ?? "history API unavailable"),
  }));
await probe("x402 transaction quote (unsupported by design)",
  "/machine/quote?chain=base&kind=transaction&access=x402", {}, r => ({
    pass: r.status === 400,
    detail: r.status === 400 ? "transaction lookups use subscription, not per-call x402" :
      "unexpected quote result",
  }));
await probe("x402 Base wallet call (unpaid)", "/machine/wallet?address=" + baseAddress, {}, paidChallenge);
await probe("x402 Solana wallet call (unpaid)", "/machine/solana-wallet?address=" + solAddress, {}, paidChallenge);

const counts = Object.fromEntries(["PASS", "WARN", "FAIL"].map(k => [k, results.filter(r => r.level === k).length]));
console.log("\nAgent probe result: " + counts.PASS + " passed, " + counts.WARN +
  " upstream warning(s), " + counts.FAIL + " failed.");
console.log("NOTE: No actual AI-agent payment or successful subscribed transaction lookup was performed.");
process.exitCode = counts.FAIL ? 1 : 0;
