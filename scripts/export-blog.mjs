import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, sep, isAbsolute } from 'node:path';
import { profile } from '../content.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
const validSlug = value => typeof value === 'string' && value.length <= 100 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const dateLabel = value => new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'}).format(new Date(value));
const readingMinutes = body => Math.max(1, Math.ceil(body.trim().split(/\s+/).filter(Boolean).length / 220));
const excerptFor = post => post.excerpt?.trim() || post.body.replace(/[#*`>\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);

function inlineMarkdown(value) {
  const expression = /(\*\*([^*\n]+)\*\*|`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let output = '', cursor = 0;
  for (const match of value.matchAll(expression)) {
    output += escapeHTML(value.slice(cursor, match.index));
    if (match[2]) output += `<strong>${escapeHTML(match[2])}</strong>`;
    else if (match[3]) output += `<code>${escapeHTML(match[3])}</code>`;
    else output += `<a href="${escapeHTML(match[5])}" target="_blank" rel="noopener noreferrer">${escapeHTML(match[4])}</a>`;
    cursor = match.index + match[0].length;
  }
  return output + escapeHTML(value.slice(cursor));
}

// Match the editor's supported Markdown without interpreting user-authored HTML.
export function renderMarkdown(value) {
  const output = [];
  let paragraph = [], list = null, code = null;
  const flushParagraph = () => {
    if (paragraph.length) {output.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`); paragraph = [];}
  };
  const closeList = () => {if (list) {output.push(`</${list}>`); list = null;}};
  for (const line of String(value).replace(/\r\n/g, '\n').split('\n')) {
    if (line.startsWith('```')) {
      flushParagraph(); closeList();
      if (code !== null) {output.push(`<pre><code>${escapeHTML(code.join('\n'))}${code.length ? '\n' : ''}</code></pre>`); code = null;}
      else code = [];
      continue;
    }
    if (code !== null) {code.push(line); continue;}
    if (!line.trim()) {flushParagraph(); closeList(); continue;}
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph(); closeList();
      const level = Math.min(3, heading[1].length + 1);
      output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    if (/^\s*---+\s*$/.test(line)) {flushParagraph(); closeList(); output.push('<hr />'); continue;}
    if (line.startsWith('> ')) {flushParagraph(); closeList(); output.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`); continue;}
    const item = line.match(/^\s*(?:([-*])|\d+\.)\s+(.+)$/);
    if (item) {
      flushParagraph();
      const type = item[1] ? 'ul' : 'ol';
      if (list !== type) {closeList(); output.push(`<${type}>`); list = type;}
      output.push(`<li>${inlineMarkdown(item[2])}</li>`);
      continue;
    }
    closeList(); paragraph.push(line.trim());
  }
  flushParagraph(); closeList();
  if (code !== null) output.push(`<pre><code>${escapeHTML(code.join('\n'))}${code.length ? '\n' : ''}</code></pre>`);
  return output.join('\n');
}

/**
 * Export public articles and their index cards. renderHead receives
 * {title, description, path, article}, where article is the original published
 * post, and returns a trusted metadata string to insert inside the HTML head.
 * Returned articlePaths are origin-relative URLs for sitemap generation.
 */
export async function exportBlog({root, output, posts, renderHead}) {
  if (typeof renderHead !== 'function') throw new TypeError('Blog export requires a metadata renderer');
  const projectRoot = resolve(root);
  const outputRoot = resolve(output);
  const outputRelative = relative(projectRoot, outputRoot);
  if (!outputRelative || isAbsolute(outputRelative) || outputRelative === '..' || outputRelative.startsWith(`..${sep}`) || resolve(projectRoot, outputRelative) !== outputRoot) throw new Error('Blog export output must stay inside the project');
  const published = (Array.isArray(posts) ? posts : []).filter(post => post?.status === 'published');
  const slugs = new Set();
  for (const post of published) {
    if (!validSlug(post.slug)) throw new Error('Published blog post has an unsafe URL slug');
    if (slugs.has(post.slug)) throw new Error('Published blog posts must have unique URL slugs');
    slugs.add(post.slug);
    if (typeof post.title !== 'string' || !post.title.trim() || typeof post.body !== 'string' || !post.body.trim() || typeof post.category !== 'string') throw new Error('Published blog post is missing required text');
    if (!Number.isFinite(Date.parse(post.publishedAt || post.createdAt))) throw new Error('Published blog post has an invalid publication date');
    if (post.excerpt != null && typeof post.excerpt !== 'string') throw new Error('Published blog post has an invalid excerpt');
  }
  published.sort((a, b) => Date.parse(b.publishedAt || b.createdAt) - Date.parse(a.publishedAt || a.createdAt));
  const articlePaths = [], cards = [];
  if (published.length) await mkdir(resolve(outputRoot, 'blog/posts'), {recursive: true});
  for (const post of published) {
    const path = `/blog/posts/${post.slug}.html`;
    const date = post.publishedAt || post.createdAt;
    const description = excerptFor(post);
    const head = await renderHead({title: `${post.title} — ${profile.name}`, description, path, article: post});
    if (typeof head !== 'string') throw new TypeError('Blog metadata renderer must return HTML text');
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${head}
  <link rel="stylesheet" href="/style.css" />
  <link rel="stylesheet" href="/cyber.css" />
  <link rel="stylesheet" href="/blog.css" />
  <link rel="stylesheet" href="/polish.css" />
  <link rel="stylesheet" href="/theme.css" />
  <link rel="stylesheet" href="/navigation-layout.css" />
  <link rel="stylesheet" href="/footer.css" />
  <link rel="stylesheet" href="/panel-glow.css" />
  <link rel="stylesheet" href="/palette-depth.css" />
  <script src="/visitor-tracking.js" type="module"></script>
</head>
<body class="blog-page blog-article-page">
  <a class="skip-link" href="#article-main">Skip to article</a>
  <header class="blog-header">
    <a class="blog-brand" href="/">${escapeHTML(profile.name)}</a>
    <nav aria-label="Main navigation"><a href="/about.html">About</a><a href="/experience.html">Experience</a><a href="/credentials.html">Certifications</a><a href="/projects.html">Projects</a><a href="/blog.html" aria-current="page">Blog</a></nav>
  </header>
  <main id="article-main">
    <article class="blog-article" aria-labelledby="article-title">
      <a class="blog-article-back" href="/blog.html">&#8592; All notes</a>
      <header class="blog-article-header">
        <p class="blog-kicker">${escapeHTML(post.category.toUpperCase())} <span aria-hidden="true">/</span> <time datetime="${escapeHTML(date)}">${escapeHTML(dateLabel(date))}</time> <span aria-hidden="true">/</span> ${readingMinutes(post.body)} MIN READ</p>
        <h1 id="article-title">${escapeHTML(post.title)}</h1>
        <p class="blog-reader-author">By <a href="/about.html">${escapeHTML(profile.name)}</a>${Number.isFinite(Date.parse(post.updatedAt)) && Date.parse(post.updatedAt) > Date.parse(date) ? ` · Updated <time datetime="${escapeHTML(post.updatedAt)}">${escapeHTML(dateLabel(post.updatedAt))}</time>` : ''}</p>
      </header>
      <div class="prose">${renderMarkdown(post.body)}</div>
    </article>
  </main>
<footer id="contact" class="site-footer blog-footer section-wrap" aria-labelledby="footer-contact-title">
    <h2 id="footer-contact-title" class="sr-only">Socials &amp; contact</h2>
    <div class="footer-row">
      <div class="studio-credit"><svg viewBox="0 0 34 34" aria-hidden="true"><path d="M4 25V9l13 11L30 9v16M4 9l13-5 13 5M17 20v10" fill="none" stroke="currentColor" stroke-width="1.2"/></svg><span><strong>${escapeHTML(profile.studio.name).toUpperCase()}</strong><small>GAME STUDIO</small></span></div>
      <div class="footer-identity"><a href="/" class="footer-brand">${escapeHTML(profile.name)}</a></div>
      
      <nav class="footer-socials" aria-label="Social profiles"><!--email_off--><a data-profile="email" class="footer-email-link" href="mailto:${escapeHTML(profile.email)}">Email &#8599;</a><!--/email_off--><a data-profile="github" target="_blank" rel="noopener noreferrer" href="${escapeHTML(profile.github)}">GitHub &#8599;</a><a data-profile="linkedin" target="_blank" rel="noopener noreferrer" href="${escapeHTML(profile.linkedin)}">LinkedIn &#8599;</a><a data-profile="resume" href="${escapeHTML(profile.resume)}" download="Evan-Bartkowski-Resume.pdf">R&eacute;sum&eacute; &#8595;</a></nav>
    </div>
  </footer>
</body>
</html>
`;
    await writeFile(resolve(outputRoot, `.${path}`), html, 'utf8');
    articlePaths.push(path);
    cards.push(`<article class="blog-card"><div class="blog-card-meta"><span>${escapeHTML(post.category.toUpperCase())}</span><time datetime="${escapeHTML(date)}">${escapeHTML(dateLabel(date))}</time></div><h2><a href="${path}">${escapeHTML(post.title)}</a></h2><p>${escapeHTML(description)}</p><div class="blog-card-footer"><span>${readingMinutes(post.body)} MIN READ</span><a href="${path}" aria-label="Read ${escapeHTML(post.title)}">&#8599;</a></div></article>`);
  }
  return {articlePaths, postsMarkup: cards.join('\n')};
}
