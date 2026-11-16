import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium } from '@playwright/test';

// Raster search/share assets use the site's cybersecurity/AI logo. This helper
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
  const iconSizes = [
    ['logo-512.png', 512],
    ['android-chrome-192.png', 192],
    ['apple-touch-icon.png', 180],
    ['favicon-96.png', 96],
    ['favicon-48.png', 48],
    ['favicon-32.png', 32],
    ['favicon-16.png', 16],
  ];

  const pngBuffers = {};
  for (const [name, size] of iconSizes) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;padding:0;width:100%;height:100%;background:transparent}img{display:block;width:100%;height:100%}</style></head><body><img src="${logoURL}" alt="Evan Bartkowski CompTIA CSAP cybersecurity logo"></body></html>`);
    await page.locator('img').evaluate(image => image.decode());
    const buffer = await page.screenshot({ path: join(brandDirectory, name), omitBackground: true });
    pngBuffers[size] = buffer;
  }

  // Package multi-resolution favicon.ico containing 16x16, 32x32, and 48x48 PNG frames
  const icoSizes = [16, 32, 48];
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // ICO type
  header.writeUInt16LE(icoSizes.length, 4); // Number of images

  let currentOffset = 6 + (16 * icoSizes.length);
  const entries = [];
  const imageBuffers = [];

  for (const size of icoSizes) {
    const png = pngBuffers[size];
    imageBuffers.push(png);
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // Color palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(png.length, 8); // Image size in bytes
    entry.writeUInt32LE(currentOffset, 12); // Offset
    entries.push(entry);
    currentOffset += png.length;
  }

  const icoBuffer = Buffer.concat([header, ...entries, ...imageBuffers]);
  await writeFile(join(root, 'favicon.ico'), icoBuffer);

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
    body{position:relative;font-family:Body,sans-serif;background:radial-gradient(ellipse at 81% 43%,#0c1420 0%,#04070d 35%,#000 65%)}
    .stars{position:absolute;inset:0;fill:#e2e8f0}.frame{position:absolute;inset:33px;border:1px solid #1e293b}
    .frame:before,.frame:after{content:'';position:absolute;width:52px;height:3px;background:#38bdf8;top:-2px;left:-1px}.frame:after{top:auto;left:auto;right:-1px;bottom:-2px}
    .content{position:absolute;left:82px;top:84px;width:680px}.eyebrow{font:12px Mono,monospace;letter-spacing:3px;color:#94a3b8;margin:0 0 31px}
    h1{font:700 111px/.91 Heading,sans-serif;letter-spacing:1px;margin:0 0 31px;color:#f8fafc}h1 span{display:block;color:#cbd5e1}
    .role{font-size:25px;letter-spacing:-.6px;margin:0;color:#e2e8f0}.focus{font:13px Mono,monospace;letter-spacing:.5px;color:#94a3b8;margin:21px 0 0}
    .orbit{position:absolute;right:91px;top:139px;width:290px;height:290px;border-radius:50%;border:1px solid #1e293b;display:grid;place-items:center}
    .orbit:before{content:'';position:absolute;inset:-20px;border-radius:50%;border:1px dashed #172033}
    .orbit:after{content:'';position:absolute;inset:19px;border-radius:50%;border:1px solid #334155}
    .orbit img{position:relative;width:224px;height:224px;border-radius:52px;z-index:1;box-shadow:0 0 75px #38bdf820}
    .cross{position:absolute;color:#94a3b8;font:20px Mono;right:239px;top:106px}.point{position:absolute;right:83px;top:285px;width:7px;height:7px;background:#38bdf8;border-radius:50%;box-shadow:0 0 12px #38bdf880}
    footer{position:absolute;left:82px;right:82px;bottom:68px;border-top:1px solid #1e293b;padding-top:19px;display:flex;align-items:center;justify-content:space-between;font:11px Mono;letter-spacing:1.2px;color:#94a3b8}
    footer b{font-weight:400;color:#cbd5e1;letter-spacing:.6px}
  </style></head><body>
    <svg class="stars" width="1200" height="630" aria-hidden="true">${stars}</svg><div class="frame"></div>
    <div class="content"><p class="eyebrow">EVAN BARTKOWSKI / PORTFOLIO</p><h1>EVAN<span>BARTKOWSKI</span></h1><p class="role">Cybersecurity Engineer &amp; Developer</p><p class="focus">SECURITY OPERATIONS / LINUX / AI / SOFTWARE</p></div>
    <span class="cross">+</span><div class="orbit"><img src="${logoURL}" alt="Evan Bartkowski CompTIA CSAP cybersecurity logo"></div><span class="point"></span>
    <footer><b>EXPERIENCE · CREDENTIALS · PROJECTS</b><span>evanbartkowski.com</span></footer>
  </body></html>`);
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
  await page.screenshot({ path: join(root, 'assets', 'social-preview.png') });
  console.log('Generated cyber logo brand suite (512, 192, 180, 96, 48, 32, 16), favicon.ico, and 1200×630 social preview.');
} finally {
  await browser.close();
}
