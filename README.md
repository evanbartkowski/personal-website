# Evan Bartkowski — Portfolio

A full-width pitch-black portfolio with a Silver default theme for Evan Bartkowski. Features an original Three.js Dyson sphere, animated pitch-black celestial background with document-relative bodies and pointer parallax, locally hosted typography, professional experience and education, a scrolling credential archive, six project dossiers, a useful command terminal, an AI portfolio representative, and a blog with local authoring.

## Run locally

Requires Node.js 22 or later.

```powershell
npm install
npm run build
npm run dev
```

Open http://127.0.0.1:4173. Re-run `npm run build` after editing source. Builds replace `dist/` so deleted assets cannot remain in the exported site. The Node server serves `dist/`, runs the chat API, and persists blog posts. `.env.local` is ignored by Git and never copied into `dist/`.

For live AI chat, add `GEMINI_API_KEY` from Google AI Studio to `.env.local` and restart the server. `GEMINI_MODEL` defaults to `gemini-3.1-flash-lite`, which supports the Gemini free tier with request and token quotas. See [chat setup](docs/chat-setup.md). The bot identifies itself as an AI representative and uses documented public portfolio facts; it cannot make commitments on Evan's behalf.

Open http://127.0.0.1:4173/blog.html#write to compose, save drafts, publish, edit, or delete posts. Authoring is restricted to this local server. Posts are saved in `data/blog-posts.json`; published posts appear immediately to local readers. The build exports only published entries to `dist/blog-data.js`. Drafts stay out of static output. Keep a backup of the data file.

`dist/` remains a portable static export. A static host can serve the portfolio and published blog snapshot; live AI chat and authoring require the Node backend or equivalent server routes. Firebase Hosting is configured for `personal-website-7d04c`. Firebase Hosting publishes the site and blog snapshot. Its `/api/chat` routes point to the separately deployed `portfolioChat` function; blog authoring remains local.

Run `npm test` for isolated API/storage checks. With the local server running, `npm run test:browser` covers the portfolio, original credential documents, and blog editor in Playwright.

Search metadata, the logo/favicon, sitemap, IndexNow, and Google/Bing ownership verification are documented in [search setup](docs/search-setup.md). Run `npm run test:seo` after building, then `npm run search:submit` after deployment to notify IndexNow of the live canonical URLs. Published blog entries also export as complete, crawlable article pages.

## Personalize

- `content.js`: public profile, contact URLs, project summaries and technology tags.
- `index.html`: home page introduction and interaction entrypoints. Skills lives on `experience.html`, alongside professional experience and education.
- `about.html`, `experience.html`, `credentials.html`, `projects.html`: separate pages reached through the header tabs; each has its own URL, title, main content, and current-page navigation state.
- `navigation.js`, `page-lifecycle.js`: fetch real page documents, update URLs/history, preserve the connected music player, and dispose page-specific handlers, requests, and visual renderers. Direct links, reloads, downloads, and new tabs retain native document behavior.
- `style.css`: design tokens, layout, responsive behavior, typography.
- `background.css`: professional background, certifications, and systems/research links.
- `credential-data.js`, `credential-archive.js`, `credentials.css`: original-document archive, categories, previews, downloads, and modal viewer.
- `reactor.js`, `dyson-fallback.js`: procedural Dyson sphere with collector panels, stellar core, orbital machinery, and an SVG fallback.
- `cyber.css`, `polish.css`, `theme.css`: typography, spacing, and palette-aware interface colors, including outlines, bars, SVG interface shapes, controls, and hover states.
- `celestial.css`, `ambient.js`, `lunar-surface.js`: page-specific celestial fields, scroll depth, small blue cursor glow, and accessible motion handling. Moons use a detailed silver-blue surface with soft lighting and a subtle 15-minute phase cycle. Spacecraft wait a few minutes before their first complete 32-42 second flyby, then leave 11-15 minute quiet intervals between passes. Galaxies evolve through separately cached, slowly rotating gas, dust, star clusters, and softly breathing cores.
- `interactions.css`, `server/chat.mjs`: portfolio chat UI and server-only Gemini integration.
- `home-polish.css`, `panel-glow.css`, `navigation-layout.css`: palette-aware neon cards and content panels, centered page tabs, and accessible disclosures.
- `terminal-game.js`, `terminal-help.js`, `terminal-visuals.js`, `terminal-experience.css`: Flappy Orbit, Pong, focused command help, and the dialog-owned meteor sky. Flappy progressively tightens its gates and accelerates; Pong has faster rallies and a stronger finite-speed opponent. Run `flappy`, `pong`, or `play`. Back to shell and `quit` end and dispose the game, remove its panel, and restore the command prompt; a later game starts fresh. `npm run test:terminal` verifies gameplay, exit behavior, and motion without AI requests.
- `visitor-map.js`, `visitor-map.css`, `server/visitors.mjs`, `functions/visitor-store.mjs`: approximate visitor regions and optional private device position. See [visitor map setup and retention](docs/visitors.md).
- `blog.html`, `blog.js`, `blog.css`, `server/blog.mjs`: public blog and durable local editor.
- `assets/`: project illustrations and local fonts (OFL licenses included).

