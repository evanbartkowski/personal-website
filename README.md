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
- `background.css`: professional background, certifications, and systems/research links.
- `reactor.js`: original procedural Three.js visual and SVG compatibility fallback.
- `assets/`: project illustrations and local fonts (OFL licenses included).

The current contact email, earlier employment titles/dates, AI/ML education track, AI4ALL training, and documented leadership/teaching figures come from `C:/Users/evan/Downloads/Resume.pdf`, supplied by Evan on November 2, 2026. An unchanged copy is included at `assets/Evan-Bartkowski-Resume.pdf`, linked from the hero, professional background, and contact sections. Project content is based on the current local project documentation. Project graphics are original editorial illustrations, rather than screenshots. No employment history, credentials, performance statistics, or customer claims are invented. DREADRAIL and Small Hours are presented as development projects without public demo links.

The name, social URLs, current CyberMaxx and UMBC contractor roles, Georgia Tech program, and security platforms were confirmed by Evan's complete LinkedIn profile text supplied on November 2, 2026; these newer entries are preserved even though the resume omits them. Five professional certifications were cross-checked against that profile, with Security+/CySA+ exam codes taken from the resume. Georgia Tech's cybersecurity master's degree is explicitly presented as in progress, expected December 2028; the UMBC computer science bachelor's degree is completed. The resume takes precedence over LinkedIn for the three earlier roles where titles/dates differ. The resume's DoD baseline qualification line is not presented as an issued certification or security clearance. Private account analytics and recruiter-only settings are omitted. Research descriptions were cross-checked against the two linked GitHub repositories; the bot-detection work is credited as a team project.

Ctrl/Cmd+K opens the terminal. Type `help` to list supported commands. The reactor supports pointer dragging, schematic mode, and pause/resume. Reduced-motion preferences are honored; preferences are stored locally when browser storage is available. WebGL failure displays a static SVG without blocking the page.

The visual direction draws inspiration from retro-futurist terminals and the exploration of the user's reference portfolios. No code, branding, or assets from Fallout or those portfolios are included. This is an independent personal portfolio, unaffiliated with Bethesda.
