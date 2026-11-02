import { profile, projects } from './content.js';
import { mountCredentialArchive } from './credential-archive.js';

const $ = (selector, context = document) => context.querySelector(selector);
const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
mountCredentialArchive($('#credentials'));

for (const link of $$('[data-profile]')) {
  const field = link.dataset.profile;
  link.href = field === 'email' ? `mailto:${profile.email}` : profile[field];
}
$('#year').textContent = new Date().getFullYear();

const projectGrid = $('#projects');
for (const project of projects) {
  const article = document.createElement('article');
  article.className = 'project-card reveal';
  article.dataset.category = ['mma', 'jinx'].includes(project.id) ? 'web' : 'worlds';
  article.innerHTML = `
    <button class="project-art-button" data-project="${project.id}" aria-label="Read the ${escapeHTML(project.title)} project dossier">
      <img src="/assets/${project.id}.svg" alt="${{mma:'Illustrated fighter comparison and analytical octagon',jinx:'Lavender and coral playing cards arranged in a fan',hours:'Illustrated isometric house and sunlit landscape',rail:'Atmospheric freight train corridor with an amber signal'}[project.id]}" width="1000" height="650" loading="lazy" />
      <span class="project-art-meta" aria-hidden="true"><span>PROJECT ${project.number}</span><span>FIELD NOTES / ${project.color.toUpperCase()}</span></span><span class="project-open" aria-hidden="true">↗</span>
    </button>
    <div class="project-content"><div class="project-title-row"><h3><button data-project="${project.id}">${escapeHTML(project.title)}</button></h3><span class="project-category">${escapeHTML(project.category)}</span></div><p>${escapeHTML(project.description)}</p><div class="project-tags">${project.tags.map(tag => `<span>${escapeHTML(tag)}</span>`).join('')}</div></div>`;
  projectGrid.append(article);
}

const projectDialog = $('#project-dialog');
function openProject(id) {
  const project = projects.find(item => item.id === id);
  if (!project) return;
  $('#project-dialog-content').innerHTML = `
    <img class="project-dialog-art" src="/assets/${project.id}.svg" alt="" />
    <div class="project-dialog-body"><div class="eyebrow">PROJECT DOSSIER / ${project.number} — ${escapeHTML(project.category)}</div><h2 id="project-dialog-title">${escapeHTML(project.title)}</h2><p class="project-dialog-short">${escapeHTML(project.short)}</p><p class="project-dialog-description">${escapeHTML(project.description)}</p><div class="case-study-grid"><div><h3>THE CHALLENGE</h3><p>${escapeHTML(project.problem)}</p></div><div><h3>THE APPROACH</h3><p>${escapeHTML(project.approach)}</p></div></div><p class="project-dialog-description">${escapeHTML(project.detail)}</p><div class="project-tags">${project.tags.map(tag => `<span>${escapeHTML(tag)}</span>`).join('')}</div>${project.url ? `<a href="${escapeHTML(project.url)}" target="_blank" rel="noopener noreferrer" class="button button-primary">${escapeHTML(project.linkLabel)} <span aria-hidden="true">↗</span></a>` : '<p class="project-demo-note">DEVELOPMENT PROJECT · Get in touch for a walkthrough.</p><a href="#contact" class="button button-secondary" data-close-project>Ask about this project <span aria-hidden="true">↗</span></a>'}</div>`;
  projectDialog.showModal();
  $('[data-close-project]', projectDialog)?.addEventListener('click', () => projectDialog.close());
}
projectGrid.addEventListener('click', event => {
  const button = event.target.closest('[data-project]');
  if (button) openProject(button.dataset.project);
});
for (const button of $$('[data-filter]')) {
  button.addEventListener('click', () => {
    const filter = button.dataset.filter;
    for (const item of $$('[data-filter]')) {
      item.classList.toggle('active', item === button);
      item.setAttribute('aria-pressed', String(item === button));
    }
    let count = 0;
    for (const article of $$('.project-card')) {
      article.hidden = filter !== 'all' && article.dataset.category !== filter;
      if (!article.hidden) {count++; article.classList.add('visible');}
    }
    $('#filter-status').textContent = `${count} projects shown.`;
  });
}

for (const dialog of $$('dialog')) {
  $('.dialog-close', dialog).addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
}

let toastTimer;
function notify(message) {
  clearTimeout(toastTimer);
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}
$('#copy-email').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(profile.email);
    notify('EMAIL COPIED. OPEN A NEW FREQUENCY.');
  } catch {
    // Keep the real address usable when clipboard permissions are unavailable.
    const selection = getSelection();
    const range = document.createRange();
    range.selectNodeContents($('.email-link'));
    selection.removeAllRanges(); selection.addRange(range);
    notify('EMAIL SELECTED. PRESS CTRL/CMD + C TO COPY.');
  }
});

