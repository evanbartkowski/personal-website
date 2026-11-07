import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { profile, projects } from '../content.js';
import { credentialDocuments } from '../credential-data.js';

export const siteOrigin = 'https://evanbartkowski.com';
export const pages = [
  {file: 'index.html', path: '/', title: 'Evan Bartkowski | Cybersecurity Engineer & Developer', description: 'Evan Bartkowski, cybersecurity engineer at CyberMaxx and software developer. Explore security implementation experience, credentials, and original projects.'},
  {file: 'about.html', path: '/about.html', title: 'About Evan Bartkowski | Cybersecurity & Software', description: 'Meet Evan Bartkowski, a University of Maryland, Baltimore County computer science graduate studying cybersecurity at the Georgia Institute of Technology.'},
  {file: 'experience.html', path: '/experience.html', title: 'Experience & Skills | Evan Bartkowski', description: 'Evan Bartkowski’s CyberMaxx security work, certifications, skills, and education at the University of Maryland, Baltimore County and Georgia Institute of Technology.'},
  {file: 'credentials.html', path: '/credentials.html', title: 'Certifications | Evan Bartkowski', description: 'View Evan Bartkowski’s original certification and learning documents, including CompTIA Security+, Google AI credentials, AI4ALL training, and academic honors.'},
  {file: 'projects.html', path: '/projects.html', title: 'Software & Game Projects | Evan Bartkowski', description: 'Explore Evan Bartkowski’s software and games: MMA Cipher, JinxKiss, Starlight Fishing, Seven Seas, DREADRAIL, and Small Hours, with demos and source links.'},
  {file: 'blog.html', path: '/blog.html', title: 'Cybersecurity & Engineering Blog | Evan Bartkowski', description: 'Notes from Evan Bartkowski on cybersecurity, Linux systems, software engineering, machine learning, and building original applications and games.'},
];
export const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[character]));
const absolute = path => new URL(path, siteOrigin).href;
const personId = `${siteOrigin}/#evan-bartkowski`;
const siteId = `${siteOrigin}/#website`;
const logoId = `${siteOrigin}/#logo`;

export function structuredData({title, description, path, article}) {
  const url = absolute(path);
  const graph = [
    {'@type':'Person', '@id':personId, name:profile.name, url:`${siteOrigin}/`, jobTitle:profile.role, worksFor:{'@type':'Organization',name:profile.company}, sameAs:[profile.github,profile.linkedin], alumniOf:{'@type':'CollegeOrUniversity',name:'University of Maryland, Baltimore County'}, knowsAbout:['Cybersecurity', 'SIEM implementation', 'Endpoint detection and response', 'Network defense', 'Linux systems programming', 'Python', 'C', 'Software engineering', 'Machine learning', 'Three.js'], hasCredential:[{'@type':'EducationalOccupationalCredential','name':'CompTIA Security+','credentialCategory':'certification','recognizedBy':{'@type':'Organization','name':'CompTIA'}},{'@type':'EducationalOccupationalCredential','name':'CompTIA CySA+','credentialCategory':'certification','recognizedBy':{'@type':'Organization','name':'CompTIA'}},{'@type':'EducationalOccupationalCredential','name':'Google Cloud Certified Professional Cloud Architect','credentialCategory':'certification','recognizedBy':{'@type':'Organization','name':'Google Cloud'}},{'@type':'EducationalOccupationalCredential','name':'CompTIA Security Analytics Professional (CSAP)','credentialCategory':'certification','recognizedBy':{'@type':'Organization','name':'CompTIA'}},{'@type':'EducationalOccupationalCredential','name':'CompTIA Network+','credentialCategory':'certification','recognizedBy':{'@type':'Organization','name':'CompTIA'}}]},
    {'@type':'ImageObject', '@id':logoId, url:absolute('/assets/brand/logo-512.png'), contentUrl:absolute('/assets/brand/logo-512.png'), name:'Evan Bartkowski website orbital logo', width:512, height:512},
    {'@type':'WebSite', '@id':siteId, url:`${siteOrigin}/`, name:profile.name, alternateName:'Evan Bartkowski Portfolio', description:pages[0].description, publisher:{'@id':personId}, image:{'@id':logoId}, inLanguage:'en-US'},
  ];
  const page = {'@type':path === '/about.html' ? 'ProfilePage' : ['/projects.html','/credentials.html','/blog.html'].includes(path) ? 'CollectionPage' : 'WebPage', '@id':`${url}#webpage`, url, name:title, description, isPartOf:{'@id':siteId}, about:{'@id':personId}, primaryImageOfPage:{'@type':'ImageObject',url:absolute('/assets/social-preview.png'),width:1200,height:630}, inLanguage:'en-US'};
  if (path === '/' || path === '/about.html') page.mainEntity = {'@id':personId};
  if (path !== '/') {
    const label = article ? article.title : pages.find(item => item.path === path)?.title.split(' | ')[0] || title;
    const items = [{name:'Home',item:`${siteOrigin}/`}, ...(article ? [{name:'Blog',item:absolute('/blog.html')}] : []), {name:label,item:url}];
    const breadcrumb = {'@type':'BreadcrumbList','@id':`${url}#breadcrumb`,itemListElement:items.map((item,index)=>({'@type':'ListItem',position:index+1,...item}))};
    page.breadcrumb = {'@id':breadcrumb['@id']}; graph.push(breadcrumb);
  }
  if (path === '/projects.html') {
    page.mainEntity = {'@type':'ItemList',itemListElement:projects.map((project,index)=>({'@type':'ListItem',position:index+1,item:{'@type':'CreativeWork',name:project.title,description:project.description,image:absolute(project.artwork),creator:{'@id':personId},...(project.url ? {url:project.url} : {})}}))};
  }
  if (path === '/credentials.html') {
    page.mainEntity = {'@type':'ItemList',itemListElement:credentialDocuments.map((record,index)=>({'@type':'ListItem',position:index+1,item:{'@type':'CreativeWork',name:record.title,description:record.detail,genre:record.categoryLabel,url:absolute(record.pdf),creator:{'@type':'Organization',name:record.issuer}}}))};
  }
  if (article) {
    const entry = {'@type':'BlogPosting','@id':`${url}#article`,headline:article.title,description,url,mainEntityOfPage:{'@id':page['@id']},author:{'@id':personId},publisher:{'@id':personId},image:absolute('/assets/social-preview.png'),inLanguage:'en-US',articleSection:article.category};
    for (const [key,value] of Object.entries({datePublished:article.publishedAt || article.createdAt,dateModified:article.updatedAt || article.publishedAt || article.createdAt})) if (value && Number.isFinite(Date.parse(value))) entry[key]=new Date(value).toISOString();
    graph.push(entry); page.mainEntity={'@id':entry['@id']};
  }
  graph.push(page);
  return {'@context':'https://schema.org','@graph':graph};
}

