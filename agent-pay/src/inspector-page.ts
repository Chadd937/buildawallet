export const inspectorHtml = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Wallet Inspector | BuildAWallet</title>
<meta name="description" content="Inspect public cryptocurrency wallet balances, tokens and transaction details. Includes a free API and terminal guide.">
<style>
:root{color-scheme:dark;--bg:#080e1c;--panel:#121d31;--line:#2b3b55;--ink:#f1f6ff;--muted:#a6b8d0;--accent:#50e7ba}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at top,#203754 0%,var(--bg) 65%);font:16px/1.55 system-ui,Arial,sans-serif;color:var(--ink)}
a{color:#8fe9ff}header,main,footer{max-width:1120px;margin:auto;padding:20px}header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}header strong{font-size:1.25rem}header nav a{margin-left:20px}
h1{font-size:clamp(2rem,5vw,3.2rem);margin:20px 0 4px}h2{font-size:1.35rem}p{color:var(--muted)}.lead{max-width:780px;font-size:1.05rem}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:17px;padding:20px;margin:18px 0;box-shadow:0 14px 45px #0002}
form{display:grid;grid-template-columns:190px 1fr auto;gap:12px}label{display:block;color:var(--muted);font-size:.9rem;margin-bottom:6px}
input,select,button{width:100%;border:1px solid #405674;border-radius:10px;padding:12px;background:#0c1628;color:var(--ink);font:inherit}
button{background:linear-gradient(120deg,#58d7bd,#7eafff);color:#061121;font-weight:750;cursor:pointer;border:0}button:disabled{opacity:.6;cursor:wait}
.secondary{background:#273a54;color:var(--ink)}.actions{display:flex;gap:8px;flex-wrap:wrap}.actions button{width:auto}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.tile{background:#0a1627;border:1px solid var(--line);padding:14px;border-radius:12px}
.tile b{font-size:1.08rem}.muted{color:var(--muted)}.ok{color:#71ebc2}.warn{color:#ffc47e}.bad{color:#ff9ba6}
pre{overflow:auto;background:#07111f;border:1px solid var(--line);border-radius:12px;padding:15px;color:#d8ecff;white-space:pre-wrap;word-break:break-word}
code{overflow-wrap:anywhere}details{margin:16px 0}summary{cursor:pointer;font-weight:bold}.hidden{display:none!important}
#status{min-height:25px}footer{border-top:1px solid var(--line);color:var(--muted)}
@media(max-width:700px){form{grid-template-columns:1fr}header nav a{margin-left:8px}}
</style></head>
<body><header><strong>◈ BuildAWallet</strong><nav><a href="/">Home</a><a href="/api-docs">API docs</a></nav></header>
<main><h1>Wallet Inspector</h1><p class="lead">Look up a public wallet address using BuildAWallet's read-only, public-API-backed blockchain endpoints. No login, seed phrase or private key required. For Solana, try a direct browser RPC lookup if the Cloudflare server is rate-limited; browser CORS and public RPC limits still apply.</p>
<section class="panel"><h2>Look up an address</h2>
<form id="lookup"><div><label for="chain">Network</label><select id="chain">
<option value="portfolio">All 7 EVM networks</option><option value="solana">Solana</option>
<option value="ethereum">Ethereum</option><option value="base">Base</option><option value="polygon">Polygon</option>
<option value="bnb">BNB Chain</option><option value="arbitrum">Arbitrum</option>
<option value="optimism">Optimism</option><option value="avalanche">Avalanche</option><option value="bitcoin">Bitcoin</option>
</select></div><div><label for="address">Public wallet address</label><input id="address" spellcheck="false" autocomplete="off" maxlength="128" placeholder="Paste a public wallet address" required></div>
<div><label>&nbsp;</label><button id="search" type="submit">Inspect wallet</button></div></form>
<p id="status" role="status" aria-live="polite">Select a chain, paste a public address and inspect.</p>
<div id="results" class="grid" aria-live="polite"></div>
<div class="actions"><button id="history" class="secondary hidden" type="button">Load Solana signatures</button>
<button id="utxos" class="secondary hidden" type="button">Load Bitcoin UTXOs</button>
<button id="directsol" class="secondary hidden" type="button">Try direct Solana token lookup (browser)</button>
<button id="copyapi" class="secondary hidden" type="button">Copy API URL</button></div>
<details><summary>Raw API response</summary><pre id="raw">Run a lookup to see JSON.</pre></details>
</section>
<section class="panel" id="developer"><h2>Use the same service from your terminal or app</h2>
<p>Both this visual page and the terminal examples use the same JSON endpoints. Public lookups require no API key. Requests are rate-limited and data may be incomplete if an upstream public provider restricts a method.</p>
<h3>1. Open a terminal</h3><p>On Linux, open Terminal (Ctrl+Alt+T). Replace the sample address with your own <b>public</b> address. Install jq only if you want formatted JSON.</p>
<h3>2. Query a wallet</h3><pre id="sample">curl -sS "https://buildawallet.xyz/machine/public/chains" | jq .</pre><div class="actions"><button id="copysample" type="button" class="secondary">Copy terminal command</button></div>
<p>Examples: <code>GET /machine/public/portfolio/{evmAddress}</code> combines the seven EVM networks; <code>GET /machine/public/solana/{address}</code> reads SOL and available token accounts; <code>GET /machine/public/bitcoin/{address}</code> reads BTC information. See also <code>/solana/{address}/history?limit=10</code>, <code>/bitcoin/{address}/utxos</code> and <code>/{evmChain}/{address}/token/{tokenContract}</code>.</p>
<h3>3. Interpret the response</h3><p><code>balance</code> is a human-readable native amount; <code>balanceAtomic</code> is the raw integer. <code>complete:false</code>, <code>null</code>, or warnings mean the lookup does not cover everything. <code>429</code> indicates rate limiting; <code>503</code> indicates an upstream read failed. An absent token account is not proof of zero tokens if discovery failed. EVM token lists, NFTs, full history, Solana staking, and Bitcoin Ordinals/Runes are not comprehensively indexed here.</p>
<h3>4. Use it in code</h3><pre>const response = await fetch("https://buildawallet.xyz/machine/public/chains");
if (!response.ok) throw new Error("Wallet API HTTP " + response.status);
const data = await response.json();
console.log(data);</pre>
<p class="warn"><strong>Security:</strong> Never paste a private key, seed phrase, wallet password or signing credential into a lookup form or terminal URL. This is a watch-only tool. It cannot move funds.</p></section>
</main><footer>BuildAWallet.xyz · Public-chain data can be delayed, partial or unavailable. No financial or custody guarantees.</footer>
<script>
(function(){
"use strict";
var form=document.getElementById("lookup"),network=document.getElementById("chain"),address=document.getElementById("address");
var status=document.getElementById("status"),results=document.getElementById("results"),raw=document.getElementById("raw");
var search=document.getElementById("search"),history=document.getElementById("history"),utxos=document.getElementById("utxos"),copyapi=document.getElementById("copyapi"),sample=document.getElementById("sample");
var base=location.origin+"/machine/public",lastUrl="";
var directsol=document.getElementById("directsol"), solanaRpc="https://api.mainnet-beta.solana.com";
var evm=/^0x[0-9a-fA-F]{40}$/,sol=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/,btc=/^(bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/;
function node(tag,cls,label){var x=document.createElement(tag);if(cls)x.className=cls;if(label!==undefined)x.textContent=String(label);return x}
function tile(title,value,detail){var x=node("article","tile"),heading=node("div","muted",title),number=node("b","",value);x.append(heading,number);if(detail)x.append(node("div","muted",detail));results.append(x)}
function show(d){results.replaceChildren();if(Array.isArray(d.networks)){d.networks.forEach(function(row){if(!row.ok){tile(row.chain,"Unavailable","Public RPC failed");return}var n=row.data.native||{};tile(row.chain,String(n.balance||"0")+" "+String(n.symbol||""),row.data.stablecoin?"USDC "+row.data.stablecoin.balance:"USDC unavailable / no configured token read")});return}
var n=d.native||{};var value=d.balanceSol!==undefined?d.balanceSol+" SOL":n.balance!==undefined?n.balance+" "+n.symbol:"No native balance returned";
tile("Native balance",value,d.chain||"");if(d.stablecoin)tile("USDC",d.stablecoin.balance,d.stablecoin.contract);if(d.tokenAccountCount!==undefined)tile("Token accounts",d.tokenAccountCount===null?"Unknown":d.tokenAccountCount,d.complete?"Reported":"Token discovery may be incomplete");if(d.recentTransactions)tile("Recent signatures",d.recentTransactions.length,"Not necessarily full history");if(d.warnings&&d.warnings.length)tile("Warnings",d.warnings.length,d.warnings.join("; "));
if(d.complete===false)status.textContent="Partial data: some assets or history may not be indexed or available."}
function valid(chain,value){if(chain==="solana")return sol.test(value);if(chain==="bitcoin")return btc.test(value);return evm.test(value)}
function url(chain,value){return base+"/"+(chain==="portfolio"?"portfolio":chain)+"/"+encodeURIComponent(value)}
function sampleCommand(){var u=lastUrl||base+"/chains";return "curl -sS '"+u+"' | jq ."}
async function copy(value){try{await navigator.clipboard.writeText(value);status.textContent="Copied to clipboard."}catch{status.textContent="Copy failed. Select the text manually."}}
async function load(u){status.textContent="Loading public blockchain data…";search.disabled=true;results.replaceChildren();history.classList.add("hidden");utxos.classList.add("hidden");directsol.classList.add("hidden");
try{var r=await fetch(u,{headers:{"Accept":"application/json"}}),d=await r.json();raw.textContent=JSON.stringify(d,null,2);if(!r.ok)throw Error(d.error||("HTTP "+r.status));show(d);
history.classList.toggle("hidden",network.value!=="solana");utxos.classList.toggle("hidden",network.value!=="bitcoin");directsol.classList.toggle("hidden",network.value!=="solana");
copyapi.classList.remove("hidden");
if(d.complete!==false)status.textContent="Lookup returned successfully. Some asset categories may still require indexing.";
}catch(e){status.textContent="Lookup error: "+(e instanceof Error?e.message:"Request failed");tile("Lookup unavailable","No verified data","Do not treat an error as zero balance")}finally{search.disabled=false}}
form.addEventListener("submit",function(e){e.preventDefault();var value=address.value.trim(),chain=network.value;if(!valid(chain,value)){status.textContent="That public address does not match the selected network.";return}lastUrl=url(chain,value);sample.textContent=sampleCommand();load(lastUrl);
var q=new URL(location.href);q.searchParams.set("chain",chain);q.searchParams.set("address",value);window.history.replaceState(null,"",q)});
history.addEventListener("click",function(){var u=base+"/solana/"+encodeURIComponent(address.value.trim())+"/history?limit=10";lastUrl=u;sample.textContent=sampleCommand();load(u)});
utxos.addEventListener("click",function(){var u=base+"/bitcoin/"+encodeURIComponent(address.value.trim())+"/utxos";lastUrl=u;sample.textContent=sampleCommand();load(u)});
async function directRpc(method,params){
var response=await fetch(solanaRpc,{method:"POST",headers:{"Content-Type":"application/json"},
body:JSON.stringify({jsonrpc:"2.0",id:1,method:method,params:params})});
if(!response.ok)throw Error("RPC HTTP "+response.status);
var data=await response.json();if(data.error)throw Error("RPC error "+data.error.code);
if(!Object.prototype.hasOwnProperty.call(data,"result"))throw Error("Invalid RPC response");
return data.result;
}
directsol.addEventListener("click",async function(){
if(network.value!=="solana"||!sol.test(address.value.trim()))return;
directsol.disabled=true;status.textContent="Checking public Solana token programs directly from your browser…";
var wallet=address.value.trim(),programs=[
["SPL Token","TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"],
["Token-2022","TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"]];
var output={source:"direct_browser_rpc",network:"mainnet-beta",address:wallet,tokenAccounts:[],warnings:[]};
try{
var genesis=await directRpc("getGenesisHash",[]);
if(genesis!=="5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d")throw Error("RPC network mismatch");
for(var item of programs){
try{
var result=await directRpc("getTokenAccountsByOwner",[wallet,{programId:item[1]},{encoding:"jsonParsed",commitment:"confirmed"}]);
if(!result||!Array.isArray(result.value))throw Error("Invalid token-account response");
for(var entry of result.value){
var info=entry.account?.data?.parsed?.info,amount=info?.tokenAmount;
if(info?.owner!==wallet||typeof info?.mint!=="string"||typeof amount?.amount!=="string")continue;
output.tokenAccounts.push({program:item[0],account:entry.pubkey,mint:info.mint,
amountAtomic:amount.amount,decimals:amount.decimals,amount:amount.uiAmountString??null});
}
}catch(error){output.warnings.push(item[0]+": "+(error instanceof Error?error.message:"Unavailable"))}
}
output.complete=output.warnings.length===0;
tile("Direct SPL accounts",output.complete?output.tokenAccounts.length:"Partial / unknown",
"Browser RPC, not the Worker; results are not exhaustive");
output.tokenAccounts.forEach(function(t){tile(t.program+": "+(t.mint==="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"?"USDC":t.mint),
(t.amount??t.amountAtomic)+" tokens","Mint: "+t.mint)});
raw.textContent=JSON.stringify(output,null,2);status.textContent=output.warnings.length?
"Direct token lookup partially succeeded. Check warnings in raw JSON.":"Direct token lookup succeeded for both token programs.";
}catch(error){status.textContent="Browser RPC unavailable ("+(error instanceof Error?error.message:"connection failed")+"). Public RPC browser CORS/rate limits may block it."}
finally{directsol.disabled=false}
});
copyapi.addEventListener("click",function(){copy(lastUrl)});
document.getElementById("copysample").addEventListener("click",function(){copy(sampleCommand())});
var q=new URLSearchParams(location.search),c=q.get("chain"),a=q.get("address");if(c&&a&&Array.from(network.options).some(function(x){return x.value===c})&&valid(c,a)){network.value=c;address.value=a;lastUrl=url(c,a);sample.textContent=sampleCommand();load(lastUrl)}
})();
</script></body></html>`;