import { publishedPosts } from './blog-data.js';
import { createPageLifecycle } from './page-lifecycle.js';

export function mountBlogPage() {

const lifecycle = createPageLifecycle();
const {one: $, all: $$, on, request} = lifecycle;
const localHost = ['127.0.0.1','localhost'].includes(location.hostname);
let posts = [...publishedPosts];
let ownerPosts = [];
let canEdit = false;
let activeTopic = 'all';
let selectedId = null;
let dirty = false;
let saving = false;
let previewing = false;
let deleteId = null;
const recoveryKey = 'evan-blog-unsaved-v1';
const editor = $('#blog-editor');
const reader = $('#post-reader');
const form = $('#editor-form');
const status = $('#editor-status');
const field = name => form.elements.namedItem(name);
const dateLabel = value => new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(value));
const words = value => value.trim() ? value.trim().split(/\s+/).length : 0;
const minutes = body => Math.max(1,Math.ceil(words(body)/220));


// Build every user-authored element through text nodes; HTML is never executed.
function inline(parent, value) {
  const expression = /(\*\*([^*\n]+)\*\*|`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let cursor = 0;
  for (const match of value.matchAll(expression)) {
    parent.append(document.createTextNode(value.slice(cursor,match.index)));
    const node = document.createElement(match[2] ? 'strong' : match[3] ? 'code' : 'a');
    node.textContent = match[2] || match[3] || match[4];
    if (node.tagName === 'A') {node.href = match[5]; node.target = '_blank'; node.rel = 'noopener noreferrer';}
    parent.append(node);
    cursor = match.index + match[0].length;
  }
  parent.append(document.createTextNode(value.slice(cursor)));
}
function markdown(target, value) {
  target.replaceChildren();
  const lines = value.replace(/\r\n/g,'\n').split('\n');
  let paragraph = [];
  let list = null;
  let code = null;
  const flush = () => {
    if (paragraph.length) {const p = document.createElement('p'); inline(p,paragraph.join(' ')); target.append(p); paragraph = [];}
    list = null;
  };
  for (const line of lines) {
    if (line.startsWith('```')) {
      flush();
      if (code) code = null;
      else {const pre = document.createElement('pre'); code = document.createElement('code'); pre.append(code); target.append(pre);}
      continue;
    }
    if (code) {code.append(document.createTextNode(line + '\n')); continue;}
    if (!line.trim()) {flush(); continue;}
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {flush();const h = document.createElement(`h${Math.min(3,heading[1].length + 1)}`);inline(h,heading[2]);target.append(h);continue;}
    if (/^\s*---+\s*$/.test(line)) {flush();target.append(document.createElement('hr'));continue;}
    if (line.startsWith('> ')) {flush();const quote = document.createElement('blockquote');inline(quote,line.slice(2));target.append(quote);continue;}
    const item = line.match(/^\s*(?:([-*])|\d+\.)\s+(.+)$/);
    if (item) {
      if (paragraph.length) flush();
      const type = item[1] ? 'UL' : 'OL';
      if (!list || list.tagName !== type) {list = document.createElement(type);target.append(list);}
      const li = document.createElement('li');inline(li,item[2]);list.append(li);continue;
    }
    list = null;
    paragraph.push(line.trim());
  }
  flush();
}
function make(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}
function renderPosts() {
  const visible = posts.filter(post => activeTopic === 'all' || post.category === activeTopic).sort((a,b) => (b.publishedAt || b.createdAt).localeCompare(a.publishedAt || a.createdAt));
  const grid = $('#blog-posts');
  grid.replaceChildren();
  $('#post-count').textContent = `${String(visible.length).padStart(2,'0')} ${visible.length === 1 ? 'ENTRY' : 'ENTRIES'}`;
  $('#blog-empty').hidden = visible.length > 0;
  $('#blog-empty h2').textContent = activeTopic === 'all' ? 'No posts yet.' : `No ${activeTopic.toLowerCase()} notes yet.`;
  for (const post of visible) {
    const card = make('article','blog-card');
    const meta = make('div','blog-card-meta');
    meta.append(make('span','',post.category.toUpperCase()),make('time','',dateLabel(post.publishedAt || post.createdAt)));
    meta.querySelector('time').dateTime = post.publishedAt || post.createdAt;
    const heading = make('h2');
    const open = make(localHost ? 'button' : 'a','',post.title);
    if (localHost) {open.type = 'button';on(open, 'click',() => {location.hash = `post=${encodeURIComponent(post.slug)}`;});}
    else open.href = `/blog/posts/${encodeURIComponent(post.slug)}.html`;
    heading.append(open);
    const excerpt = post.excerpt || post.body.replace(/[#*`>\[\]]/g,'').replace(/\s+/g,' ').slice(0,180);
    const footer = make('div','blog-card-footer');
    const arrow = make(localHost ? 'button' : 'a','','↗');
    arrow.setAttribute('aria-label',`Read ${post.title}`);
    if (localHost) {arrow.type = 'button';on(arrow, 'click',() => open.click());}
    else arrow.href = open.href;
    footer.append(make('span','',`${minutes(post.body)} MIN READ`),arrow);
    card.append(meta,heading,make('p','',excerpt),footer);grid.append(card);
  }
}
for (const button of $$('[data-topic]')) on(button, 'click',() => {
  activeTopic = button.dataset.topic;
  for (const item of $$('[data-topic]')) {item.classList.toggle('active',item === button);item.setAttribute('aria-pressed',String(item === button));}
  renderPosts();
});
function openPost(slug) {
  const post = posts.find(item => item.slug === slug);
  if (!post) {$('#blog-message').textContent = 'This post is not available. It may have been unpublished.';return;}
  $('#post-reader-meta').textContent = `${post.category.toUpperCase()} / ${dateLabel(post.publishedAt || post.createdAt)} / ${minutes(post.body)} MIN READ`;
  $('#post-reader-title').textContent = post.title;
  $('#post-reader-author').textContent = `By Evan Bartkowski${post.updatedAt > post.publishedAt ? ` · Updated ${dateLabel(post.updatedAt)}` : ''}`;
  markdown($('#post-reader-body'),post.body);
  if (editor.open) editor.close();
  if (!reader.open) reader.showModal();
  reader.scrollTop = 0;
}
function showStatus(message, error = false) {status.textContent = message;status.classList.toggle('error',error);}
function snapshot() {
  return {id:selectedId,title:field('title').value,slug:field('slug').value,category:field('category').value,excerpt:field('excerpt').value,body:field('body').value};
}
function saveRecovery() {try {sessionStorage.setItem(recoveryKey,JSON.stringify(snapshot()));} catch { /* Writing still works when browser storage is unavailable. */ }}
function clearRecovery() {try {sessionStorage.removeItem(recoveryKey);} catch { /* Optional recovery state. */ }}
function updateWordCount() {$('#editor-word-count').textContent = `${words(field('body').value)} WORDS`;}
function setPreview(value) {
  previewing = value;
  $('.editor-fields').hidden = value;
  $('#editor-preview').hidden = !value;
  $('#preview-post').textContent = value ? 'Back to writing' : 'Preview';
  $('#preview-post').setAttribute('aria-pressed',String(value));
  if (value) {markdown($('#editor-preview'),`# ${field('title').value || 'Untitled note'}\n\n${field('body').value}`);}
}
function loadPost(post = null) {
  selectedId = post?.id || null;
  for (const name of ['title','slug','excerpt','body']) field(name).value = post?.[name] || '';
  field('category').value = post?.category || 'Security';
  if (!field('category').value) field('category').value = 'Other';
  $('#delete-post').hidden = !selectedId;
  $('#save-draft').textContent = post?.status === 'published' ? 'Unpublish' : 'Save draft';
  $('#publish-post').firstChild.textContent = post?.status === 'published' ? 'Update post ' : 'Publish ';
  dirty = false;
  setPreview(false);updateWordCount();
  showStatus(post ? `${post.status === 'published' ? 'Published' : 'Draft'} · Saved ${dateLabel(post.updatedAt)}` : 'Unsaved note');
  renderSaved();
}
function renderSaved() {
  const list = $('#saved-posts');list.replaceChildren();
  for (const post of [...ownerPosts].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const button = make('button',post.id === selectedId ? 'active' : '');button.type = 'button';
    button.append(make('span','',post.title),make('small','',`${post.status.toUpperCase()} / ${dateLabel(post.updatedAt)}`));
    on(button, 'click',() => {if (dirty && !confirm('Discard the unsaved changes and open this post?')) return;clearRecovery();loadPost(post);});
    list.append(button);
  }
}
function openEditor() {
  if (reader.open) reader.close();
  if (!canEdit) {
    $('#editor-notice').textContent = 'Writing is available on Evan’s local server. Public visitors can read published notes. Open http://127.0.0.1:4173/blog.html#write on the computer running the site to manage posts.';
    for (const element of form.elements) element.disabled = true;
    $('#new-post').disabled = true;
  }
  if (!editor.open) editor.showModal();
}
on($('#open-editor'), 'click',() => {location.hash = 'write';openEditor();});
for (const button of $$('[data-write]')) on(button, 'click',() => {location.hash = 'write';openEditor();});
on($('#new-post'), 'click',() => {if (dirty && !confirm('Discard the unsaved changes and start a new post?')) return;clearRecovery();loadPost();field('title').focus();});
on($('#preview-post'), 'click',() => setPreview(!previewing));
on(form, 'input',() => {
  dirty = true;updateWordCount();saveRecovery();showStatus('Unsaved changes · recovery saved in this browser');
});
function busy(value) {
  saving = value;
  for (const button of $$('.editor-actions button, .editor-sidebar button')) button.disabled = value || !canEdit;
  editor.setAttribute('aria-busy',String(value));
}
on(form, 'submit',async event => {
  event.preventDefault();
  if (saving || !canEdit || !form.reportValidity()) return;
  const state = event.submitter?.value === 'draft' ? 'draft' : 'published';
  busy(true);showStatus(state === 'published' ? 'Publishing…' : 'Saving draft…');
  try {
    const response = await request('/api/blog/admin/posts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...snapshot(),status:state})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The post could not be saved.');
    const old = ownerPosts.findIndex(post => post.id === result.post.id);
    if (old >= 0) ownerPosts[old] = result.post;else ownerPosts.push(result.post);
    posts = ownerPosts.filter(post => post.status === 'published');
    clearRecovery();loadPost(result.post);renderPosts();
    showStatus(state === 'published' ? 'Published. Your note is now visible on the local site.' : 'Draft saved. Only you can see it in this editor.');
  } catch (error) {showStatus(error.message || 'The post could not be saved. Your writing is still here.',true);}
  finally {busy(false);}
});
on($('#delete-post'), 'click',() => {deleteId = selectedId;$('#delete-confirmation').showModal();});
on($('#cancel-delete'), 'click',() => $('#delete-confirmation').close());
on($('#confirm-delete'), 'click',async () => {
  if (!deleteId || saving) return;
  $('#delete-confirmation').close();busy(true);
  try {
    const response = await request(`/api/blog/admin/posts/${encodeURIComponent(deleteId)}`,{method:'DELETE'});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The post could not be deleted.');
    ownerPosts = ownerPosts.filter(post => post.id !== deleteId);posts = ownerPosts.filter(post => post.status === 'published');
    clearRecovery();loadPost();renderPosts();showStatus('Post deleted.');
  } catch (error) {showStatus(error.message,true);} finally {deleteId = null;busy(false);}
});
for (const dialog of [editor,reader]) {
  on(dialog.querySelector('.blog-close'), 'click',() => dialog.close());
  on(dialog, 'close',() => {
    if ((dialog === editor && location.hash === '#write') || (dialog === reader && location.hash.startsWith('#post='))) history.replaceState(null,'',location.pathname + location.search);
  });
}
function route() {
  if (location.hash === '#write') {openEditor();return;}
  if (location.hash.startsWith('#post=')) {
    try {openPost(decodeURIComponent(location.hash.slice(6)));} catch {$('#blog-message').textContent = 'This post link could not be read.';}
    return;
  }
  if (reader.open) reader.close();if (editor.open) editor.close();
}
on(window, 'hashchange',route);
const motion = matchMedia('(prefers-reduced-motion: reduce)');
if (!motion.matches) on(window, 'pointermove',event => {
  document.documentElement.style.setProperty('--blog-x',`${(event.clientX / innerWidth - .5) * 35}px`);
  document.documentElement.style.setProperty('--blog-y',`${(event.clientY / innerHeight - .5) * 35}px`);
},{passive:true});

async function initialize() {
  if (localHost) {
    try {
      const response = await request('/api/blog/posts',{cache:'no-store'});
      if (response.ok) {const result = await response.json();if (Array.isArray(result.posts)) posts = result.posts;}
      const adminResponse = await request('/api/blog/admin',{cache:'no-store'});
      if (adminResponse.ok) {
        const admin = await adminResponse.json();
        if (admin.canEdit && Array.isArray(admin.posts)) {canEdit = true;ownerPosts = admin.posts;}
      }
    } catch {if (!lifecycle.active) return; $('#blog-message').textContent = 'Showing the latest published export. The local writing server is unavailable.';}
  }
  if (!lifecycle.active) return;
  $('#open-editor').hidden = !canEdit;
  for (const button of $$('[data-write]')) button.hidden = !canEdit;
  loadPost();
  if (canEdit) {
    try {
      const recovered = JSON.parse(sessionStorage.getItem(recoveryKey) || 'null');
      if (recovered && typeof recovered.body === 'string' && typeof recovered.title === 'string') {
        loadPost(ownerPosts.find(post => post.id === recovered.id) || null);
        for (const name of ['title','slug','excerpt','body','category']) if (typeof recovered[name] === 'string') field(name).value = recovered[name];
        dirty = true;updateWordCount();showStatus('Recovered your unsaved writing from this browser.');
      }
    } catch { /* Unavailable or outdated optional recovery data. */ }
  }
  renderPosts();route();
}
const ready = initialize();

import('./ambient.js').then(({mountAmbient})=>{if (lifecycle.active) lifecycle.cleanup(mountAmbient());}).catch(()=>{});

return {ready, beforeLeave() {if (dirty) saveRecovery(); return true;}, dispose() {if (dirty) saveRecovery(); lifecycle.dispose();}};
}