export function renderHead(page, verification = {}) {
  const {title,description,path,article} = page;
  const image = absolute('/assets/social-preview.png');
  const imageAlt = 'Evan Bartkowski — Cybersecurity Engineer & Developer, with his green orbital website logo.';
  const meta = (attribute, name, value) => `  <meta ${attribute}="${name}" content="${escapeHTML(value)}" />`;
  return [
    `  <title>${escapeHTML(title)}</title>`,
    meta('name','description',description),
    meta('name','author',profile.name),
    meta('name','application-name',profile.name),
    meta('name','robots','index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'),
    meta('property','og:site_name',profile.name),
    meta('property','og:locale','en_US'),
    meta('property','og:title',title),
    meta('property','og:description',description),
    meta('property','og:type',article ? 'article' : 'website'),
    meta('property','og:url',absolute(path)),
    meta('property','og:image',image),
    meta('property','og:image:type','image/png'),
    meta('property','og:image:width','1200'),
    meta('property','og:image:height','630'),
    meta('property','og:image:alt',imageAlt),
    meta('name','twitter:card','summary_large_image'),
    meta('name','twitter:title',title),
    meta('name','twitter:description',description),
    meta('name','twitter:image',image),
    meta('name','twitter:image:alt',imageAlt),
    ...(verification.googleSiteVerification ? [meta('name','google-site-verification',verification.googleSiteVerification)] : []),
    ...(verification.bingSiteVerification ? [meta('name','msvalidate.01',verification.bingSiteVerification)] : []),
    `  <link rel="canonical" href="${escapeHTML(absolute(path))}" />`,
    '  <link rel="icon" href="/assets/brand/favicon-96.png" type="image/png" sizes="96x96" />',
    '  <link rel="icon" href="/assets/brand/favicon-48.png" type="image/png" sizes="48x48" />',
    '  <link rel="icon" href="/assets/brand/favicon-32.png" type="image/png" sizes="32x32" />',
    '  <link rel="shortcut icon" href="/favicon.ico" />',
    '  <link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any" />',
    '  <link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png" sizes="180x180" />',
    '  <link rel="manifest" href="/site.webmanifest" />',
    '  <link rel="sitemap" href="/sitemap.xml" type="application/xml" />',
    `  <script type="application/ld+json">${JSON.stringify(structuredData(page)).replace(/</g,'\\u003c')}</script>`,
  ].join('\n');
}

export function applyMetadata(html, page, verification) {
  const clean = html.replace(/^[ \t]*<title>[\s\S]*?<\/title>[ \t]*\r?\n?/gm,'')
    .replace(/^[ \t]*<meta\b[^>]*(?:name="(?:description|author|application-name|robots|twitter:[^"]*|google-site-verification|msvalidate\.01)"|property="[^"]+")[^>]*>[ \t]*\r?\n?/gm,'')
    .replace(/^[ \t]*<link\b[^>]*rel="(?:canonical|icon|shortcut icon|apple-touch-icon|manifest|sitemap)"[^>]*>[ \t]*\r?\n?/gm,'')
    .replace(/^[ \t]*<script type="application\/ld\+json">[\s\S]*?<\/script>[ \t]*\r?\n?/gm,'');
  return clean.replace(/(<meta name="theme-color"[^>]*>)/, `$1\n${renderHead(page,verification)}`);
}

export async function exportDiscovery({output, articlePaths = [], verification}) {
  const urls = [...pages.map(page=>page.path),...articlePaths];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(path=>`  <url><loc>${escapeHTML(absolute(path))}</loc></url>`).join('\n')}\n</urlset>\n`;
  await writeFile(resolve(output,'sitemap.xml'),sitemap);
  await writeFile(resolve(output,'robots.txt'),`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /blog/editor\n\nSitemap: ${siteOrigin}/sitemap.xml\n`);
  if (!/^[a-f0-9]{32}$/.test(verification.indexNowKey)) throw new Error('Invalid public IndexNow ownership key');
  await writeFile(resolve(output,`${verification.indexNowKey}.txt`),verification.indexNowKey);
}

export async function readSearchConfig(root) {
  const config = JSON.parse(await readFile(resolve(root,'search.config.json'),'utf8'));
  if (config.origin !== siteOrigin) throw new Error('Search origin must match the Firebase production site');
  return config;
}
