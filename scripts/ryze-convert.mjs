import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = resolve(root, process.env.RYZE_INPUT || 'blog/data');
const outputs = process.env.RYZE_OUTPUT ? [resolve(root, process.env.RYZE_OUTPUT)] : [join(root, 'static/blog'), join(root, 'human-app/public/blog')];
const base = 'https://buildawallet.xyz/blog';
const escape = (value = '') => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const safeUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } };
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const css = `:root{color-scheme:dark;--bg:#071009;--text:#f7ffe9;--muted:#a7b5a2;--green:#6df58c;--line:#304235}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 15% 0%,#142b19,transparent 38%),var(--bg);color:var(--text);font:17px/1.75 Inter,system-ui,sans-serif}a{color:var(--green);text-underline-offset:4px}header,footer{max-width:1120px;margin:auto;padding:24px;display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}header{border-bottom:1px solid var(--line)}nav{display:flex;gap:18px;flex-wrap:wrap}main{max-width:900px;margin:auto;padding:48px 24px 72px}h1{font-size:clamp(32px,5vw,54px);line-height:1.12;letter-spacing:-.035em;margin:12px 0 24px}h2{font-size:clamp(25px,4vw,34px);line-height:1.3;margin:44px 0 16px}h3{font-size:22px;line-height:1.4;margin-top:28px}p,li{overflow-wrap:anywhere}li{margin:10px 0}img{max-width:100%;height:auto;border-radius:14px}figure{margin:30px 0}figcaption,.muted,time{color:var(--muted);font-size:14px}pre{overflow:auto;max-width:100%;background:#101910;padding:20px;border:1px solid var(--line);border-radius:12px}code{font-family:ui-monospace,monospace;font-size:.88em;overflow-wrap:anywhere}blockquote{border-left:3px solid var(--green);padding-left:20px;color:#d5e8cf}.table-scroll{overflow-x:auto;max-width:100%}table{width:100%;border-collapse:collapse;font-size:14px;min-width:560px}th,td{padding:12px;text-align:left;border:1px solid var(--line);vertical-align:top}th{background:#14251a}article{min-width:0}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:24px}.card{padding:20px;border:1px solid var(--line);border-radius:16px;background:#101910}.card h2{font-size:25px;margin:16px 0}.card img{aspect-ratio:16/9;width:100%;object-fit:cover}.hero{width:100%;max-height:480px;object-fit:cover;margin:20px 0 32px}.eyebrow{font:700 12px/1.5 ui-monospace,monospace;letter-spacing:.12em;color:var(--green)}footer{border-top:1px solid var(--line);font-size:14px}a:focus-visible{outline:2px solid var(--green);outline-offset:5px}hr{border:0;border-top:1px solid var(--line);margin:32px 0}`;
function page(title, description, url, content, schema = null, image = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${escape(url)}"><link rel="icon" href="/buildawallet-favicon.svg"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(url)}">${image ? `<meta property="og:image" content="${escape(image)}">` : ''}<style>${css}</style>${schema ? `<script type="application/ld+json">${json(schema)}</script>` : ''}</head><body><header><a href="/">BuildAWallet</a><nav aria-label="Main navigation"><a href="/blog">Blog</a><a href="/human/setup">HUMAN</a><a href="/docs">Docs</a></nav></header><main>${content}</main><footer><span>BuildAWallet · Wallet design and data guides</span><nav aria-label="Legal"><a href="/terms">Terms</a><a href="/privacy">Privacy</a></nav></footer></body></html>\n`;
}
const entries = [];
for (const filename of (await readdir(input)).sort()) {
  if (!filename.endsWith('.json')) continue;
  const article = JSON.parse(await readFile(join(input, filename), 'utf8'));
  if (article.status !== 'published') continue;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug)) throw new Error(`Invalid slug in ${filename}`);
  if (!article.title || typeof article.body_html !== 'string' || !article.body_html.trim()) throw new Error(`Missing title or rendered body in ${filename}`);
  if (entries.some(item => item.slug === article.slug)) throw new Error(`Duplicate slug: ${article.slug}`);
  entries.push(article);
}
entries.sort((a,b) => String(b.published_at || '').localeCompare(String(a.published_at || '')) || a.slug.localeCompare(b.slug));
for (const output of outputs) {
  await mkdir(output, {recursive:true});
  for (const article of entries) {
    const url = `${base}/${article.slug}`;
    const image = safeUrl(article.image?.url);
    const stamp = article.published_at && !Number.isNaN(Date.parse(article.published_at)) ? new Date(article.published_at).toISOString() : '';
    const body = article.body_html.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, table => `<div class="table-scroll" role="region" aria-label="Comparison table" tabindex="0">${table}</div>`);
    const schema = {'@context':'https://schema.org','@type':'BlogPosting',headline:article.title,description:article.meta_description || article.excerpt || '',mainEntityOfPage:url,author:{'@type':'Organization',name:'BuildAWallet'},publisher:{'@type':'Organization',name:'BuildAWallet'},...(stamp ? {datePublished:stamp} : {}),...(image ? {image:[image]} : {})};
    const html = page(article.meta_title || article.title, article.meta_description || article.excerpt || '', url, `<article><p class="eyebrow">WALLET GUIDES</p><h1>${escape(article.title)}</h1>${stamp ? `<time datetime="${escape(stamp)}">Published ${escape(stamp.slice(0,10))}</time>` : ''}${image ? `<img class="hero" src="${escape(image)}" alt="${escape(article.image.alt || article.title)}" decoding="async" fetchpriority="high">` : ''}<div class="article-body">${body}</div><hr><a href="/blog">← All wallet guides</a></article>`, schema, image);
    const folder = join(output, article.slug);
    await mkdir(folder, {recursive:true});
    await writeFile(join(folder, 'index.html'), html);
  }
  const cards = entries.map(article => { const image = safeUrl(article.image?.url); return `<article class="card">${image ? `<img src="${escape(image)}" alt="${escape(article.image.alt || article.title)}" loading="lazy" decoding="async">` : ''}<h2><a href="/blog/${escape(article.slug)}">${escape(article.title)}</a></h2><p class="muted">${escape(article.excerpt || article.meta_description || '')}</p></article>`; }).join('');
  await writeFile(join(output, 'index.html'), page('Wallet Guides | BuildAWallet', 'Practical guides to wallet design, custody choices and agent wallet data. Understand the limits before choosing an implementation.', base, `<p class="eyebrow">BUILDAWALLET JOURNAL</p><h1>Wallet design. Clear decisions.</h1><p>Practical guides for people designing wallets and developers working with wallet data.</p><div class="cards">${cards || '<p>New guides are coming soon.</p>'}</div>`));
  await writeFile(join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${base}</loc></url>${entries.map(article => `<url><loc>${base}/${escape(article.slug)}</loc></url>`).join('')}</urlset>\n`);
}
console.log(`Rendered ${entries.length} published articles to ${outputs.length} blog directories.`);
