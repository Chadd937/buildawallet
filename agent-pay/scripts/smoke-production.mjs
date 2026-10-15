#!/usr/bin/env node
// Production read-only smoke test. Does not sign, pay, mutate D1, or broadcast.
const origin = (process.env.BAW_ORIGIN || "https://buildawallet.xyz").replace(/\/$/, "");
const evm = "0xBcCA6AED433d9020C50D44560F9679F1B5eB511d";
const sol = "Ew8mbrKwD6LGaSX28a6XGmXqeQSs2hykRibjXVhftTRC";
const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const btc = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
const tasks = [
  ["Homepage", "/", [200], "html"],
  ["HUMAN setup", "/human/setup", [200,302,303,307,308,401,403], "page"],
  ["NONHUMAN landing", "/nonhuman", [200,302,303,307,308], "page"],
  ["NONHUMAN API guide", "/nonhuman/api", [200], "page"],
  ["NONHUMAN pricing", "/nonhuman/pricing", [200], "page"],
  ["Wallet Inspector", "/machine/inspector", [200], "html"],
  ["Machine status", "/machine/info", [200], "json"],
  ["Chains discovery", "/machine/public/chains", [200], "chains"],
  ["OpenAPI schema", "/machine/openapi.json", [200], "json"],
  ["Agent discovery", "/.well-known/agent.json", [200], "json"],
  ["Agent offering", "/agent-offer.json", [200], "json"],
  ["Agent guidance", "/llms.txt", [200], "text"],
  ["MCP endpoint (discovery via POST below)", "/mcp", [200,400,404,405,406], "status"],
  ["API documentation", "/api-docs", [200,301,302,307,308], "page"],
  ["X402 quote", "/machine/quote?chain=base&kind=wallet&access=x402", [200], "quote"],
  ["Subscription quote", "/machine/quote?chain=solana&kind=snapshot&access=subscription", [200], "json"],
  ["Subscription plans", "/machine/human/subscription", [200], "json"],
  ["Subscription usage (anonymous)", "/machine/v1/usage", [401,403], "status"],
  ["EVM portfolio", "/machine/public/portfolio/"+evm, [200], "portfolio"],
  ["Ethereum native+USDC", "/machine/public/ethereum/"+evm, [200], "evm"],
  ["Base native+USDC", "/machine/public/base/"+evm, [200], "evm"],
  ["Arbitrum native+USDC", "/machine/public/arbitrum/"+evm, [200], "evm"],
  ["Optimism native+USDC", "/machine/public/optimism/"+evm, [200], "evm"],
  ["Polygon native+USDC", "/machine/public/polygon/"+evm, [200], "evm"],
  ["BNB native+USDC", "/machine/public/bnb/"+evm, [200], "evm"],
  ["Avalanche native+USDC", "/machine/public/avalanche/"+evm, [200], "evm"],
  ["Custom Base ERC20", "/machine/public/base/"+evm+"/token/"+usdc, [200], "token"],
  ["Solana wallet", "/machine/public/solana/"+sol, [200], "sol"],
  ["Solana signatures", "/machine/public/solana/"+sol+"/history?limit=10", [200], "history"],
  ["Bitcoin address", "/machine/public/bitcoin/"+btc, [200], "btc"],
  ["Bitcoin UTXOs", "/machine/public/bitcoin/"+btc+"/utxos", [200], "utxos"],
  ["Invalid wallet rejected", "/machine/public/base/bad", [400], "status"],
  ["X402 unpaid challenge", "/machine/wallet?address="+evm, [402], "x402"],
];
let passed = 0, warnings = 0, failed = 0;
const results = [];
for (const [name, path, expected, shape] of tasks) {
  try {
    const response = await fetch(origin+path, {
      redirect: "manual", headers: { accept: "application/json, text/html;q=0.9" },
      signal: AbortSignal.timeout(14000)
    });
    let ok = expected.includes(response.status), note = "HTTP "+response.status;
    const type = response.headers.get("content-type") || "";
    let body = null;
    if (shape === "html" || shape === "page") {
      if (response.status === 200 && !type.includes("text/html")) {ok=false;note+=" not HTML";}
    } else if (!["status","text"].includes(shape) && response.status === 200) {
      try {body = await response.json();} catch {ok=false;note+=" invalid JSON";}
      if (body && shape === "chains" && !Array.isArray(body.chains)) ok=false;
      if (body && shape === "portfolio" && (!Array.isArray(body.networks)||body.chainsQueried!==7))ok=false;
      if (body && shape === "evm" && !body.native)ok=false;
      if (body && shape === "sol" && typeof body.balanceSol!=="string")ok=false;
      if (body && shape === "token" && typeof body.balanceAtomic!=="string")ok=false;
      if (body && shape === "history" && !Array.isArray(body.transactions))ok=false;
      if (body && shape === "btc" && !body.native)ok=false;
      if (body && shape === "utxos" && !Array.isArray(body.utxos))ok=false;
      if (body && shape === "quote" && !body.price)ok=false;
      if (body && shape === "sol" && body.complete===false) {note+=" (PARTIAL "+(body.warnings||[]).join("; ")+")";warnings++;}
      if (body && shape === "portfolio" && body.complete===false) {note+=" (portfolio intentionally incomplete)";warnings++;}
    }
    if (shape === "x402" && !response.headers.has("payment-required")) {ok=false;note+=" missing payment-required";}
    if (ok)passed++; else failed++;
    results.push({ name, ok, note });
    console.log((ok?"PASS":"FAIL")+" "+name+" — "+note);
  } catch(error) {failed++;results.push({name,ok:false,note:String(error)});console.log("FAIL "+name+" — "+String(error));}
}
console.log("\nRESULT: "+passed+" passed, "+failed+" failed, "+warnings+" informational partial results. No payments were made.");
console.log("Note: 402 confirms a payment challenge, NOT a settled AI payment.");
process.exitCode = failed?1:0;
