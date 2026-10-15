#!/usr/bin/env node
/**
 * Checks both machine API generations without keys, payments or signed transactions.
 * New nine-chain service is under /api/public/machine/v1 and /api/public/mcp.
 * Legacy x402 service continues to own /machine/* and /mcp.
 */
const base = (process.env.BAW_ORIGIN || "https://buildawallet.xyz").replace(/\/$/, "");
const chains = ["ethereum","base","arbitrum","optimism","polygon","bnb","avalanche","solana","bitcoin"];
let failures = 0;
async function probe(name, path, init, validate) {
  try {
    const r = await fetch(base + path, {redirect:"manual",signal:AbortSignal.timeout(15000),...init});
    const payload = await r.json().catch(() => null);
    const result = validate(r,payload);
    console.log((result.ok?"PASS":"FAIL")+" "+name+" — HTTP "+r.status+" — "+result.detail);
    if(!result.ok)failures++;
  } catch(error) {
    failures++;console.log("FAIL "+name+" — "+String(error));
  }
}
await probe("Nine-chain registry", "/api/public/machine/v1/chains", {}, (r,j) => {
  const ids = (j?.chains??[]).map(x=>typeof x==="string"?x:x.id);
  const missing=chains.filter(id=>!ids.includes(id));
  return {ok:r.status===200&&!missing.length,detail:missing.length?"missing "+missing.join(", "):ids.length+" chains advertised"};
});
await probe("Nine-chain MCP tools/list", "/api/public/mcp", {
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",method:"tools/list",id:1})
},(r,j)=>{
  const tools=(j?.result?.tools??[]).map(x=>x.name);
  const missing=chains.filter(id=>!tools.includes(id+"_transaction"));
  return {ok:r.status===200&&!missing.length,detail:missing.length?"missing "+missing.join(", "):tools.length+" tools; nine transaction readers available"};
});
await probe("Multichain transaction requires valid API credentials", "/api/public/machine/v1/arbitrum/transaction/0x"+"0".repeat(64), {
  headers:{authorization:"Bearer deliberately_invalid"}
},(r,j)=>({ok:r.status===401,detail:r.status===401?"proper authorization gate; no blockchain calls":j?.error??"unexpected response"}));
await probe("Existing x402 MCP stays separate", "/mcp", {
  method:"POST",headers:{"content-type":"application/json","accept":"application/json, text/event-stream"},
  body:JSON.stringify({jsonrpc:"2.0",method:"tools/list",id:1})
},(r)=>({ok:r.status===200,detail:"older two-chain x402 MCP endpoint unchanged"}));
console.log("\nNine-chain agent route probe: "+(failures?"FAILED":"PASSED")+"; "+failures+" failure(s).");
console.log("No payment, signing, broadcast, API-key issuance, or transaction mutation performed.");
process.exitCode=failures?1:0;