The current contact email, earlier employment titles/dates, AI/ML education track, AI4ALL training, and documented leadership/teaching figures come from `C:/Users/evan/Downloads/Resume.pdf`, supplied by Evan on November 2, 2026. An unchanged copy is included at `assets/Evan-Bartkowski-Resume.pdf`, linked from the hero, professional background, and contact sections. Project content is based on the current local project documentation. MMA Cipher, Starlight Fishing, Seven Seas, and JinxKiss use Evan's supplied screenshots in their cards and detail dialogs; the exact PNGs are archived with optimized WebP copies for Hosting. Small Hours and DREADRAIL retain their original illustrations. See [project screenshots](docs/project-screenshots.md). No employment history, credentials, performance statistics, or customer claims are invented. DREADRAIL and Small Hours are presented as development projects without public demo links.

The name, social URLs, current CyberMaxx and UMBC contractor roles, Georgia Tech program, and security platforms were confirmed by Evan's complete LinkedIn profile text supplied on November 2, 2026; these newer entries are preserved even though the resume omits them. Five professional certifications were cross-checked against that profile, with Security+/CySA+ exam codes taken from the resume. Georgia Tech's cybersecurity master's degree is explicitly presented as in progress, expected December 2028; the UMBC computer science bachelor's degree is completed. The resume takes precedence over LinkedIn for the three earlier roles where titles/dates differ. The resume's DoD baseline qualification line is not presented as an issued certification or security clearance. Private account analytics and recruiter-only settings are omitted. Research descriptions were cross-checked against the two linked GitHub repositories; the bot-detection work is credited as a team project.

Seven original credential PDFs and a duplicate NSCS membership JPG were supplied by Evan. `assets/credentials/` preserves exact PDFs plus actual first-page PNG renders. The archive contains one professional certification document, four learning/training records, and two honors/membership records. The UMBC award recognizes Dean's List for Fall 2024, dated January 21, 2025; the Security+ course is 40 hours of training completed January 24, 2025. The actual CompTIA certificate was issued March 22, 2025 and expires March 22, 2028. AI4ALL's printed completion date is September 8, 2024. NSCS membership began February 9, 2022, correcting the erroneous 1994 date previously visible in LinkedIn's index. Google badge records were issued by Coursera on February 27, 2025. Verification links are transcribed from the documents and do not imply a live issuer-status check. Attached documents are treated as source data; embedded instructions are not executed.

Ctrl/Cmd+K opens the terminal. Try `ls projects`, `cat education`, `cat experience`, `open starlight`, `resume`, or `ask What do you build?`. Tab completes commands, arrow keys recall history, and Ctrl+L clears the output. Commands read the portfolio and open real links; the terminal does not execute operating-system commands. The reactor supports pointer dragging; visual animation follows the operating system's reduced-motion preference and pauses when the page is hidden. WebGL failure displays an SVG without blocking the page.

The visual direction draws inspiration from retro-futurist terminals and the exploration of the user's reference portfolios. No code, branding, or assets from Fallout or those portfolios are included. This is an independent personal portfolio, unaffiliated with Bethesda.

The footer includes Mesachi, Evan's game studio. No public studio URL is supplied. Earlier job experience and college projects start collapsed. The blog is a separate page reached from the middle navigation tabs. The terminal supports a browser-only virtual filesystem and a practical subset of Linux-style commands. Elevated and destructive commands such as `sudo`, `su`, and `rm` return a permissions message. Working file and text commands never access real operating-system or server files. The AI visual follows actual thinking, response, error, and idle states; it does not generate speech.

