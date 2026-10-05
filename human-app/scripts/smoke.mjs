const origin = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const loginResponse = await fetch(origin+'/api/human/account', {headers:{accept:'application/json'},redirect:'error'});
const login = await loginResponse.json();
if (loginResponse.status !== 200 || login.authenticated !== false || login.verified !== false)
  throw new Error('The original HUMAN login session endpoint is unavailable or returned an unexpected anonymous session');
console.log('PASS original HUMAN login endpoint');
for (const path of ['/', '/human/setup', '/human/studio', '/human/wallet', '/human/deploy', '/human/android', '/nonhuman', '/nonhuman/wallets', '/nonhuman/pay-per-call', '/nonhuman/mcp', '/nonhuman/api', '/nonhuman/chains', '/nonhuman/pricing', '/nonhuman/dashboard', '/openapi.json', '/.well-known/agent.json', '/llms.txt', '/machine/v1/chains', '/machine/v1/plans', '/api/public/machine/v1/chains']) {
  const response = await fetch(origin+path);
  if (response.status !== 200) throw new Error(`${path}: HTTP ${response.status}`);
  console.log(`PASS ${path}`);
}
const r = await fetch(origin+'/mcp', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'}) });
const mcp = await r.json();
if (r.status !== 200 || mcp.result?.tools?.length < 50) throw new Error('MCP tools failed');
console.log(`PASS MCP ${mcp.result.tools.length} tools`);
const denied = await fetch(origin+'/machine/v1/base/wallet/0x0000000000000000000000000000000000000001', {headers:{authorization:'Bearer garbage'}});
if (denied.status !== 401) throw new Error('Invalid credential was not refused');
console.log('PASS invalid bearer refused');
