# Evan's Personal Vault

A Fallout-inspired personal portfolio for Evan Bartkowski. Original Three.js reactor, locally hosted fonts and project artwork, responsive case-study dossiers, keyboard terminal, and accessible motion controls.

## Run locally

Requires Node.js 22 or later.

```powershell
npm install
npm run build
npm run dev
```

Open http://127.0.0.1:4173. Re-run `npm run build` after editing source. `dist/` is a static export suitable for Sites, Firebase Hosting, or another static host. No API keys or server runtime are needed.

## Personalize

- `content.js`: public profile, contact URLs, project summaries and technology tags.
- `index.html`: introduction, about copy, toolkit, and page metadata.
- `style.css`: design tokens, layout, responsive behavior, typography.
- `reactor.js`: original procedural Three.js visual and SVG compatibility fallback.
- `assets/`: project illustrations and local fonts (OFL licenses included).

Contact information was verified against existing author configuration in JinxKiss. Project content is based on the current local project documentation. Project graphics are original editorial illustrations, rather than screenshots. No employment history, credentials, performance statistics, or customer claims are invented. DREADRAIL and Small Hours are presented as development projects without public demo links.

Ctrl/Cmd+K opens the terminal. Type `help` to list supported commands. The reactor supports pointer dragging, schematic mode, and pause/resume. Reduced-motion preferences are honored; preferences are stored locally when browser storage is available. WebGL failure displays a static SVG without blocking the page.

The visual direction draws inspiration from retro-futurist terminals and the exploration of the user's reference portfolios. No code, branding, or assets from Fallout or those portfolios are included. This is an independent personal portfolio, unaffiliated with Bethesda.
