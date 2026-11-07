import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const dataPath = resolve(import.meta.dirname, '../data/blog-posts.json');
let writes = Promise.resolve();
const reply = (res, status, payload) => {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(payload));
};
const fail = (status, message) => Object.assign(new Error(message), {status});
const isLocal = req => {
  const remote = req.socket.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) return false;
  const host = req.headers.host || '';
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  return !req.headers.origin || req.headers.origin === `http://${host}`;
};
async function readPosts(storagePath = dataPath) {
  try {
    const document = JSON.parse(await readFile(storagePath, 'utf8'));
    if (!Array.isArray(document.posts)) throw new Error('Invalid blog data.');
    return document.posts;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
async function persist(posts, storagePath = dataPath) {
  await mkdir(resolve(storagePath, '..'), {recursive:true});
  const temporary = `${storagePath}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify({version:1,posts}, null, 2) + '\n', {encoding:'utf8',mode:0o600});
  await rename(temporary, storagePath);
}
async function body(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw fail(415, 'Send JSON to save a post.');
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 150_000) throw fail(413, 'This post is too large. Keep it under 30,000 characters.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw fail(400, 'The post could not be read. Send a JSON object.'); }
}
const text = (value, label, max, required = false) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw fail(400, `${label} ${required ? 'is required and ' : ''}must be under ${max} characters.`);
  return value.trim();
};
const slugify = title => title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90).replace(/-$/,'');

export async function handleBlogRequest(req, res, pathname, {storagePath = dataPath} = {}) {
  if (!pathname.startsWith('/api/blog/')) return false;
  try {
    if (pathname === '/api/blog/posts' && req.method === 'GET') {
      const posts = (await readPosts(storagePath)).filter(post => post.status === 'published').sort((a,b) => b.publishedAt.localeCompare(a.publishedAt));
      reply(res,200,{posts});
      return true;
    }
    if (!pathname.startsWith('/api/blog/admin')) { reply(res,404,{error:'Blog route not found.'}); return true; }
    if (!isLocal(req)) throw fail(403,'Post editing is available only from this website on the local server.');
    if (pathname === '/api/blog/admin' && req.method === 'GET') {
      reply(res,200,{canEdit:true,posts:await readPosts(storagePath)}); return true;
    }
    if (!req.headers.origin || req.headers.origin !== `http://${req.headers.host}`) throw fail(403,'Open the local blog editor to change posts.');
    if (pathname === '/api/blog/admin/posts' && req.method === 'POST') {
      const input = await body(req);
      const title = text(input.title,'Title',140,true);
      const content = text(input.body,'Post',30000,true);
      const excerpt = text(input.excerpt ?? '', 'Excerpt',300);
      const category = text(input.category ?? 'Engineering','Category',40,true);
      if (!['draft','published'].includes(input.status)) throw fail(400,'Choose draft or published.');
      const slug = text(input.slug || slugify(title),'URL slug',100,true);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw fail(400,'URL slugs can contain lowercase letters, numbers, and single hyphens.');
      if (input.id && (typeof input.id !== 'string' || input.id.length > 60)) throw fail(400,'Invalid post ID.');
      const operation = writes.then(async () => {
        const posts = await readPosts(storagePath);
        const index = posts.findIndex(post => post.id === input.id);
        if (input.id && index < 0) throw fail(404,'This post no longer exists. Reload the editor.');
        if (posts.some(post => post.slug === slug && post.id !== input.id)) throw fail(409,'Another post already uses this URL. Choose a different slug.');
        const existing = index >= 0 ? posts[index] : null;
        const now = new Date().toISOString();
        const post = {id:existing?.id || randomUUID(),slug,title,excerpt,category,body:content,status:input.status,author:'Evan Bartkowski',createdAt:existing?.createdAt || now,updatedAt:now,publishedAt:input.status === 'published' ? (existing?.publishedAt || now) : existing?.publishedAt || null};
        if (index >= 0) posts[index] = post; else posts.unshift(post);
        await persist(posts,storagePath);
        return post;
      });
      writes = operation.catch(() => {});
      reply(res,200,{post:await operation}); return true;
    }
    const deletion = pathname.match(/^\/api\/blog\/admin\/posts\/([a-zA-Z0-9-]+)$/);
    if (deletion && req.method === 'DELETE') {
      const operation = writes.then(async () => {
        const posts = await readPosts(storagePath);
        const remaining = posts.filter(post => post.id !== deletion[1]);
        if (remaining.length === posts.length) throw fail(404,'This post no longer exists.');
        await persist(remaining,storagePath);
      });
      writes = operation.catch(() => {});
      await operation;
      reply(res,200,{ok:true}); return true;
    }
    reply(res,405,{error:'This action is not supported.'});
  } catch (error) { reply(res,error.status || 500,{error:error.status ? error.message : 'The blog could not be saved. Your editor text is still here; try again.'}); }
  return true;
}
