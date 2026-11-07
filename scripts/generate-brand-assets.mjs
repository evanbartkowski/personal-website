import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium } from '@playwright/test';

// Raster search/share assets use the site's existing orbital logo. This helper
// runs entirely offline and never needs the development server or credentials.
const root = resolve(import.meta.dirname, '..');
const brandDirectory = join(root, 'assets', 'brand');
await mkdir(brandDirectory, { recursive: true });
const logo = await readFile(join(root, 'favicon.svg'), 'utf8');
const logoURL = `data:image/svg+xml;base64,${Buffer.from(logo).toString('base64')}`;
const fontURL = name => readFile(join(root, 'assets', 'fonts', name)).then(buffer => `data:font/${name.endsWith('.woff2') ? 'woff2' : 'ttf'};base64,${buffer.toString('base64')}`);
const [headingFont, bodyFont, monoFont] = await Promise.all([
  fontURL('barlow-condensed-bold.ttf'), fontURL('space-grotesk.woff2'), fontURL('ibm-plex-mono.woff2'),
]);
const executablePath = process.env.CHROME_PATH || join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const browser = await chromium.launch({ ...(existsSync(executablePath) ? { executablePath } : { channel: 'chrome' }), headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1 });
try {
  await page.route('**/*', route => route.abort());
  for (const [name, size] of [['logo-512.png', 512], ['favicon-96.png', 96], ['apple-touch-icon.png', 180]]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%;background:#000}img{display:block;width:100%;height:100%}</style></head><body><img src="${logoURL}" alt="Evan Bartkowski orbital logo"></body></html>`);
    await page.locator('img').evaluate(image => image.decode());
    await page.screenshot({ path: join(brandDirectory, name) });
  }

  // Fixed coordinates keep regenerated previews identical across builds.
  const stars = Array.from({ length: 70 }, (_, i) => {
    const x = (i * 173 + 19) % 1200, y = (i * 97 + 43) % 630;
    return `<circle cx="${x}" cy="${y}" r="${i % 9 === 0 ? 1.2 : .7}" opacity="${i % 4 === 0 ? .65 : .22}"/>`;
  }).join('');
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<!doctype html><html><head><style>
    @font-face{font-family:Heading;src:url('${headingFont}') format('truetype');font-weight:700}
    @font-face{font-family:Body;src:url('${bodyFont}') format('woff2')}
    @font-face{font-family:Mono;src:url('${monoFont}') format('woff2')}
    *{box-sizing:border-box}html,body{width:1200px;height:630px;margin:0;overflow:hidden;background:#000;color:#dce5d4}
    body{position:relative;font-family:Body,sans-serif;background:radial-gradient(ellipse at 81% 43%,#0d190d 0%,#020603 30%,#000 63%)}
    .stars{position:absolute;inset:0;fill:#e6e3ce}.frame{position:absolute;inset:33px;border:1px solid #273321}
    .frame:before,.frame:after{content:'';position:absolute;width:52px;height:3px;background:#639c47;top:-2px;left:-1px}.frame:after{top:auto;left:auto;right:-1px;bottom:-2px}
    .content{position:absolute;left:82px;top:84px;width:680px}.eyebrow{font:12px Mono,monospace;letter-spacing:3px;color:#809c70;margin:0 0 31px}
    h1{font:700 111px/.91 Heading,sans-serif;letter-spacing:1px;margin:0 0 31px}h1 span{display:block;color:#79a95f}
    .role{font-size:25px;letter-spacing:-.6px;margin:0;color:#c5d3bb}.focus{font:13px Mono,monospace;letter-spacing:.5px;color:#839179;margin:21px 0 0}
    .orbit{position:absolute;right:91px;top:139px;width:290px;height:290px;border-radius:50%;border:1px solid #283722;display:grid;place-items:center}
    .orbit:before{content:'';position:absolute;inset:-20px;border-radius:50%;border:1px dashed #202b1b}
    .orbit:after{content:'';position:absolute;inset:19px;border-radius:50%;border:1px solid #314028}
    .orbit img{position:relative;width:224px;height:224px;border-radius:56px;z-index:1;box-shadow:0 0 65px #629d4412}
    .cross{position:absolute;color:#8aa778;font:20px Mono;right:239px;top:106px}.point{position:absolute;right:83px;top:285px;width:7px;height:7px;background:#95b47f;border-radius:50%;box-shadow:0 0 12px #639c4780}
    footer{position:absolute;left:82px;right:82px;bottom:68px;border-top:1px solid #2a3823;padding-top:19px;display:flex;align-items:center;justify-content:space-between;font:11px Mono;letter-spacing:1.2px;color:#7d936f}
    footer b{font-weight:400;color:#9db48e;letter-spacing:.6px}
  </style></head><body>
    <svg class="stars" width="1200" height="630" aria-hidden="true">${stars}</svg><div class="frame"></div>
    <div class="content"><p class="eyebrow">EVAN BARTKOWSKI / PORTFOLIO</p><h1>EVAN<span>BARTKOWSKI</span></h1><p class="role">Cybersecurity Engineer &amp; Developer</p><p class="focus">SECURITY OPERATIONS / LINUX / AI / SOFTWARE</p></div>
    <span class="cross">+</span><div class="orbit"><img src="${logoURL}" alt="Evan Bartkowski orbital logo"></div><span class="point"></span>
    <footer><b>EXPERIENCE · CREDENTIALS · PROJECTS</b><span>evanbartkowski.com</span></footer>
  </body></html>`);
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
  await page.screenshot({ path: join(root, 'assets', 'social-preview.png') });
  console.log('Generated orbital logo PNGs (512, 180, 96) and 1200×630 social preview.');
} finally {
  await browser.close();
}
