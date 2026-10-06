import { readdirSync, readFileSync } from 'node:fs';

const origin = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const loginResponse = await fetch(origin+'/api/human/account', {headers:{accept:'application/json'},redirect:'error'});
const login = await loginResponse.json();
if (loginResponse.status !== 200 || login.authenticated !== false || login.verified !== false)
  throw new Error('The original HUMAN login session endpoint is unavailable or returned an unexpected anonymous session');
console.log('PASS original HUMAN login endpoint');
for (const path of ['/owner', '/owner/access', '/owner/treasury']) {
  const response = await fetch(origin+path, { redirect: 'manual' });
  if (response.status !== 404 || !response.headers.get('cache-control')?.includes('no-store'))
    throw new Error('Anonymous owner access must be refused without caching');
}
const ownerWrite = await fetch(origin+'/owner/withdrawal/prepare', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
});
if (ownerWrite.status !== 404) throw new Error('Anonymous owner withdrawal preparation must be refused');
console.log('PASS owner treasury is private');
const blogDirectory = new URL('../../blog/data/', import.meta.url);
const articles = readdirSync(blogDirectory)
  .filter((name) => name.endsWith('.json'))
  .map((name) => JSON.parse(readFileSync(new URL(name, blogDirectory), 'utf8')))
  .filter((post) => post.status === 'published' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug));
for (const path of ['/blog', '/sitemap.xml', ...articles.map((post) => '/blog/'+post.slug)]) {
  const response = await fetch(origin+path);
  if (response.status !== 200) throw new Error(`${path}: HTTP ${response.status}`);
  console.log(`PASS ${path}`);
}
const missingArticle = await fetch(origin+'/blog/this-article-does-not-exist');
if (missingArticle.status !== 404) throw new Error('Unknown blog articles must return HTTP 404');
console.log('PASS missing article returns 404');
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
