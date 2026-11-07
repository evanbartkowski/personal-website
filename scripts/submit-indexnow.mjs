import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { siteOrigin, readSearchConfig } from './site-seo.mjs';

// The ownership token is intentionally public, never a service credential.
// Validate deployed content before notifying engines about these exact URLs.
const root = resolve(import.meta.dirname,'..');
const config = await readSearchConfig(root);
const request = (url,options={}) => fetch(url,{redirect:'error',signal:AbortSignal.timeout(30_000),...options});
const keyLocation = `${siteOrigin}/${config.indexNowKey}.txt`;
const keyResponse = await request(keyLocation);
if (!keyResponse.ok || (await keyResponse.text()).trim() !== config.indexNowKey) throw new Error('Deploy and verify the public IndexNow ownership file before submission');
const sitemapResponse = await request(`${siteOrigin}/sitemap.xml`);
if (!sitemapResponse.ok) {await sitemapResponse.body?.cancel();throw new Error('The deployed sitemap is unavailable');}
const sitemap = await sitemapResponse.text();
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1].replaceAll('&amp;','&'));
if (!urlList.length || urlList.length > 10000 || urlList.some(value=>new URL(value).origin !== siteOrigin || /\/api\/|\/editor(?:\/|$)/.test(new URL(value).pathname))) throw new Error('Invalid sitemap submission URLs');
for (const url of urlList) {
  const response = await request(url);
  const html = await response.text();
  if (!response.ok || !html.includes(`rel="canonical" href="${url}"`) || /name="robots"[^>]*content="[^"]*noindex/.test(html)) throw new Error(`Public page is not ready for discovery: ${url}`);
}
const response = await request('https://api.indexnow.org/indexnow',{
  method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},
  body:JSON.stringify({host:new URL(siteOrigin).host,key:config.indexNowKey,keyLocation,urlList}),
});
await response.body?.cancel();
if (![200,202].includes(response.status)) throw new Error(`IndexNow declined the submission (HTTP ${response.status}); no indexing success is implied`);
console.log(`IndexNow received ${urlList.length} canonical URLs (HTTP ${response.status}${response.status===202 ? ', ownership validation pending' : ''}). Search engines decide whether and when to index them.`);