const menuToggle = $('.menu-toggle');
const mobileNav = $('#mobile-nav');
function closeMenu() {mobileNav.hidden = true; menuToggle.setAttribute('aria-expanded','false'); menuToggle.setAttribute('aria-label','Open navigation');}
menuToggle.addEventListener('click', () => {
  const expanded = menuToggle.getAttribute('aria-expanded') !== 'true';
  menuToggle.setAttribute('aria-expanded', String(expanded));
  menuToggle.setAttribute('aria-label', expanded ? 'Close navigation' : 'Open navigation');
  mobileNav.hidden = !expanded;
});
for (const link of $$('a', mobileNav)) link.addEventListener('click', closeMenu);
document.addEventListener('keydown', event => {if (event.key === 'Escape') closeMenu();});
matchMedia('(min-width:761px)').addEventListener('change', event => {if (event.matches) closeMenu();});

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let savedMotion = null;
try {savedMotion = localStorage.getItem('vault-motion');} catch { /* Private browsing may block storage. */ }
let motionPaused = reducedMotion.matches || savedMotion === 'paused';
let reactor;
function updateMotion() {
  document.body.classList.toggle('motion-paused', motionPaused);
  $('#motion-toggle').setAttribute('aria-pressed', String(motionPaused));
  $('#motion-toggle').title = motionPaused ? 'Resume visual motion' : 'Pause visual motion';
  $('#motion-label').textContent = motionPaused ? 'Resume motion' : 'Pause motion';
  $('#motion-symbol').textContent = motionPaused ? '▷' : 'Ⅱ';
  reactor?.setPaused(motionPaused);
}
$('#motion-toggle').addEventListener('click', () => {
  motionPaused = !motionPaused;
  try {localStorage.setItem('vault-motion', motionPaused ? 'paused' : 'running');} catch { /* Optional preference. */ }
  updateMotion();
});
reducedMotion.addEventListener('change', event => {motionPaused = event.matches; updateMotion();});
updateMotion();
let schematic = false;
$('#reactor-mode').addEventListener('click', () => {
  schematic = !schematic;
  $('#reactor-mode').setAttribute('aria-pressed', String(schematic));
  reactor?.setMode(schematic ? 'schematic' : 'orbit');
});
function showReactorFallback() {
  $('#reactor').innerHTML = `<svg viewBox="0 0 600 510" role="presentation" style="position:absolute;inset:0;width:100%;height:100%"><defs><radialGradient id="fallback-glow"><stop stop-color="#b4f879" stop-opacity=".28"/><stop offset="1" stop-color="#b4f879" stop-opacity="0"/></radialGradient></defs><circle cx="300" cy="255" r="220" fill="url(#fallback-glow)"/><g fill="none" stroke="#b4f879"><circle cx="300" cy="255" r="185" stroke-opacity=".25"/><circle cx="300" cy="255" r="200" stroke-dasharray="1 8" stroke-opacity=".5"/><ellipse cx="300" cy="255" rx="170" ry="65" transform="rotate(-35 300 255)" stroke-width="8"/><ellipse cx="300" cy="255" rx="170" ry="65" transform="rotate(35 300 255)" stroke="#d4aa73" stroke-width="5"/><ellipse cx="300" cy="255" rx="170" ry="65" transform="rotate(90 300 255)" stroke="#e9ecdf" stroke-width="3"/><circle cx="300" cy="255" r="53" stroke-dasharray="4 5"/><circle cx="300" cy="255" r="29" fill="#b4f879" fill-opacity=".9"/></g></svg>`;
  $('.live-label').innerHTML = '<i class="status-dot"></i> STATIC SCHEMATIC';
  $('#reactor-instruction').textContent = 'CURIOSITY IS ALWAYS ONLINE';
  $('#reactor-mode').disabled = true;
}
// Import failure never prevents navigation, project dossiers, or the terminal.
import('./reactor.js').then(({ mountReactor }) => {
  reactor = mountReactor($('#reactor'), {onStatus(status) {
    if (status === 'fallback') {
      $('.live-label').innerHTML = '<i class="status-dot"></i> STATIC SCHEMATIC';
      $('#reactor-instruction').textContent = 'CURIOSITY IS ALWAYS ONLINE';
      $('#reactor-mode').disabled = true;
    }
  }});
  updateMotion();
  reactor.setMode(schematic ? 'schematic' : 'orbit');
}).catch(showReactorFallback);

