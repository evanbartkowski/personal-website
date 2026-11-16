import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const artworkDir = join(root, 'assets', 'artwork');
const originalsDir = join(root, 'docs', 'artwork-originals');
await mkdir(artworkDir, { recursive: true });
await mkdir(originalsDir, { recursive: true });

const executablePath = process.env.CHROME_PATH || join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const browser = await chromium.launch({ ...(existsSync(executablePath) ? { executablePath } : { channel: 'chrome' }), headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1 });

const items = [
  {
    name: 'rail',
    title: 'DREADRAIL',
    category: '3D · SURVIVAL HORROR',
    tagline: 'SURVIVAL HORROR PROTOCOL // TRAIN CABIN GRID',
    status: 'ACTIVE DEVELOPMENT // PRE-ALPHA',
    accent: '#f59e0b',
    accentMuted: '#b45309',
    bg: '#08080a',
    spec: 'SYSTEM: DIESEL-ELECTRIC CORRIDOR ENGINE · AI: AMBIENT STALKER · THREE.JS / WEB AUDIO',
    gridColor: 'rgba(245, 158, 11, 0.08)',
    badgeText: 'MESACHI // PROTO-04',
    symbol: `<path d="M-60 80 L-40 -40 L40 -40 L60 80 Z" stroke="#f59e0b" stroke-width="2" fill="none" opacity="0.3"/><line x1="-30" y1="20" x2="30" y2="20" stroke="#f59e0b" stroke-width="2" opacity="0.4"/><line x1="-15" y1="-10" x2="15" y2="-10" stroke="#f59e0b" stroke-width="2" opacity="0.4"/><circle cx="0" cy="50" r="18" stroke="#f59e0b" stroke-width="2" fill="none" opacity="0.5"/>`
  },
  {
    name: 'bad-cops',
    title: 'BAD COPS',
    category: 'TACTICAL ACTION · SIMULATION',
    tagline: 'TACTICAL PURSUIT SIMULATION // SECTOR PATROL',
    status: 'ACTIVE PROTOTYPE // INTERNAL BUILD',
    accent: '#38bdf8',
    accentMuted: '#0284c7',
    bg: '#050a12',
    spec: 'SYSTEM: DYNAMIC PURSUIT LOGIC · AI: REACTIVE PATROL NODES · PROCEDURAL RESPONSE VECTORS',
    badgeText: 'PRECINCT // PROTO-07',
    symbol: `<path d="M0 -60 L45 -35 L45 25 L0 60 L-45 25 L-45 -35 Z" stroke="#38bdf8" stroke-width="2" fill="none" opacity="0.35"/><circle cx="0" cy="0" r="32" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="4 4" fill="none" opacity="0.4"/><polygon points="0,-18 14,-7 14,8 0,18 -14,8 -14,-7" fill="#38bdf8" opacity="0.25"/>`
  },
  {
    name: 'jurassic-domination',
    title: 'JURASSIC DOMINATION',
    category: 'PREHISTORIC STRATEGY · SIMULATION',
    tagline: 'APEX TERRITORIAL SIMULATION // CRETACEOUS ECOSYSTEM',
    status: 'CONCEPT & MECHANICS PROTOTYPE',
    accent: '#10b981',
    accentMuted: '#059669',
    bg: '#040d09',
    spec: 'SYSTEM: TERRITORIAL DOMINANCE MATRIX · AI: APEX SENSORY & PACK SIMULATION · BIOME SCALING',
    badgeText: 'CRETACEOUS // PROTO-08',
    symbol: `<path d="M-50 40 Q -30 -50 0 -60 Q 30 -50 50 40 Q 20 20 0 50 Q -20 20 -50 40 Z" stroke="#10b981" stroke-width="2" fill="none" opacity="0.35"/><path d="M-30 0 Q 0 -30 30 0 Q 0 15 -30 0 Z" fill="#10b981" opacity="0.2"/><circle cx="0" cy="-25" r="5" fill="#10b981" opacity="0.6"/>`
  }
];