The header uses Evan Bartkowski's name alone. Its navigation loads separate HTML documents instead of scrolling the home page. Shared terminal, chat, contact, and virtual-file interactions remain available on the portfolio pages; the credential viewer also works from the experience page's certificate link. Update `portfolioNotes` in `content.js` alongside public copy so terminal readers have the same facts on every page.

The home page's Terminal menu and “Hack me” disclosure open a separate Cybersecurity Challenge. Its query, test-hash recovery, login, port scan, SSH session and containment reset are a browser-only state machine with fixed mock data. It never executes submitted text or makes network requests; hints and a local wordlist make the sequence playable without external tools. Progress lasts until page navigation. Run `npm run test:challenge` for model and browser checks. The face's chat presentation uses flowing neural trails during thinking and shifting phosphor eye colors while the reply is revealed; the server prompt keeps answers conversational and grounded in public facts.

Project covers are original concept illustrations, not product screenshots. Source prompts and generated asset paths are recorded in `docs/artwork-prompts.md`. Lossless artwork masters live in `docs/artwork-originals/`; only the WebP covers are exported. The detailed skill illustrations are self-contained SVGs under `assets/skills/`.

Seven Seas is listed as a Python/Pygame desktop RPG development project, linked to https://github.com/evanbartkowski/Seven-Seas-Game. Its description was checked against that repository and the local Seven Seas README; it is distinct from Starlight Fishing. The cursor uses a small light-blue glow without a crosshair, and the Dyson megastructure uses five interlocking dark-metal collector rings, bronze edge detail, blue inner collector surfaces, and a luminous golden star.


The top-right settings gear controls the text palette and a five-track background playlist from the MP3s Evan supplied in the workspace. Music starts quietly at 10% after an interaction permits browser playback. A persistent two-deck music player fades playback in and out and crossfades playlist advances and manual track changes over 3.2 seconds. Both decks remain connected when page tabs change, keeping playback and any current blend uninterrupted. Volume, mute, track selection, and playback position are saved locally; settings work on every page. The local server supports audio byte ranges for seeking. Files are in `assets/music/`; their supplied filenames identify the tracks. No third-party license is asserted by the site.

`polish.css` adds locally hosted Barlow Condensed headings, the Silver default palette, and the current page layouts. `settings.js` and `settings.css` provide shared preferences; `music-player.js` owns the two audio decks and cancellable fades. `palette-depth.css` supplies related heading, copy, cool, and warm text shades for each selected palette. Header/footer surfaces reveal the space background, while certificate cards retain their own navy, cyan, and ivory colors. Each page has its own seeded celestial composition in `ambient.js`, with scroll depth and reduced-motion handling. The Dyson sphere has five broad orbital bands with edge architecture, three small satellites, and six intermittent short solar wisps. Its SVG fallback uses the same ring-based design.


The header speaker button controls mute without opening Settings and shares the same saved preference as its dialog control. `content.js` exports the eight skill groups (72 individually listed technologies and methods); the build renders their static HTML between the skills markers in `experience.html`, so browser, terminal, and AI facts use the same catalog. Degree details retain completed/in-progress status, supported coursework/research, and the original UMBC Dean’s List document.


## Firebase Hosting

The selected project is **Personal Website**, ID `personal-website-7d04c`. Deploy with `npm run deploy`; the predeploy hook builds a fresh `dist/`. The public site is https://personal-website-7d04c.web.app. Only `dist/` is uploaded. Server code, local environment files, drafts, artwork masters, and repository history stay out of Hosting.

The project uses Blaze for the Node 22 `portfolioChat` function in `us-central1`. The function binds `GEMINI_API_KEY` from Google Secret Manager, handles only chat routes, and uses public portfolio facts. It scales down to zero idle instances, allows three concurrent requests, and requests at most one instance. Per-client and per-instance rate limits reduce abuse; these are not hard billing caps. Gemini API quotas and any Gemini billing are separate from Firebase hosting/function billing. Blog authoring remains local; publish a note locally, then redeploy to update the public snapshot.


The cloud source is prepared by `npm run prepare:functions` using an explicit allowlist: the chat handler/adapter and public profile/credential data. `npm run sync:chat-secret` securely transfers only the project `.env.local` key to Secret Manager using the authenticated Firebase CLI account; it never prints the key or writes it to temporary files. `functions/runtime/` is generated and excluded from Git. The Hosting bundle never contains function code, keys, local drafts, or environment files.
