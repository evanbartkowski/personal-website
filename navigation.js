import './visitor-tracking.js';
import { mountSettings } from './settings.js';

const PAGES = new Set(['/', '/index.html', '/about.html', '/experience.html', '/credentials.html', '/projects.html', '/blog.html', '/blog', '/blog/', '/blog/editor', '/blog/editor/']);
const normalizePath = path => /^\/blog(?:\/editor)?\/?$/.test(path) ? '/blog.html' : path === '/index.html' ? '/' : path;
const settings = mountSettings();
let activePage, pending, positionFrame;
let activePath = normalizePath(location.pathname);
let generation = 0, navigationId = 0;
const announcer = document.createElement('div');
announcer.id = 'navigation-status';
announcer.className = 'sr-only';
announcer.setAttribute('role', 'status');
announcer.setAttribute('aria-live', 'polite');
document.body.append(announcer);
history.scrollRestoration = 'manual';
function rememberPosition() {
  if (normalizePath(location.pathname) === activePath) history.replaceState({...history.state, portfolio: {scroll: [scrollX, scrollY]}}, '', location.href);
}
function setState(state) {
  document.documentElement.dataset.navigationState = state;
  document.documentElement.dataset.navigationId = String(navigationId);
}
function restoreScroll(url, position) {
  let target;
  try {target = url.hash ? document.getElementById(decodeURIComponent(url.hash.slice(1))) : null;} catch {}
  if (target) target.scrollIntoView({behavior: 'instant', block: 'start'});
  else scrollTo({left: position?.[0] || 0, top: position?.[1] || 0, behavior: 'instant'});
}
async function mountCurrentPage(path = activePath, ticket = generation) {
  settings?.attachHeader?.(); settings?.reapplyPalette?.();
  const module = path === '/blog.html' ? await import('./blog.js') : await import('./app.js');
  if (ticket !== generation) return;
  const page = path === '/blog.html' ? module.mountBlogPage() : module.mountPortfolioPage();
  activePage = page;
  if (page?.ready) await page.ready;
}
async function prepareStyles(parsed, signal) {
  const existing = new Map([...document.querySelectorAll('head link[rel="stylesheet"]')].map(link => [link.href, link]));
  const wanted = [], added = [];
  try {
    for (const source of parsed.querySelectorAll('head link[rel="stylesheet"]')) {
      const href = new URL(source.getAttribute('href'), location.origin).href;
      let link = existing.get(href);
      if (!link) {
        link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; added.push(link);
        const ready = new Promise((resolve, reject) => {
          const abort = () => reject(new DOMException('Navigation superseded', 'AbortError'));
          signal.addEventListener('abort', abort, {once: true});
          link.onload = () => {signal.removeEventListener('abort', abort); resolve();};
          link.onerror = () => {signal.removeEventListener('abort', abort); reject(new Error('Stylesheet could not load'));};
        });
        document.head.append(link); await ready;
      }
      wanted.push(link);
    }
    if (signal.aborted) throw new DOMException('Navigation superseded', 'AbortError');
    return () => {
      for (const link of existing.values()) if (!wanted.includes(link)) link.remove();
      document.head.append(...wanted);
    };
  } catch (error) {for (const link of added) link.remove(); throw error;}
}
function swapContent(parsed) {
  activePage?.dispose?.(); activePage = undefined;
  // Keep audio connected: no recreation, pause, source change, or seeking.
  for (const node of [...document.body.childNodes]) {
    if (node === announcer || node.nodeType === Node.ELEMENT_NODE && node.matches('#site-settings, #portfolio-music-player, #portfolio-background-music')) continue;
    node.remove();
  }
  document.body.className = parsed.body.className;
  for (const attribute of [...document.body.attributes]) if (attribute.name.startsWith('data-')) document.body.removeAttribute(attribute.name);
  for (const attribute of parsed.body.attributes) if (attribute.name.startsWith('data-')) document.body.setAttribute(attribute.name, attribute.value);
  for (const node of parsed.body.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE && node.matches('script, #site-settings, #portfolio-music-player, #portfolio-background-music, .ambient-field, .pointer-aura')) continue;
    document.body.insertBefore(document.importNode(node, true), announcer);
  }
  settings?.attachHeader?.(); settings?.reapplyPalette?.();
}
function updateMetadata(parsed) {
  document.title = parsed.title;
  const selector = 'meta[name="description"], meta[name="robots"], meta[name^="twitter:"], meta[property], link[rel="canonical"], script[type="application/ld+json"]';
  for (const node of document.head.querySelectorAll(selector)) node.remove();
  for (const node of parsed.head.querySelectorAll(selector)) document.head.append(document.importNode(node, true));
}
export async function navigatePage(destination, {replace = false, fromHistory = false, position} = {}) {
  const url = new URL(destination, location.href);
  if (url.origin !== location.origin || !PAGES.has(url.pathname)) {location.assign(url.href); return;}
  const targetPath = normalizePath(url.pathname);
  if (targetPath === activePath && url.search === location.search) {
    if (pending) {generation++; pending.abort(); pending = undefined; setState('idle');}
    if (!fromHistory && url.href !== location.href) history.pushState({...history.state}, '', url.href);
    restoreScroll(url, position); window.dispatchEvent(new HashChangeEvent('hashchange')); return;
  }
  if (activePage?.beforeLeave && !activePage.beforeLeave()) return;
  const ticket = ++generation;
  pending?.abort(); const controller = new AbortController(); pending = controller;
  if (!fromHistory) rememberPosition();
  setState('loading');
  try {
    const response = await fetch(url.href, {signal: controller.signal, headers: {'Accept': 'text/html'}});
    if (!response.ok || !response.headers.get('Content-Type')?.includes('text/html')) throw new Error('Page could not load');
    const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
    const currentBuild = document.documentElement.dataset.buildVersion;
    const incomingBuild = parsed.documentElement.dataset.buildVersion;
    if (currentBuild && incomingBuild && currentBuild !== incomingBuild) {location.assign(url.href); return;}
    if (!parsed.querySelector('main') || !parsed.querySelector('.site-header, .blog-header')) throw new Error('Page content incomplete');
    const commitStyles = await prepareStyles(parsed, controller.signal);
    if (ticket !== generation) return;
    if (!fromHistory) {rememberPosition(); history[replace ? 'replaceState' : 'pushState']({portfolio: {scroll: [0, 0]}}, '', url.href);}
    commitStyles(); updateMetadata(parsed); swapContent(parsed); activePath = targetPath;
    await mountCurrentPage(targetPath, ticket);
    if (ticket !== generation) return;
    navigationId++; await new Promise(resolve => requestAnimationFrame(resolve));
    restoreScroll(url, position);
    const main = document.querySelector('main');
    if (main && !document.querySelector('dialog[open]')) {main.setAttribute('tabindex', '-1'); main.focus({preventScroll: true});}
    announcer.textContent = document.title; setState('idle');
    document.dispatchEvent(new CustomEvent('portfolio:pagechange', {detail: {path: activePath, url: url.href, navigationId}}));
  } catch (error) {if (error.name !== 'AbortError' && ticket === generation) location.assign(url.href);}
  finally {if (ticket === generation) {pending = undefined; setState('idle');}}
}
document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!link || link.hasAttribute('download') || link.target && link.target !== '_self' || link.relList.contains('external') || link.dataset.nativeNavigation !== undefined) return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin || !PAGES.has(url.pathname)) return;
  if (normalizePath(url.pathname) === activePath && url.search === location.search && url.hash) return;
  event.preventDefault(); navigatePage(url.href);
});
window.addEventListener('portfolio:navigate', event => {event.preventDefault(); navigatePage(event.detail.url);});
window.addEventListener('popstate', event => {navigatePage(location.href, {fromHistory: true, position: event.state?.portfolio?.scroll});});
window.addEventListener('scroll', () => {
  if (positionFrame || pending) return;
  positionFrame = requestAnimationFrame(() => {positionFrame = 0; if (!pending) rememberPosition();});
}, {passive: true});
setState('loading');
const initialTicket = generation;
await mountCurrentPage(activePath, initialTicket);
if (initialTicket === generation) {
  rememberPosition(); setState('idle');
  document.dispatchEvent(new CustomEvent('portfolio:pagechange', {detail: {path: activePath, url: location.href, navigationId}}));
}