try {
  await page.setViewportSize({ width: 1536, height: 1024 });

  for (const item of items) {
    const stripes = Array.from({ length: 18 }, (_, i) => {
      const x = i * 90 - 100;
      return `<line x1="${x}" y1="0" x2="${x + 60}" y2="50" stroke="${item.accent}" stroke-width="12" opacity="0.18" />`;
    }).join('');

    const html = `<!doctype html>
<html>
<head>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1536px; height: 1024px; overflow: hidden;
    background: ${item.bg};
    color: #f1f5f9;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    position: relative;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 70px 90px;
  }
  .bg-grid {
    position: absolute; inset: 0;
    background-image: linear-gradient(${item.gridColor} 1px, transparent 1px),
                      linear-gradient(90deg, ${item.gridColor} 1px, transparent 1px);
    background-size: 48px 48px;
    opacity: 0.8;
  }
  .ambient-glow {
    position: absolute; width: 800px; height: 800px;
    background: radial-gradient(circle, ${item.accent}14 0%, transparent 70%);
    top: 50%; left: 50%; transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .frame-border {
    position: absolute; inset: 40px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    pointer-events: none;
  }
  .corner-tl { position: absolute; top: 35px; left: 35px; width: 25px; height: 25px; border-top: 3px solid ${item.accent}; border-left: 3px solid ${item.accent}; }
  .corner-tr { position: absolute; top: 35px; right: 35px; width: 25px; height: 25px; border-top: 3px solid ${item.accent}; border-right: 3px solid ${item.accent}; }
  .corner-bl { position: absolute; bottom: 35px; left: 35px; width: 25px; height: 25px; border-bottom: 3px solid ${item.accent}; border-left: 3px solid ${item.accent}; }
  .corner-br { position: absolute; bottom: 35px; right: 35px; width: 25px; height: 25px; border-bottom: 3px solid ${item.accent}; border-right: 3px solid ${item.accent}; }

  .header {
    position: relative; z-index: 2;
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    padding-bottom: 24px;
  }
  .tagline {
    font-family: monospace; font-size: 16px; letter-spacing: 3px; color: ${item.accent};
    text-transform: uppercase;
  }
  .badge {
    font-family: monospace; font-size: 14px; letter-spacing: 2px;
    padding: 6px 14px; border: 1px solid ${item.accent}; color: #f8fafc;
    background: ${item.accent}20; border-radius: 3px;
  }

  .center-content {
    position: relative; z-index: 2;
    display: flex; flex-direction: column; align-items: center; text-align: center;
    margin: auto 0;
  }
  .center-symbol {
    margin-bottom: 24px;
  }
  .wip-stripe-banner {
    position: relative;
    width: 600px; height: 44px;
    background: #020408;
    border: 1px solid ${item.accent}66;
    margin-bottom: 24px;
    overflow: hidden;
    display: flex; align-items: center; justify-content: center;
  }
  .wip-stripe-svg {
    position: absolute; inset: 0; width: 100%; height: 100%;
  }
  .wip-stripe-text {
    position: relative; z-index: 2;
    font-family: monospace; font-size: 16px; font-weight: 700;
    letter-spacing: 6px; color: #ffffff;
    background: #000000b0; padding: 4px 18px; border: 1px solid ${item.accent}88;
  }
  h1 {
    font-size: 88px; font-weight: 800; letter-spacing: 2px;
    line-height: 1; text-transform: uppercase;
    color: #ffffff;
    text-shadow: 0 4px 30px rgba(0,0,0,0.8), 0 0 40px ${item.accent}33;
    margin-bottom: 16px;
  }
  .category-pill {
    font-family: monospace; font-size: 18px; letter-spacing: 4px;
    color: #94a3b8; text-transform: uppercase;
    margin-bottom: 20px;
  }
  .status-notice {
    display: inline-flex; align-items: center; gap: 10px;
    padding: 10px 24px;
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 4px;
    font-family: monospace; font-size: 15px; letter-spacing: 2px;
    color: ${item.accent};
  }
  .pulsing-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: ${item.accent};
    box-shadow: 0 0 10px ${item.accent};
  }

  .footer {
    position: relative; z-index: 2;
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    padding-top: 24px;
    display: flex; justify-content: space-between; align-items: center;
    font-family: monospace; font-size: 13px; color: #64748b; letter-spacing: 1.5px;
  }
  .spec-text { color: #94a3b8; }
</style>
</head>
<body>
  <div class="bg-grid"></div>
  <div class="ambient-glow"></div>
  <div class="frame-border"></div>
  <div class="corner-tl"></div>
  <div class="corner-tr"></div>
  <div class="corner-bl"></div>
  <div class="corner-br"></div>

  <div class="header">
    <div class="tagline">// ${item.tagline}</div>
    <div class="badge">${item.badgeText}</div>
  </div>

  <div class="center-content">
    <svg class="center-symbol" width="120" height="120" viewBox="-80 -80 160 160">
      ${item.symbol}
    </svg>
    <div class="wip-stripe-banner">
      <svg class="wip-stripe-svg">${stripes}</svg>
      <span class="wip-stripe-text">WORK IN PROGRESS</span>
    </div>
    <h1>${item.title}</h1>
    <div class="category-pill">${item.category}</div>
    <div class="status-notice">
      <span class="pulsing-dot"></span>
      <span>${item.status}</span>
    </div>
  </div>

  <div class="footer">
    <span class="spec-text">${item.spec}</span>
    <span>EVANBARTKOWSKI.COM</span>
  </div>
</body>
</html>`;

    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);

    // Save lossless PNG to docs/artwork-originals
    const pngPath = join(originalsDir, `${item.name}-wip.png`);
    await page.screenshot({ path: pngPath });

    // Generate WebP via HTMLCanvas in Chromium
    const webpBase64 = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1536; canvas.height = 1024;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      const svgBlob = new Blob([document.documentElement.outerHTML], { type: 'text/html;charset=utf-8' });
      // We can take a canvas draw of screenshot via html2canvas or direct screenshot base64
      return null;
    });

    // Alternatively, screenshot directly and use Node Buffer to write webp
    // Or in page, use createImageBitmap or standard Playwright screenshot:
    // Chromium can render to an image element and canvas.toDataURL('image/webp', 0.95):
    const webpDataUrl = await page.evaluate(async () => {
      // Create a canvas with the rendered screen
      // Since page is 1536x1024, create an SVG foreignObject or fetch screenshot:
      return null;
    });

    // Let's draw in canvas directly to ensure exact 1536x1024 webp output:
    const webpBuffer = await page.evaluate(async (data) => {
      const c = document.createElement('canvas');
      c.width = 1536; c.height = 1024;
      const ctx = c.getContext('2d');
      // Draw background
      ctx.fillStyle = data.bg;
      ctx.fillRect(0, 0, 1536, 1024);

      // Grid
      ctx.strokeStyle = data.gridColor;
      ctx.lineWidth = 1;
      for (let x = 0; x < 1536; x += 48) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1024); ctx.stroke();
      }
      for (let y = 0; y < 1024; y += 48) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1536, y); ctx.stroke();
      }

      // Radial glow in center
      const rad = ctx.createRadialGradient(768, 512, 10, 768, 512, 500);
      rad.addColorStop(0, data.accent + '25');
      rad.addColorStop(1, 'transparent');
      ctx.fillStyle = rad;
      ctx.fillRect(0, 0, 1536, 1024);

      // Outer border frame
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.strokeRect(40, 40, 1456, 944);

      // Corners
      ctx.strokeStyle = data.accent;
      ctx.lineWidth = 3;
      // TL
      ctx.beginPath(); ctx.moveTo(35, 60); ctx.lineTo(35, 35); ctx.lineTo(60, 35); ctx.stroke();
      // TR
      ctx.beginPath(); ctx.moveTo(1476, 35); ctx.lineTo(1501, 35); ctx.lineTo(1501, 60); ctx.stroke();
      // BL
      ctx.beginPath(); ctx.moveTo(35, 964); ctx.lineTo(35, 989); ctx.lineTo(60, 989); ctx.stroke();
      // BR
      ctx.beginPath(); ctx.moveTo(1476, 989); ctx.lineTo(1501, 989); ctx.lineTo(1501, 964); ctx.stroke();

      // Top Header
      ctx.font = '16px monospace';
      ctx.fillStyle = data.accent;
      ctx.fillText('// ' + data.tagline, 90, 95);

      ctx.fillStyle = data.accent + '22';
      ctx.fillRect(1280, 75, 170, 32);
      ctx.strokeStyle = data.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(1280, 75, 170, 32);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '13px monospace';
      ctx.fillText(data.badgeText, 1295, 96);

      // Center WIP Banner
      const bx = 468, by = 310, bw = 600, bh = 48;
      ctx.fillStyle = '#020408';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = data.accent + '88';
      ctx.strokeRect(bx, by, bw, bh);

      // Diagonal hazard stripes
      ctx.save();
      ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
      ctx.strokeStyle = data.accent;
      ctx.lineWidth = 14;
      ctx.globalAlpha = 0.22;
      for (let sx = bx - 100; sx < bx + bw + 100; sx += 32) {
        ctx.beginPath(); ctx.moveTo(sx, by); ctx.lineTo(sx + 35, by + bh); ctx.stroke();
      }
      ctx.restore();

      // WIP text box inside banner
      ctx.fillStyle = '#05070dbb';
      ctx.fillRect(568, by + 6, 400, 36);
      ctx.strokeStyle = data.accent;
      ctx.strokeRect(568, by + 6, 400, 36);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('// WORK IN PROGRESS //', 768, by + 30);

      // Title
      ctx.font = 'bold 84px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = data.accent;
      ctx.shadowBlur = 25;
      ctx.fillText(data.title, 768, 460);
      ctx.shadowBlur = 0;

      // Category
      ctx.font = '18px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(data.category, 768, 515);

      // Status pill
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(548, 555, 440, 44);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.strokeRect(548, 555, 440, 44);
      ctx.beginPath(); ctx.arc(580, 577, 5, 0, Math.PI * 2); ctx.fillStyle = data.accent; ctx.fill();
      ctx.font = '14px monospace';
      ctx.fillStyle = data.accent;
      ctx.textAlign = 'left';
      ctx.fillText(data.status, 600, 582);

      // Footer
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath(); ctx.moveTo(90, 930); ctx.lineTo(1446, 930); ctx.stroke();
      ctx.font = '13px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(data.spec, 90, 960);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#64748b';
      ctx.fillText('EVANBARTKOWSKI.COM', 1446, 960);

      return c.toDataURL('image/webp', 0.92);
    }, item);

    const base64Data = webpBuffer.replace(/^data:image\/webp;base64,/, '');
    const targetFile = join(artworkDir, `${item.name}.webp`);
    await writeFile(targetFile, Buffer.from(base64Data, 'base64'));
    console.log(`Rendered ${targetFile} (1536x1024 WebP)`);
  }
} finally {
  await browser.close();
}
