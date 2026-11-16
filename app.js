import { profile, projects, portfolioNotes } from './content.js';
import { mountCredentialArchive } from './credential-archive.js';
import { createVirtualShell, VIRTUAL_SHELL_COMMANDS } from './virtual-shell.js';
import { mountDysonFallback } from './dyson-fallback.js';
import { mountVisitorMap } from './visitor-map.js';
import { mountPortraitChat } from './portrait-chat.js';
import { mountTerminalVisuals } from './terminal-visuals.js';
import { mountTerminalArcade } from './terminal-game.js';
import { terminalHelp } from './terminal-help.js';
import { mountCyberChallenge } from './cyber-challenge.js';

import { createPageLifecycle } from './page-lifecycle.js';

export function mountPortfolioPage() {
const lifecycle = createPageLifecycle();
const {one: $, all: $$, on, own, timeout: later, request} = lifecycle;
const portraitChat = mountPortraitChat($('#portrait-conversation'), {
  launch: $('#portrait-launch'), portrait: $('#portrait'), beforeOpen: () => {closeMenu();closeOtherDialogs();},
});
lifecycle.cleanup(() => portraitChat?.dispose());
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
lifecycle.cleanup(mountCredentialArchive($('#credentials'), {signal: lifecycle.signal}));
lifecycle.cleanup(mountVisitorMap($('#visitor-map')));
for (const link of $$('.college-projects-link')) on(link, 'click', () => {
  const projectsDisclosure = $('#school-projects');
  if (projectsDisclosure) projectsDisclosure.open = true;
});

for (const link of $$('[data-profile]')) {
  const field = link.dataset.profile;
  if (profile[field]) link.href = field === 'email' ? `mailto:${profile.email}` : profile[field];
}
if ($('#year')) $('#year').textContent = new Date().getFullYear();

function openLinkedSkills(hash = location.hash) {
  if (hash === '#toolkit' || hash === '#toolkit-title') {
    const disclosure = $('.skills-disclosure');
    if (disclosure) disclosure.open = true;
  }
}
openLinkedSkills();
on(window, 'hashchange', () => openLinkedSkills());
for (const link of $$('a[href="#toolkit"], a[href="#toolkit-title"]')) on(link, 'click', () => openLinkedSkills(link.hash));

const projectGrid = $('#projects');
for (const project of projectGrid && !projectGrid.querySelector('.project-card') ? projects : []) {
  const article = document.createElement('article');
  article.className = 'project-card reveal';
  article.dataset.category = project.group;
  article.innerHTML = `
    <button class="project-art-button${project.imageType === 'screenshot' ? ' project-screenshot' : ''}" data-project="${project.id}" aria-label="Read the ${escapeHTML(project.title)} project dossier">
      <img src="${escapeHTML(project.artwork)}" alt="${escapeHTML(project.imageAlt || project.title)}" width="${project.imageWidth || 1000}" height="${project.imageHeight || 650}" loading="lazy" />
      <span class="project-art-meta" aria-hidden="true"><span>PROJECT ${project.number}</span>${project.wip ? '<span class="project-wip-pill">WORK IN PROGRESS</span>' : ''}</span><span class="project-open" aria-hidden="true">↗</span>
    </button>
    <div class="project-content"><div class="project-title-row"><h3><button data-project="${project.id}">${escapeHTML(project.title)}</button></h3><span class="project-category">${escapeHTML(project.category)}</span></div><p>${escapeHTML(project.description)}</p><div class="project-tags">${project.tags.map(tag => `<span>${escapeHTML(tag)}</span>`).join('')}</div></div>`;
  projectGrid.append(article);
}

const projectDialog = $('#project-dialog');
function openProject(id) {
  const project = projects.find(item => item.id === id);
  if (!project || !projectDialog || !$('#project-dialog-content')) return;
  $('#project-dialog-content').innerHTML = `
    <img class="project-dialog-art${project.imageType === 'screenshot' ? ' project-screenshot' : ''}" src="${escapeHTML(project.artwork)}" alt="${escapeHTML(project.imageAlt || project.title)}" width="${project.imageWidth || 1000}" height="${project.imageHeight || 650}" />
    <div class="project-dialog-body"><div class="eyebrow">${escapeHTML(project.category)}</div><h2 id="project-dialog-title">${escapeHTML(project.title)}</h2>${project.wip ? '<div class="project-wip-banner mono"><span class="wip-pulse"></span> WORK IN PROGRESS · ACTIVE DEVELOPMENT</div>' : ''}<p class="project-dialog-short">${escapeHTML(project.short)}</p><p class="project-dialog-description">${escapeHTML(project.description)}</p><div class="case-study-grid"><div><h3>THE CHALLENGE</h3><p>${escapeHTML(project.problem)}</p></div><div><h3>THE APPROACH</h3><p>${escapeHTML(project.approach)}</p></div></div><p class="project-dialog-description">${escapeHTML(project.detail)}</p><div class="project-tags">${project.tags.map(tag => `<span>${escapeHTML(tag)}</span>`).join('')}</div>${project.url ? `<a href="${escapeHTML(project.url)}" target="_blank" rel="noopener noreferrer" class="button button-primary">${escapeHTML(project.linkLabel)} <span aria-hidden="true">↗</span></a>` : `<p class="project-demo-note">${project.wip ? 'WORK IN PROGRESS · Currently in active prototype development.' : 'DEVELOPMENT PROJECT · Get in touch for a walkthrough.'}</p><a href="#contact" class="button button-secondary" data-close-project>Ask about this project <span aria-hidden="true">↗</span></a>`}</div>`;
  closeOtherDialogs(projectDialog);
  if (!projectDialog.open) projectDialog.showModal();
  on($('[data-close-project]', projectDialog), 'click', () => projectDialog.close());
}
on(projectGrid, 'click', event => {
  const button = event.target.closest('[data-project]');
  if (button) openProject(button.dataset.project);
});
for (const button of $$('[data-filter]')) {
  const count = button.dataset.filter === 'all' ? projects.length : projects.filter(project => project.group === button.dataset.filter).length;
  const badge = $('span', button);
  if (badge) badge.textContent = String(count).padStart(2, '0');
  on(button, 'click', () => {
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
    if ($('#filter-status')) $('#filter-status').textContent = `${count} projects shown.`;
  });
}

function closeOtherDialogs(keep) {
  for (const dialog of document.querySelectorAll('dialog[open]')) if (dialog !== keep) dialog.close();
}
function wireDialog(dialog) {
  on($('.dialog-close', dialog), 'click', () => dialog.close());
  on(dialog, 'click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
}
for (const dialog of $$('dialog')) wireDialog(dialog);

let toastTimer;
function notify(message) {
  clearTimeout(toastTimer);
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = later(() => toast.classList.remove('show'), 3200);
}
on($('#copy-email'), 'click', async () => {
  try {
    await navigator.clipboard.writeText(profile.email);
    notify('Email copied.');
  } catch {
    // Keep the real address usable when clipboard permissions are unavailable.
    const selection = getSelection();
    const range = document.createRange();
    const address = $('.email-link');
    if (address && selection) {range.selectNodeContents(address); selection.removeAllRanges(); selection.addRange(range);}
    notify('Email selected. Press Ctrl/Cmd + C to copy.');
  }
});

const menuToggle = $('.menu-toggle');
const mobileNav = $('#mobile-nav');
function closeMenu() {if (!mobileNav || !menuToggle) return; mobileNav.hidden = true; menuToggle.setAttribute('aria-expanded','false'); menuToggle.setAttribute('aria-label','Open navigation');}
on(menuToggle, 'click', () => {
  const expanded = menuToggle.getAttribute('aria-expanded') !== 'true';
  menuToggle.setAttribute('aria-expanded', String(expanded));
  menuToggle.setAttribute('aria-label', expanded ? 'Close navigation' : 'Open navigation');
  if (mobileNav) mobileNav.hidden = !expanded;
});
if (mobileNav) for (const link of $$('a', mobileNav)) on(link, 'click', closeMenu);
on(document, 'keydown', event => {if (event.key === 'Escape') closeMenu();});
on(matchMedia('(min-width:761px)'), 'change', event => {if (event.matches) closeMenu();});

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let reactor;
function updateMotion() {
  document.body.classList.toggle('motion-paused', reducedMotion.matches);
  reactor?.setPaused(reducedMotion.matches);
}
on(reducedMotion, 'change', updateMotion);
updateMotion();
function showReactorFallback() {
  if (lifecycle.active && $('#reactor')) mountDysonFallback($('#reactor'));
}
// Import failure never prevents navigation, project dossiers, or the terminal.
if ($('#reactor')) {
  mountDysonFallback($('#reactor'));
  import('./reactor.js').then(({ mountReactor }) => {
    if (!lifecycle.active) return;
    reactor = mountReactor($('#reactor'));
    updateMotion();
  }).catch(showReactorFallback);
}
import('./ambient.js').then(({ mountAmbient }) => {if (lifecycle.active) lifecycle.cleanup(mountAmbient({ reducedMotion }));}).catch(() => {});
if ($('#portrait')) import('./portrait.js').then(({ mountPortrait }) => {
  if (lifecycle.active) lifecycle.cleanup(mountPortrait($('#portrait')));
}).catch(() => {});
lifecycle.cleanup(() => reactor?.dispose());

// Conversations stay in memory for this visit. Only explicit sends contact the
// server. Responses are rendered as plain text, never interpreted as HTML.
const chatDialog = document.createElement('dialog');
chatDialog.id = 'chat-dialog';
chatDialog.className = 'chat-dialog';
chatDialog.setAttribute('aria-labelledby', 'chat-title');
chatDialog.setAttribute('aria-describedby', 'chat-disclosure');
chatDialog.innerHTML = `<div class="chat-head"><div><span class="eyebrow">PORTFOLIO / AI CONVERSATION</span><h2 id="chat-title">Ask my portfolio.</h2></div><button class="dialog-close" aria-label="Close portfolio chat">×</button></div>
  <p id="chat-disclosure" class="chat-disclosure">AI portfolio representative, writing in Evan's voice from his public work and background. This is not a live conversation with Evan.</p>
  <div class="chat-connection"><span id="chat-status" role="status">Checking availability…</span><button id="chat-reconnect" type="button">Check connection</button></div>
  <div id="chat-messages" class="chat-messages" role="log" aria-label="Portfolio conversation" aria-live="polite" aria-relevant="additions text"><p class="chat-intro">What would you like to know? Ask about my security work, projects, education, or approach to building things.</p></div>
  <div class="chat-suggestions" aria-label="Suggested questions"><button type="button">What do you do at CyberMaxx?</button><button type="button">Which project should I explore first?</button><button type="button">How do security and AI connect in your work?</button></div>
  <form id="chat-form"><label for="chat-input">Your question</label><div class="chat-composer"><textarea id="chat-input" rows="2" maxlength="2000" placeholder="Ask about my work…" required></textarea><button class="button button-primary" type="submit">Send <span aria-hidden="true">↗</span></button></div><p class="chat-form-note">Enter to send · Shift + Enter for a new line. <a href="mailto:${escapeHTML(profile.email)}">Contact Evan directly ↗</a></p></form>`;
own(chatDialog);
wireDialog(chatDialog);
const intelligenceVisual = document.createElement('div');
intelligenceVisual.className = 'chat-intelligence';
intelligenceVisual.setAttribute('aria-hidden', 'true');
const meshPaths = Array.from({length: 16}, (_, meridian) => {
  const angle = meridian / 16 * Math.PI;
  const points = Array.from({length: 97}, (_, step) => {
    const phase = step / 96 * Math.PI * 2;
    const x = Math.cos(phase) * Math.cos(angle) * 100;
    const z = Math.cos(phase) * Math.sin(angle) * 100;
    const y = Math.sin(phase) * 100;
    return `${step ? 'L' : 'M'}${(x + z * .24).toFixed(2)},${(y * .88 - z * .32).toFixed(2)}`;
  }).join(' ');
  return `<path d="${points}"/>`;
}).join('');
intelligenceVisual.innerHTML = `<svg viewBox="0 0 360 360" fill="none"><defs><radialGradient id="ai-aura"><stop stop-color="#a8f06a" stop-opacity=".18"/><stop offset="1" stop-color="#a8f06a" stop-opacity="0"/></radialGradient><radialGradient id="ai-core"><stop stop-color="#e3ffc6"/><stop offset=".25" stop-color="#a8f06a" stop-opacity=".45"/><stop offset="1" stop-color="#a8f06a" stop-opacity="0"/></radialGradient></defs><circle cx="180" cy="180" r="175" fill="url(#ai-aura)"/><g transform="translate(180 180)"><g class="ai-orbits">${meshPaths}<ellipse rx="132" ry="40" transform="rotate(-26)"/><ellipse rx="135" ry="45" transform="rotate(53)"/><circle r="119" stroke-dasharray="1 8"/></g><g class="ai-orbit-outer"><circle r="143" stroke-dasharray="28 13 3 13"/><path d="M-158 0h22m136 0h22M0-158v22m0 136v22"/></g><circle class="ai-core" r="52" fill="url(#ai-core)"/><g class="ai-wave">${Array.from({length: 23}, (_, index) => `<line x1="${(index - 11) * 4.2}" x2="${(index - 11) * 4.2}" y1="${-3 - Math.sin(index * .8) ** 2 * 15}" y2="${3 + Math.sin(index * .8) ** 2 * 15}" style="--wave-delay:${index * -71}ms"/>`).join('')}</g></g></svg>`;
chatDialog.prepend(intelligenceVisual);
chatDialog.dataset.aiState = 'idle';
let aiStateTimer;
function setChatVisualState(state, responseLength = 0) {
  clearTimeout(aiStateTimer);
  chatDialog.dataset.aiState = state;
  if (state === 'responding') aiStateTimer = later(() => {chatDialog.dataset.aiState = 'idle';}, Math.min(6000, Math.max(2400, responseLength * 3)));
}
const chatStatus = $('#chat-status');
const chatInput = $('#chat-input');
const chatMessages = $('#chat-messages');
const chatForm = $('#chat-form');
const chatSend = $('button[type="submit"]', chatForm);
const chatReconnect = $('#chat-reconnect');
const chatHistory = [];
let chatAvailable = false;
let chatBusy = false;
let statusRequest;
function updateChatControls() {
  chatSend.disabled = chatBusy || !chatAvailable;
  chatInput.disabled = chatBusy;
  for (const button of $$('.chat-suggestions button')) button.disabled = chatBusy || !chatAvailable;
  chatMessages.setAttribute('aria-busy', String(chatBusy));
}
async function checkChatAvailability() {
  if (statusRequest) return statusRequest;
  chatStatus.textContent = 'Checking availability…';
  chatReconnect.disabled = true;
  statusRequest = (async () => {
    const controller = new AbortController();
    const timeout = later(() => controller.abort(), 8000);
    try {
      const response = await request('/api/chat/status', {signal: controller.signal, headers: {'Accept': 'application/json'}});
      const status = response.ok ? await response.json() : null;
      chatAvailable = status?.available === true;
      chatStatus.textContent = chatAvailable ? 'AI portfolio conversation is ready.' : 'AI chat is currently unavailable. Explore my projects or contact me directly.';
    } catch {
      chatAvailable = false;
      chatStatus.textContent = 'Could not connect to portfolio chat. Please check the connection or contact me directly.';
    } finally {
      clearTimeout(timeout);
      chatReconnect.disabled = false;
      updateChatControls();
      statusRequest = undefined;
    }
    return chatAvailable;
  })();
  return statusRequest;
}
on(chatReconnect, 'click', () => checkChatAvailability());
async function openChat(question = '', sendImmediately = false) {
  if (portraitChat) return portraitChat.open(question, sendImmediately);
  closeMenu();
  closeOtherDialogs(chatDialog);
  if (!chatDialog.open) chatDialog.showModal();
  if (question && !chatBusy) chatInput.value = question;
  if (!chatBusy) chatInput.focus();
  await checkChatAvailability();
  if (sendImmediately && question && chatAvailable && !chatBusy) {
    chatInput.value = '';
    sendChat(question);
  }
}
for (const button of $$('.chat-launch')) on(button, 'click', () => openChat());
function appendChatMessage(role, message) {
  $('.chat-intro', chatMessages)?.remove();
  const entry = document.createElement('article');
  entry.className = `chat-message chat-message-${role}`;
  const label = document.createElement('span');
  label.className = 'chat-message-label';
  label.textContent = role === 'user' ? 'YOU' : 'EVAN BARTKOWSKI / AI REPRESENTATIVE';
  const text = document.createElement('p');
  text.textContent = message;
  entry.append(label, text);
  chatMessages.append(entry);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return entry;
}
function chatRequestMessages(question) {
  let messages = [{role: 'user', content: question.slice(0, 2000)}];
  let total = messages[0].content.length;
  // Retain complete recent turns within the server's count, text, and byte
  // limits. Long model replies remain visible without breaking later sends.
  for (let index = chatHistory.length - 2; index >= 0; index -= 2) {
    const pair = chatHistory.slice(index, index + 2).map(message => ({...message, content: message.content.slice(0, 2000)}));
    const pairLength = pair.reduce((sum, message) => sum + message.content.length, 0);
    if (messages.length + 2 > 11 || total + pairLength > 11000) break;
    const candidate = [...pair, ...messages];
    if (new TextEncoder().encode(JSON.stringify({messages: candidate})).byteLength > 23000) break;
    messages = candidate;
    total += pairLength;
  }
  return messages;
}
async function sendChat(question, existingEntry) {
  if (chatBusy || !question.trim()) return;
  if (!chatAvailable && !await checkChatAvailability()) return;
  const userEntry = existingEntry || appendChatMessage('user', question);
  $('.chat-error', userEntry)?.remove();
  userEntry.classList.remove('chat-message-failed');
  chatBusy = true;
  setChatVisualState('thinking');
  updateChatControls();
  chatStatus.textContent = 'Thinking about your question…';
  const pending = document.createElement('p');
  pending.className = 'chat-pending';
  pending.textContent = 'Preparing a response…';
  chatMessages.append(pending);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  const controller = new AbortController();
  const timeout = later(() => controller.abort(), 45000);
  try {
    const response = await request('/api/chat', {
      method: 'POST', headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
      body: JSON.stringify({messages: chatRequestMessages(question)}),
      signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.code === 'billing_required' && typeof result.error === 'string' ? result.error : 'Chat request failed');
      error.status = response.status;
      error.code = result.code;
      throw error;
    }
    if (typeof result.reply !== 'string' || !result.reply.trim()) throw new Error('Empty response');
    pending.remove();
    appendChatMessage('assistant', result.reply);
    setChatVisualState('responding', result.reply.length);
    chatHistory.push({role: 'user', content: question}, {role: 'assistant', content: result.reply});
    chatStatus.textContent = 'AI portfolio conversation is ready.';
  } catch (error) {
    setChatVisualState('idle');
    pending.remove();
    userEntry.classList.add('chat-message-failed');
    const notice = document.createElement('div');
    notice.className = 'chat-error';
    const description = document.createElement('p');
    description.textContent = error.code === 'billing_required' ? error.message : error.status === 503 ? 'AI chat is currently unavailable. Your question has not received a response.' : error.status === 429 ? 'The conversation is busy. Give it a moment, then retry your question.' : error.name === 'AbortError' ? 'The response took too long. You can retry this question.' : 'The response could not be loaded. You can retry this question.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Retry question ↗';
    on(retry, 'click', () => sendChat(question, userEntry));
    notice.append(description, retry);
    userEntry.append(notice);
    chatStatus.textContent = error.code === 'billing_required' ? error.message : 'No response received. Retry your question or contact Evan directly.';
    chatMessages.scrollTop = chatMessages.scrollHeight;
  } finally {
    clearTimeout(timeout);
    chatBusy = false;
    updateChatControls();
    if (chatDialog.open) chatInput.focus();
  }
}
on(chatForm, 'submit', event => {
  event.preventDefault();
  const question = chatInput.value.trim();
  if (!question || chatBusy || !chatAvailable) return;
  chatInput.value = '';
  sendChat(question);
});
on(chatInput, 'keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {event.preventDefault(); chatForm.requestSubmit();}
});
for (const suggestion of $$('.chat-suggestions button')) on(suggestion, 'click', () => sendChat(suggestion.textContent));
updateChatControls();

const terminal = $('#terminal-dialog');
const terminalOutput = $('#terminal-output');
const terminalInput = $('#terminal-input');
let gamePanel, terminalGame;
lifecycle.cleanup(() => terminalGame?.dispose());
lifecycle.cleanup(mountTerminalVisuals(terminal));
terminalInput.maxLength = 2048;
const virtualShell = createVirtualShell({profile, projects, historyProvider: () => history});
const history = [];
let historyIndex = 0;
let commandDraft = '';
function terminalPrint(message, className = '') {
  const line = document.createElement('div');
  if (className) line.className = className;
  line.textContent = message;
  terminalOutput.append(line);
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}
function submitTerminalCommand(command) {
  terminalInput.value = command;
  $('#terminal-form').requestSubmit();
  if (!['play', 'game', 'flappy', 'pong'].includes(command)) terminalInput.focus();
}
function exitTerminalGame() {
  terminalGame?.quit();
  terminalGame?.dispose();
  gamePanel?.remove();
  terminalGame = undefined;
  gamePanel = undefined;
  terminal.dataset.gameState = 'quit';
  terminalPrint('Arcade closed. Type flappy or pong for another game.');
  terminalInput.focus({preventScroll: true});
}
function showTerminalGame(mode = 'flappy', resume = false) {
  if (!gamePanel) {
    gamePanel = document.createElement('section');
    terminalOutput.append(gamePanel);
    terminalGame = mountTerminalArcade(gamePanel, {dialog: terminal, onExit: exitTerminalGame});
  }
  terminalOutput.append(gamePanel);
  terminalGame.open(mode, {resume});
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
  gamePanel.querySelector('[data-arcade-action="start"]').focus({preventScroll: true});
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
function terminalAction(label, action, href) {
  const row = document.createElement('div');
  const link = document.createElement(href ? 'a' : 'button');
  link.className = 'terminal-action';
  link.textContent = label;
  if (href) {
    link.href = href;
    if (href.startsWith('https:')) {link.target = '_blank'; link.rel = 'noopener noreferrer';}
    if (href === profile.resume) link.download = 'Evan-Bartkowski-Resume.pdf';
  } else {link.type = 'button'; on(link, 'click', action);}
  row.append(link);
  terminalOutput.append(row);
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}
function updateTerminalPrompt() {
  const path = virtualShell.cwd === '/home/visitor' ? '~' : virtualShell.cwd.startsWith('/home/visitor/') ? '~' + virtualShell.cwd.slice('/home/visitor'.length) : virtualShell.cwd;
  $('#terminal-form label').textContent = `visitor ${path} $`;
}
updateTerminalPrompt();
const editorDialog = document.createElement('dialog');
editorDialog.id = 'nano-dialog';
editorDialog.className = 'nano-dialog';
editorDialog.setAttribute('aria-labelledby', 'nano-title');
editorDialog.innerHTML = `<div class="nano-head"><div><span class="eyebrow">NANO / VISITOR WORKSPACE</span><h2 id="nano-title"></h2></div><button type="button" id="nano-cancel">Cancel</button></div><label for="nano-content" class="sr-only">Virtual file contents</label><textarea id="nano-content" spellcheck="false" maxlength="64000" aria-describedby="nano-status"></textarea><p id="nano-status" role="status"></p><div class="nano-unsaved" hidden><p>Save your changes before closing?</p><div><button type="button" id="nano-save-close">Save and close</button><button type="button" id="nano-discard">Discard changes</button><button type="button" id="nano-keep">Keep editing</button></div></div><div class="nano-foot"><span>Ctrl+O save · Ctrl+X close · Esc close</span><div><button type="button" id="nano-save">Save</button><button type="button" id="nano-done">Done</button></div></div>`;
own(editorDialog);
const editorText = $('#nano-content');
const editorStatus = $('#nano-status');
const editorUnsaved = $('.nano-unsaved');
let editorPath = '';
let editorSaved = '';
function openEditor(file) {
  editorPath = file.path;
  editorSaved = file.content;
  $('#nano-title').textContent = file.path;
  editorText.value = file.content;
  editorStatus.textContent = 'Virtual file · Changes save in this browser.';
  editorStatus.classList.remove('nano-error');
  editorUnsaved.hidden = true;
  closeOtherDialogs(editorDialog);
  editorDialog.showModal();
  editorText.focus();
}
function saveEditor() {
  try {
    const persisted = virtualShell.writeFile(editorPath, editorText.value);
    editorSaved = editorText.value;
    editorUnsaved.hidden = true;
    editorStatus.classList.remove('nano-error');
    editorStatus.textContent = persisted ? 'Saved in this browser.' : 'Saved for this visit. Browser storage is unavailable.';
    editorText.focus();
    return true;
  } catch (error) {
    editorStatus.classList.add('nano-error');
    editorStatus.textContent = error.message;
    return false;
  }
}
function requestEditorClose() {
  if (editorText.value !== editorSaved) {
    editorUnsaved.hidden = false;
    $('#nano-save-close').focus();
  } else editorDialog.close();
}
on($('#nano-save'), 'click', saveEditor);
on($('#nano-save-close'), 'click', () => {if (saveEditor()) editorDialog.close();});
on($('#nano-done'), 'click', requestEditorClose);
on($('#nano-cancel'), 'click', () => editorDialog.close());
on($('#nano-discard'), 'click', () => editorDialog.close());
on($('#nano-keep'), 'click', () => {editorUnsaved.hidden = true; editorText.focus();});
on(editorText, 'input', () => {
  editorStatus.classList.remove('nano-error');
  editorStatus.textContent = editorText.value === editorSaved ? 'No unsaved changes.' : 'Modified · not saved.';
});
on(editorDialog, 'cancel', event => {event.preventDefault(); requestEditorClose();});
on(editorDialog, 'keydown', event => {
  if (event.ctrlKey && event.key.toLowerCase() === 'o') {event.preventDefault(); saveEditor();}
  if (event.ctrlKey && event.key.toLowerCase() === 'x') {event.preventDefault(); requestEditorClose();}
});
on(editorDialog, 'close', () => {if (!$('dialog[open]')) openTerminal();});
const gameHint = document.createElement('div');
gameHint.className = 'terminal-game-hint terminal-start-menu';
gameHint.setAttribute('role', 'group');
gameHint.setAttribute('aria-label', 'Terminal games');
const gameMenuTitle = document.createElement('h3');
gameMenuTitle.textContent = 'Play a game';
gameHint.append(gameMenuTitle);
const gameIcons = {
  flappy: '<svg viewBox="0 0 80 44" aria-hidden="true" fill="none"><path d="M5 9h7v12H5m0 8h7v9H5M66 5h8v16h-8m0 8h8v12h-8"/><path d="m23 24 15-13 16 11-15 12-16-10Z"/><path d="m23 24 18-1-3-12M41 23l-2 11M21 19h-7m8 11H9"/><circle cx="46" cy="21" r="2"/></svg>',
  pong: '<svg viewBox="0 0 80 44" aria-hidden="true" fill="none"><path d="M8 5h64v34H8z"/><path d="M40 6v32" stroke-dasharray="3 4"/><path d="M17 13v17m46-19v17" stroke-width="3"/><circle cx="47" cy="26" r="3"/><path d="m45 24-8-7m-2-2-4-3"/></svg>',
};
for (const [command, name, controls] of [['flappy', 'Flappy Orbit', 'Space / click / tap'], ['pong', 'Pong', 'W/S / arrows / touch']]) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.terminalGame = command;
  button.setAttribute('aria-label', `Play ${name}`);
  button.innerHTML = `${gameIcons[command]}<code>${command}</code><strong>${name}</strong><small>${controls}</small><span class="terminal-game-play" aria-hidden="true">Play ↗</span>`;
  on(button, 'click', () => submitTerminalCommand(command));
  gameHint.append(button);
}
function showTerminalStartMenu(introduction = false) {
  if (introduction) terminalPrint('EVAN BARTKOWSKI / PUBLIC PORTFOLIO\nBrowse my work, read my background, or ask a question.\nYour files live in this browser workspace.\nType help for commands.');
  terminalOutput.append(gameHint);
  if (introduction) terminalPrint('Tab completes · ↑ ↓ history · Ctrl+L clears.', 'terminal-shortcuts');
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}
showTerminalStartMenu(true);
function openTerminal() {
  closeMenu();
  closeTerminalMenus();
  closeOtherDialogs(terminal);
  if (!terminal.open) terminal.showModal();
  if (!terminalOutput.childElementCount) showTerminalStartMenu(true);
  terminalInput.focus();
}
for (const button of $$('.terminal-launch, .terminal-shell-launch')) on(button, 'click', openTerminal);
const terminalMenus = $$('.terminal-tools-menu');
function closeTerminalMenus() {for (const menu of terminalMenus) menu.open = false;}
for (const menu of terminalMenus) {
  on(document, 'pointerdown', event => {if (!menu.contains(event.target)) menu.open = false;});
  on(menu, 'keydown', event => {
    if (event.key === 'Escape' && menu.open) {event.preventDefault();menu.open = false;menu.querySelector('summary').focus();}
  });
}
const cyberChallenge = $$('.cyber-challenge-launch').length ? mountCyberChallenge({beforeOpen: dialog => {
  closeMenu();closeTerminalMenus();closeOtherDialogs(dialog);
}}) : null;
lifecycle.cleanup(() => cyberChallenge?.dispose());
for (const button of $$('.cyber-challenge-launch')) on(button, 'click', () => cyberChallenge?.open());
on(document, 'keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (editorDialog.open) {requestEditorClose(); return;}
    terminal.open ? terminal.close() : openTerminal();
  }
});
const terminalSections = { about: '#about', background: '#background', experience: '#background', education: '#background', certs: '#credentials', credentials: '#credentials', certificates: '#credentials', projects: '#work', work: '#work', skills: '#toolkit', toolkit: '#toolkit', contact: '#contact', home: '#home', blog: '/blog.html' };
const sectionPages = {'#about': '/about.html', '#background': '/experience.html', '#credentials': '/credentials.html', '#work': '/projects.html', '#toolkit': '/experience.html#toolkit', '#home': '/'};
function navigateTo(selector) {
  openLinkedSkills(selector);
  const target = selector.startsWith('#') ? $(selector) : null;
  if (!target) {
    const destination = sectionPages[selector] || selector;
    if (destination.startsWith('/')) {terminal.close(); const navigation = new CustomEvent('portfolio:navigate', {detail: {url: destination}, cancelable: true}); if (window.dispatchEvent(navigation)) window.location.assign(destination);}
    else terminalPrint('This section is not available on this page.');
    return;
  }
  // Content in a collapsed details element must become visible before scrolling.
  for (let parent = target.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
  terminal.close();
  target.scrollIntoView({behavior: reducedMotion.matches ? 'instant' : 'smooth'});
  historyReplace(selector);
}
function historyReplace(hash) {window.history.replaceState(null, '', hash);}
const normalizeTopic = value => value.toLowerCase().replace(/^\.\//, '').replace(/^\//, '').replace(/\/$/, '').replace(/\.(md|txt)$/, '');
function pageText(selector) {
  return $$(selector).map(item => item.innerText.trim()).join('\n\n').replace(/\n{3,}/g, '\n\n');
}
function findProject(value) {
  const normalized = value.toLowerCase().replace(/[\s_-]/g, '');
  return projects.find(project => [project.id, project.title, project.title.split(' ')[0]].some(alias => alias.toLowerCase().replace(/[\s_-]/g, '') === normalized));
}
function listProjects() {
  terminalPrint('SELECTED PROJECTS\nOpen a dossier below, or type open <project-id>.');
  for (const project of projects) terminalAction(`${project.id.padEnd(10)} ${project.title} · ${project.category} ↗`, () => openProject(project.id));
}
function readTopic(rawTopic) {
  const topic = normalizeTopic(rawTopic);
  const project = findProject(topic);
  if (project) {
    terminalPrint(`${project.title}\n${project.description}\n\n${project.approach}\n${project.detail}\n\n${project.tags.join(' / ')}`);
    terminalAction('Read the project dossier ↗', () => openProject(project.id));
    if (project.url) terminalAction(project.linkLabel + ' ↗', null, project.url);
    return;
  }
  switch (topic) {
    case 'about': case 'profile': terminalPrint(pageText('#about .about-copy > p') || portfolioNotes.about || `${profile.name}\n${profile.role}\n${profile.location}`); break;
    case 'experience': case 'background': terminalPrint(pageText('#background .professional-record, #background .experience-timeline') || portfolioNotes.experience); break;
    case 'education': terminalPrint(profile.education.map(item => [item.school, item.degree, item.expected ? 'In progress · Expected ' + item.expected : 'Completed ' + item.to, item.focus ? item.focus + ' track' : '', item.summary || '', item.coursework ? 'Coursework: ' + item.coursework.join(' · ') : '', item.projects ? 'College projects:\n' + item.projects.map(project => '• ' + project).join('\n') : '', item.honors ? 'Academic recognition: ' + item.honors.join(' · ') : '', item.professionalApplication ? 'Professional application: ' + item.professionalApplication.join(' · ') : ''].filter(Boolean).join('\n')).join('\n\n')); break;
    case 'certs': case 'credentials': case 'certificates': terminalPrint(pageText('#background .credential-list') || portfolioNotes.certs); terminalAction('View original credential documents ↗', () => navigateTo('#credentials')); break;
    case 'projects': case 'work': listProjects(); break;
    case 'skills': case 'toolkit': terminalPrint(pageText('#toolkit .toolkit-item') || pageText('#toolkit') || portfolioNotes.skills); break;
    case 'contact': terminalAction(profile.email, null, `mailto:${profile.email}`); terminalAction('GitHub ↗', null, profile.github); terminalAction('LinkedIn ↗', null, profile.linkedin); break;
    case 'github': terminalAction('Open GitHub profile ↗', null, profile.github); break;
    case 'linkedin': terminalAction('Open LinkedIn profile ↗', null, profile.linkedin); break;
    case 'resume': terminalResume(); break;
    case 'blog': terminalAction('Browse Evan’s writing ↗', null, '/blog.html'); break;
    default: terminalPrint(`No portfolio entry named "${rawTopic}". Try ls or cat about.`);
  }
}
const commandNames = ['play', 'games', 'flappy', 'pong', 'game', 'quit', 'help', 'ls', 'cat', 'cd', 'open', 'ask', 'chat', 'about', 'background', 'experience', 'education', 'certs', 'credentials', 'projects', 'toolkit', 'contact', 'home', 'blog', 'whoami', 'email', 'resume', 'github', 'linkedin', 'pwd', 'clear', 'exit'];
const shellCommands = VIRTUAL_SHELL_COMMANDS;
on($('#terminal-form'), 'submit', event => {
  event.preventDefault();
  const raw = terminalInput.value.trim();
  if (!raw) return;
  terminalInput.value = '';
  if (history.at(-1) !== raw) history.push(raw);
  historyIndex = history.length; commandDraft = '';
  terminalPrint(`${$('#terminal-form label').textContent} ${raw}`, 'command-line');
  const [verb, ...args] = raw.split(/\s+/);
  const command = verb.toLowerCase();
  const argument = args.join(' ');
  if (command === 'games' || command === 'play' && !argument) {terminalGame?.pause(); showTerminalStartMenu(); gameHint.querySelector('button').focus({preventScroll:true}); return;}
  if (['play', 'game', 'flappy', 'pong'].includes(command)) {showTerminalGame(command === 'pong' ? 'pong' : argument === 'pong' ? 'pong' : 'flappy', command === 'game' && Boolean(terminalGame)); return;}
  if (command === 'quit') {exitTerminalGame(); return;}
  terminalGame?.pause();
  if (terminalSections[command] && !argument) {navigateTo(terminalSections[command]); return;}
  const bareTopic = /^[a-z0-9_-]+(?:\.(?:md|txt))?$/i.test(argument);
  const publicTopic = bareTopic && (Object.hasOwn(terminalSections, normalizeTopic(argument)) || ['profile', 'resume', 'github', 'linkedin'].includes(normalizeTopic(argument)) || findProject(normalizeTopic(argument)));
  const portfolioCommand = (command === 'ls' && argument === 'projects') || (command === 'cat' && publicTopic && !virtualShell.exists(argument)) || (command === 'cd' && bareTopic && Object.hasOwn(terminalSections, normalizeTopic(argument)));
  if (shellCommands.includes(command.replace(/^\/(?:usr\/)?bin\//, '')) && !portfolioCommand) {
    const result = virtualShell.execute(raw);
    if (result.handled) {
      if (result.output) terminalPrint(result.output);
      if (result.editor) openEditor(result.editor);
      updateTerminalPrompt();
      return;
    }
  }
  switch (command) {
    case 'help': terminalPrint(terminalHelp(argument)); break;
    case 'ls':
      if (argument && normalizeTopic(argument) === 'projects') listProjects();
      else if (argument && !['', '.'].includes(normalizeTopic(argument))) readTopic(argument);
      else {
        terminalPrint('PUBLIC ENTRIES · click to read, or use cat <entry>');
        for (const topic of ['about', 'experience', 'education', 'certs', 'projects', 'skills', 'contact', 'resume', 'blog']) terminalAction(`${topic} ↗`, () => {terminalPrint(`visitor ~ $ cat ${topic}`, 'command-line'); readTopic(topic); terminalInput.focus();});
      }
      break;
    case 'cat': argument ? readTopic(argument) : terminalPrint('Usage: cat <entry>\nTry cat about, cat education, or cat starlight.'); break;
    case 'cd': {
      const topic = normalizeTopic(argument || 'home');
      terminalSections[topic] ? navigateTo(terminalSections[topic]) : terminalPrint(`No section named "${argument}". Try cd about, cd projects, or cd contact.`);
      break;
    }
    case 'open': {
      const topic = normalizeTopic(argument);
      const project = findProject(topic);
      if (project) openProject(project.id);
      else if (['resume', 'github', 'linkedin', 'email'].includes(topic)) readTopic(topic === 'email' ? 'contact' : topic);
      else if (terminalSections[topic]) navigateTo(terminalSections[topic]);
      else terminalPrint('Usage: open <project-id>\nProject IDs: ' + projects.map(project => project.id).join(', '));
      break;
    }
    case 'ask': if (argument) openChat(argument, true); else terminalPrint('Usage: ask <question>\nFor example: ask How do you approach cybersecurity work?'); break;
    case 'chat': openChat(argument); break;
    case 'whoami': terminalPrint(`${profile.name}\n${profile.role} at ${profile.company}\n${profile.location}\n\nThis terminal gives you access to my public portfolio.`); break;
    case 'pwd': terminalPrint('evan://portfolio/' + (location.hash.slice(1) || 'home')); break;
    case 'email': terminalAction(profile.email, null, `mailto:${profile.email}`); break;
    case 'resume': case 'résumé': terminalResume(); break;
    case 'github': terminalAction('Open GitHub profile ↗', null, profile.github); break;
    case 'linkedin': terminalAction('Open LinkedIn profile ↗', null, profile.linkedin); break;
    case 'clear': terminalGame?.pause(); terminalOutput.replaceChildren(); break;
    case 'exit': case 'close': terminal.close(); break;
    default: terminalPrint(`Command not found: ${verb}\nType help for available commands.`);
  }
});
on(terminalInput, 'keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
    event.preventDefault(); terminalGame?.pause(); terminalOutput.replaceChildren(); return;
  }
  if (event.key === 'Tab' && !event.shiftKey && terminalInput.value.trim()) {
    const parts = terminalInput.value.split(/\s+/);
    const rawPrefix = parts.at(-1);
    const prefix = rawPrefix.toLowerCase();
    const candidates = parts.length === 1 ? [...commandNames, ...shellCommands] : ['open', 'cat', 'ls', 'cd'].includes(parts[0].toLowerCase()) ? [...Object.keys(terminalSections), ...projects.map(project => project.id), 'resume', ...virtualShell.complete(rawPrefix)] : shellCommands.includes(parts[0].toLowerCase()) ? virtualShell.complete(rawPrefix) : [];
    const matches = [...new Set(candidates)].filter(candidate => candidate.toLowerCase().startsWith(prefix));
    if (matches.length) {
      event.preventDefault();
      if (matches.length === 1) {parts[parts.length - 1] = matches[0]; terminalInput.value = parts.join(' ');}
      else terminalPrint(matches.join('  '));
    }
    return;
  }
  if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  if (historyIndex === history.length) commandDraft = terminalInput.value;
  historyIndex = Math.max(0, Math.min(history.length, historyIndex + (event.key === 'ArrowUp' ? -1 : 1)));
  terminalInput.value = historyIndex === history.length ? commandDraft : history[historyIndex];
  terminalInput.setSelectionRange(terminalInput.value.length, terminalInput.value.length);
});

// A tab identifies the current document, independent of scrolling within it.
const normalizedPage = pathname => pathname.replace(/\/index\.html$/, '/').replace(/\/$/, '') || '/';
const currentPage = normalizedPage(location.pathname);
for (const link of $$('.desktop-nav a, #mobile-nav a, .blog-tab')) {
  if (link.origin === location.origin && normalizedPage(link.pathname) === currentPage) link.setAttribute('aria-current', 'page');
  else link.removeAttribute('aria-current');
}

// Content stays readable if IntersectionObserver is unavailable.
if ('IntersectionObserver' in window) {
  document.body.classList.add('js-ready');
  const revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {entry.target.classList.add('visible'); revealObserver.unobserve(entry.target);}
  }, {threshold:.06});
  for (const item of $$('.reveal')) revealObserver.observe(item);
  lifecycle.cleanup(() => revealObserver.disconnect());
}
let scrollScheduled = false;
function updateScroll() {
  const denominator = document.documentElement.scrollHeight - innerHeight;
  const progress = $('.scroll-progress');
  if (progress) progress.style.width = `${denominator > 0 ? scrollY / denominator * 100 : 0}%`;
  scrollScheduled = false;
}
on(window, 'scroll', () => {if (!scrollScheduled) {scrollScheduled = true; requestAnimationFrame(() => {if (lifecycle.active) updateScroll();});}}, {passive:true});
updateScroll();

return {dispose: () => lifecycle.dispose()};
}
