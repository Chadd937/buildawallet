const base = 'https://buildawallet.xyz';
const protectedPaths = [
  '/human', '/human/build', '/human/studio', '/human/live', '/human/pay', '/pay',
  '/w/access-check', '/machine/ai/chat', '/machine/human/chat', '/machine/human/save',
  '/machine/human/gallery', '/machine/human/wallet/access-check',
  '/api/start', '/api/chat', '/api/save', '/api/gallery', '/api/wallet/access-check',
  '/human.html', '/human-build.html', '/human-studio.html', '/human-live.html', '/human-pay.html',
  '/static/human.html', '/static/human-build.html', '/static/human-studio.html',
  '/static/human-live.html', '/static/human-pay.html',
];
const publicPaths = ['/', '/docs', '/pricing', '/machine/info', '/api-docs', '/.well-known/agent.json'];

for (const path of protectedPaths) {
  const response = await fetch(base + path, { redirect: 'manual', cache: 'no-store' });
  const location = response.headers.get('location') ?? '';
  if (!(response.status >= 300 && response.status < 400 &&
    (/\/cdn-cgi\/access\//.test(location) || /\.cloudflareaccess\.com\//.test(location)))) {
    throw Error(`${path} is not showing Cloudflare Access sign-in (HTTP ${response.status}). Check the Access application paths before deploying.`);
  }
}
for (const path of publicPaths) {
  const response = await fetch(base + path, { redirect: 'manual', cache: 'no-store' });
  if (response.status !== 200) {
    throw Error(`${path} must stay public (HTTP ${response.status}). Check the Access application scope.`);
  }
}
console.log('Cloudflare Access guards HUMAN pages and builder data; landing and machine discovery remain public.');
