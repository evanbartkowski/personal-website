import { mkdir, copyFile, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { skillGroups, projects } from '../content.js';
import { pages, applyMetadata, renderHead, readSearchConfig, exportDiscovery } from './site-seo.mjs';
import { exportBlog } from './export-blog.mjs';
import { versionBuiltAssets } from './version-assets.mjs';
import { portraitFallback } from './portrait-fallback.mjs';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
// Start with a fresh export so removed assets cannot linger on the site.
if (relative(root, output) !== 'dist') throw new Error('Build output must stay inside the project dist directory');
const config = JSON.parse(await readFile(resolve(root, 'firebase.json'), 'utf8'));
if (config.hosting?.site !== 'personal-website-7d04c' || config.hosting?.public !== 'dist') throw new Error('Invalid Firebase hosting target');
await rm(output, {recursive: true, force: true});
await mkdir(resolve(root, 'dist/vendor'), {recursive: true});
for (const file of ['index.html', 'experience.html', 'credentials.html', 'projects.html', 'about.html', 'style.css', 'background.css', 'credentials.css', 'cyber.css', 'celestial.css', 'interactions.css', 'polish.css', 'settings.css', 'theme.css', 'navigation-layout.css', 'home-polish.css', 'footer.css', 'panel-glow.css', 'palette-depth.css', 'visitor-map.css', 'visitor-map.js', 'visitor-tracking.js', 'terminal-experience.css', 'terminal-visuals.js', 'terminal-game.js', 'arcade-model.js', 'terminal-help.js', 'cyber-challenge-model.js', 'cyber-challenge.js', 'cyber-challenge.css', 'settings.js', 'music-player.js', 'navigation.js', 'page-lifecycle.js', 'app.js', 'reactor.js', 'dyson-fallback.js', 'ambient.js', 'lunar-surface.js', 'portrait.js', 'portrait-geometry.js', 'portrait-chat.js', 'portrait-chat.css', 'virtual-shell.js', 'content.js', 'credential-data.js', 'credential-archive.js', 'favicon.svg', 'favicon.ico', 'site.webmanifest', 'blog.html', 'blog.js', 'blog.css']) {
  await copyFile(resolve(root, file), resolve(root, 'dist', file));
}
// Keep the public skills lists and terminal/AI facts on the same source data.
const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
const skillsMarkup = skillGroups.map(group => `<article class="skill-domain toolkit-item reveal"><div class="skill-domain-head"><h3>${escapeHTML(group.title)}</h3></div><p class="skill-domain-context">${escapeHTML(group.context)}</p><ul class="skill-list">${group.items.map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul><div class="skill-evidence"><span>APPLIED IN</span><a href="${escapeHTML(group.sourceHref)}"${group.sourceHref.startsWith('https:') || group.sourceHref.endsWith('.pdf') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHTML(group.sourceLabel)} <span aria-hidden="true">↗</span></a></div></article>`).join('\n');
const experienceSource = await readFile(resolve(root, 'experience.html'), 'utf8');
if (!experienceSource.includes('<!-- skills:start -->') || !experienceSource.includes('<!-- skills:end -->')) throw new Error('Experience skills template is missing');
const skillsCount = skillGroups.reduce((total, group) => total + group.items.length, 0);
const experienceExport = experienceSource.replace(/<!-- skills:start -->[\s\S]*?<!-- skills:end -->/, `<!-- skills:start -->\n${skillsMarkup}\n<!-- skills:end -->`).replace(/<span class="skills-count">\d+ skills <span aria-hidden="true">[^<]*<\/span> \d+ disciplines<\/span>/, `<span class="skills-count">${skillsCount} skills <span aria-hidden="true">&middot;</span> ${skillGroups.length} disciplines</span>`);
await writeFile(resolve(output, 'experience.html'), experienceExport);
// Static readers receive published entries only; private drafts stay on the server.
const records = JSON.parse(await readFile(resolve(root, 'data/blog-posts.json'), 'utf8'));
const publishedPosts = (Array.isArray(records) ? records : records.posts || []).filter(post => post.status === 'published');
await writeFile(resolve(root, 'dist/blog-data.js'), `export const publishedPosts = ${JSON.stringify(publishedPosts, null, 2)};\n`);
const verification = await readSearchConfig(root);
// Export content and links as HTML so visitors and crawlers can read it without JS.
const projectMarkup = projects.map(project => `<article class="project-card reveal" data-category="${escapeHTML(project.group)}"><button class="project-art-button${project.imageType === 'screenshot' ? ' project-screenshot' : ''}" data-project="${escapeHTML(project.id)}" aria-label="Read the ${escapeHTML(project.title)} project dossier"><img src="${escapeHTML(project.artwork)}" alt="${escapeHTML(project.imageAlt || project.title)}" width="${project.imageWidth || 1000}" height="${project.imageHeight || 650}" loading="lazy" /><span class="project-art-meta" aria-hidden="true"><span>PROJECT ${escapeHTML(project.number)}</span>${project.wip ? '<span class="project-wip-pill">WORK IN PROGRESS</span>' : ''}</span><span class="project-open" aria-hidden="true">&#8599;</span></button><div class="project-content"><div class="project-title-row"><h3><button data-project="${escapeHTML(project.id)}">${escapeHTML(project.title)}</button></h3><span class="project-category">${escapeHTML(project.category)}</span></div><p>${escapeHTML(project.description)}</p><div class="project-tags">${project.tags.map(tag=>`<span>${escapeHTML(tag)}</span>`).join('')}</div>${project.url ? `<a href="${escapeHTML(project.url)}" class="text-link" target="_blank" rel="noopener noreferrer">${escapeHTML(project.linkLabel)} <span aria-hidden="true">&#8599;</span></a>` : ''}</div></article>`).join('\n');
const projectSource = await readFile(resolve(output,'projects.html'),'utf8');
if (!projectSource.includes('<!-- projects:start -->')) throw new Error('Missing static project template');
await writeFile(resolve(output,'projects.html'),projectSource.replace(/<!-- projects:start -->[\s\S]*?<!-- projects:end -->/,`<!-- projects:start -->\n${projectMarkup}\n<!-- projects:end -->`));
const {articlePaths, postsMarkup} = await exportBlog({root, output, posts:publishedPosts, renderHead:page=>renderHead(page,verification)});
let blogSource = await readFile(resolve(output,'blog.html'),'utf8');
blogSource = blogSource.replace(/(<div id="blog-posts"[^>]*>)[\s\S]*?(<\/div>)/,`$1${postsMarkup}$2`);
if (!publishedPosts.length) blogSource = blogSource.replace(/(<div id="blog-empty"[^>]*?) hidden(?=>)/,'$1');
blogSource = blogSource.replace(/(<span id="post-count">)[\s\S]*?(<\/span>)/,`$1${String(publishedPosts.length).padStart(2,'0')} ${publishedPosts.length === 1 ? 'ENTRY' : 'ENTRIES'}$2`);
await writeFile(resolve(output,'blog.html'),blogSource);
for (const page of pages) {
  const html = await readFile(resolve(output,page.file),'utf8');
  await writeFile(resolve(output,page.file),applyMetadata(html,page,verification));
}
await exportDiscovery({output,articlePaths,verification});
// Chat status comes from the server-side function; no credentials or simulated
// API responses belong in the static export.
await cp(resolve(root, 'assets'), resolve(root, 'dist/assets'), {recursive: true});
const portraitData = JSON.parse(await readFile(resolve(root, 'assets/portrait/evan-face.json'), 'utf8'));
let homeStyles = await readFile(resolve(output, 'home-polish.css'), 'utf8');
for (const [name, svg] of [['evan-projection.svg', portraitFallback(portraitData)], ['evan-projection-eyes.svg', portraitFallback(portraitData, {eyesOnly: true})]]) {
  await writeFile(resolve(output, 'assets/portrait', name), svg);
  const revision = createHash('sha256').update(svg).digest('hex').slice(0, 12);
  homeStyles = homeStyles.replaceAll(`/assets/portrait/${name}`, `/assets/portrait/${name}?v=${revision}`);
}
await writeFile(resolve(output, 'home-polish.css'), homeStyles);
const threeModuleMin = await readFile(resolve(root, 'node_modules/three/build/three.module.min.js'), 'utf8');
await writeFile(resolve(root, 'dist/vendor/three.module.js'), threeModuleMin.replaceAll('./three.core.min.js', './three.core.js'));
await copyFile(resolve(root, 'node_modules/three/build/three.core.min.js'), resolve(root, 'dist/vendor/three.core.js'));
const {version} = await versionBuiltAssets({root, output});
console.log(`Built personal vault to dist/ with local assets and Three.js (version ${version}).`);