const terminal = $('#terminal-dialog');
const terminalOutput = $('#terminal-output');
const terminalInput = $('#terminal-input');
const history = [];
let historyIndex = 0;
function terminalPrint(message, className = '') {
  const line = document.createElement('div');
  if (className) line.className = className;
  line.textContent = message;
  terminalOutput.append(line);
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}
function terminalResume() {
  const row = document.createElement('div');
  const link = document.createElement('a');
  link.className = 'text-link';
  link.href = profile.resume;
  link.download = 'Evan-Bartkowski-Resume.pdf';
  link.textContent = 'Download Evan’s résumé (PDF) ↓';
  row.append(link);
  terminalOutput.append(row);
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}
terminalPrint('VAULT_OS v1.0 // CONNECTION ESTABLISHED\nWelcome, wanderer. This is Evan’s personal corner of the web.\nType help to explore, or press Escape to return.');
function openTerminal() {
  if (!terminal.open) terminal.showModal();
  terminalInput.focus();
}
for (const button of $$('.terminal-launch')) button.addEventListener('click', openTerminal);
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (projectDialog.open) projectDialog.close();
    if ($('#certificate-dialog').open) $('#certificate-dialog').close();
    terminal.open ? terminal.close() : openTerminal();
  }
});
const terminalSections = { about: '#about', background: '#background', credentials: '#credentials', certificates: '#credentials', projects: '#work', work: '#work', skills: '#toolkit', toolkit: '#toolkit', contact: '#contact', home: '#home' };
function navigateTo(selector) {
  terminal.close();
  $(selector)?.scrollIntoView({behavior: motionPaused ? 'instant' : 'smooth'});
  historyReplace(selector);
}
function historyReplace(hash) {window.history.replaceState(null, '', hash);}
$('#terminal-form').addEventListener('submit', event => {
  event.preventDefault();
  const raw = terminalInput.value.trim();
  if (!raw) return;
  terminalInput.value = '';
  history.push(raw); historyIndex = history.length;
  terminalPrint(`visitor ~ $ ${raw}`, 'command-line');
  const command = raw.toLowerCase();
  if (terminalSections[command]) {navigateTo(terminalSections[command]); return;}
  switch (command) {
    case 'help': terminalPrint('NAVIGATION\n  about       Meet the human\n  background  Professional experience & education\n  credentials Inspect the document archive\n  projects    Explore selected work\n  toolkit     Browse the equipment inventory\n  contact     Open a frequency\n  home        Back to the surface\n\nEXTRAS\n  whoami      Your vault identity\n  email       Evan’s email address\n  resume      Download the résumé PDF\n  github      GitHub profile URL\n  linkedin    LinkedIn profile URL\n  secret      A small discovery\n  clear       Clear the screen\n  exit        Close the terminal'); break;
    case 'whoami': terminalPrint('A curious human. Exactly the kind of visitor this vault was built for.'); break;
    case 'email': terminalPrint(profile.email); break;
    case 'resume': case 'résumé': terminalResume(); break;
    case 'github': terminalPrint(profile.github); break;
    case 'linkedin': terminalPrint(profile.linkedin); break;
    case 'secret': terminalPrint('   ☢  PERK UNLOCKED: WILD CURIOSITY\n\nYou found the part built for people who press the interesting button.\nKeep that instinct. It makes good things happen.'); notify('PERK UNLOCKED: WILD CURIOSITY'); break;
    case 'war': terminalPrint('War never changes. Your browser tabs, however, are out of control.'); break;
    case 'clear': terminalOutput.replaceChildren(); break;
    case 'exit': case 'close': terminal.close(); break;
    default: terminalPrint(`Command not found: ${raw}\nTry help. Every good exploration starts somewhere.`);
  }
});
terminalInput.addEventListener('keydown', event => {
  if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  historyIndex = Math.max(0, Math.min(history.length, historyIndex + (event.key === 'ArrowUp' ? -1 : 1)));
  terminalInput.value = history[historyIndex] || '';
  terminalInput.setSelectionRange(terminalInput.value.length, terminalInput.value.length);
});

// Content stays readable if IntersectionObserver is unavailable.
if ('IntersectionObserver' in window) {
  document.body.classList.add('js-ready');
  const revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {entry.target.classList.add('visible'); revealObserver.unobserve(entry.target);}
  }, {threshold:.06});
  for (const item of $$('.reveal')) revealObserver.observe(item);
  const navObserver = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      for (const link of $$('.desktop-nav a')) {
        if (link.hash === (['background','credentials'].includes(entry.target.id) ? '#about' : `#${entry.target.id}`)) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
    }
  }, {rootMargin:'-10% 0px -55% 0px'});
  for (const section of $$('main>section[id]')) navObserver.observe(section);
}
let scrollScheduled = false;
function updateScroll() {
  const denominator = document.documentElement.scrollHeight - innerHeight;
  $('.scroll-progress').style.width = `${denominator > 0 ? scrollY / denominator * 100 : 0}%`;
  scrollScheduled = false;
}
window.addEventListener('scroll', () => {if (!scrollScheduled) {scrollScheduled = true; requestAnimationFrame(updateScroll);}}, {passive:true});
updateScroll();
