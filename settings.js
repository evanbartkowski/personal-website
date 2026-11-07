import {createMusicPlayer} from './music-player.js';
const STORAGE_KEY = 'evan-portfolio-settings-v1';
const SESSION_PLAYED_KEY = 'evan-portfolio-music-active-v1';
const TRACKS = [
  {file: 'leberch-celestial-590364.mp3', title: 'Celestial', artist: 'Leberch'},
  {file: 'leberch-space-587944.mp3', title: 'Space', artist: 'Leberch'},
  {file: 'solarflex-space-541545.mp3', title: 'Space', artist: 'Solarflex'},
  {file: 'universfield-ambient-space-background-30s-342767.mp3', title: 'Ambient Space · 30s', artist: 'Universfield'},
  {file: 'universfield-ambient-space-background-350710.mp3', title: 'Ambient Space', artist: 'Universfield'},
];
const PALETTES = [
  {id: 'default', name: 'Forest', text: '#2cd00b', accent: '#2cd00b'},
  {id: 'mint', name: 'Mint', text: '#a6c8b8', accent: '#76b49a'},
  {id: 'amber', name: 'Amber', text: '#d18b29', accent: '#d18b29'},
  {id: 'silver', name: 'Silver', text: '#b8c4cd', accent: '#849bab'},
  {id: 'lavender', name: 'Lavender', text: '#af4dff', accent: '#af4dff'},
];
const DEFAULT_PALETTE = PALETTES.find(palette => palette.id === 'silver');
const validColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const defaults = () => ({version: 1, palette: DEFAULT_PALETTE.id, color: DEFAULT_PALETTE.text, musicEnabled: true, volume: .1, muted: false, track: TRACKS[0].file, positions: {}});
function normalizePreferences(value) {
  const result = defaults();
  if (!value || value.version !== 1) return result;
  if (PALETTES.some(palette => palette.id === value.palette) || value.palette === 'custom') result.palette = value.palette;
  if (validColor(value.color)) result.color = value.color.toLowerCase();
  const preset = PALETTES.find(palette => palette.id === result.palette);
  if (preset) result.color = preset.text;
  if (typeof value.musicEnabled === 'boolean') result.musicEnabled = value.musicEnabled;
  if (typeof value.muted === 'boolean') result.muted = value.muted;
  if (typeof value.volume === 'number' && Number.isFinite(value.volume)) result.volume = Math.max(0, Math.min(1, value.volume));
  if (TRACKS.some(track => track.file === value.track)) result.track = value.track;
  for (const track of TRACKS) {
    const position = value.positions?.[track.file];
    if (typeof position === 'number' && Number.isFinite(position) && position >= 0 && position < 86400) result.positions[track.file] = position;
  }
  return result;
}
function mix(color, target, amount) {
  const parts = [1, 3, 5].map(index => Math.round(parseInt(color.slice(index, index + 2), 16) * (1 - amount) + target * amount));
  return '#' + parts.map(value => value.toString(16).padStart(2, '0')).join('');
}

let instance;
export function mountSettings() {
  if (instance) return instance;
  if (!document.querySelector('.site-header, .blog-header')) return null;
  const listeners = [];
  const listen = (target, event, handler, options) => {target.addEventListener(event, handler, options); listeners.push(() => target.removeEventListener(event, handler, options));};
  let storage;
  let preferences = defaults();
  let storageFailed = false;
  try {
    storage = localStorage;
    const saved = storage.getItem(STORAGE_KEY);
    if (saved && saved.length <= 16000) preferences = normalizePreferences(JSON.parse(saved));
  } catch {storageFailed = true;}

  const launch = document.createElement('button');
  launch.type = 'button';
  launch.className = 'settings-launch';
  launch.setAttribute('aria-label', 'Open site settings');
  launch.setAttribute('aria-haspopup', 'dialog');
  launch.setAttribute('aria-controls', 'site-settings');
  launch.title = 'Site settings';
  launch.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><path d="m10 2-.7 2.8-2.1 1.3-2.7-.8-2 3.4 2 2v2.6l-2 2 2 3.4 2.7-.8 2.1 1.3L10 22h4l.7-2.8 2.1-1.3 2.7.8 2-3.4-2-2v-2.6l2-2-2-3.4-2.7.8-2.1-1.3L14 2Z"/><circle cx="12" cy="12" r="3.5"/><path d="M12 6v1m0 10v1m-6-6h1m10 0h1"/></svg>';
  const headerMute = document.createElement('button');
  headerMute.type = 'button';
  headerMute.id = 'header-mute';
  headerMute.className = 'header-mute';
  headerMute.setAttribute('data-music-control', '');
  function attachHeader() {
    const header = document.querySelector('.site-header, .blog-header');
    if (!header) return;
    const actions = header.querySelector('.header-actions');
    (actions || header).append(headerMute, launch);
    header.classList.add('has-site-settings');
    applyPalette();
  }

  const dialog = document.createElement('dialog');
  dialog.id = 'site-settings';
  dialog.className = 'settings-dialog';
  dialog.setAttribute('aria-labelledby', 'settings-title');
  dialog.innerHTML = `<div class="settings-head"><div><h2 id="settings-title">Site settings</h2></div><button type="button" class="settings-close" aria-label="Close site settings">×</button></div>
    <div class="settings-content"><section class="settings-section"><fieldset class="settings-palette"><legend>Site color</legend><p>Choose a tone for text, lines, controls, and interface details.</p><div class="settings-presets">${PALETTES.map(palette => `<label class="settings-preset"><input type="radio" name="settings-palette" value="${palette.id}"/><span class="settings-swatch" style="--swatch:${palette.text}" aria-hidden="true"></span><span>${palette.name}</span></label>`).join('')}</div></fieldset><div class="settings-custom"><label for="settings-custom-color">Custom color</label><input id="settings-custom-color" type="color" value="${DEFAULT_PALETTE.text}" aria-label="Choose a custom text color"/><label for="settings-color-hex" class="settings-visually-hidden">Custom text color hex code</label><input id="settings-color-hex" type="text" value="${DEFAULT_PALETTE.text}" maxlength="7" spellcheck="false" autocomplete="off" pattern="#[0-9A-Fa-f]{6}" aria-describedby="settings-color-note"/><button type="button" id="settings-reset-color">Reset colors</button></div><p id="settings-color-note" class="settings-note" role="status"></p></section>
    <section class="settings-section settings-music"><h3>Background music</h3><p id="settings-music-status" class="settings-music-status" role="status">Ready · starts after a click or keypress.</p><label class="settings-track-label" for="settings-track">Track</label><select id="settings-track" data-music-control>${TRACKS.map(track => `<option value="${track.file}">${track.title} — ${track.artist}</option>`).join('')}</select><div class="settings-music-controls"><button type="button" id="settings-play" data-music-control>Play</button><button type="button" id="settings-mute" data-music-control aria-pressed="false">Mute</button></div><div class="settings-volume"><label for="settings-volume">Volume</label><input id="settings-volume" data-music-control type="range" min="0" max="100" step="1" value="10"/><output for="settings-volume" id="settings-volume-label">10%</output></div><p class="settings-note">Quiet by default. Songs fade smoothly into the next track.</p></section><p class="settings-storage-status" id="settings-storage-status" role="status"></p></div>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  const status = $('#settings-music-status');
  const playButton = $('#settings-play');
  const muteButton = $('#settings-mute');
  const volumeInput = $('#settings-volume');
  const colorInput = $('#settings-custom-color');
  const colorHex = $('#settings-color-hex');
  const trackInput = $('#settings-track');
  const paletteProperties = ['--green', '--cream', '--muted', '--line', '--text-color', '--text-accent', '--text-muted', '--ui-ink', '--ui-muted', '--ui-accent'];
  const originalProperties = [document.documentElement, document.body].map(element => ({element, values: paletteProperties.map(name => ({name, value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name)}))}));
  let musicState = preferences.musicEnabled ? 'ready' : 'paused';
  let playRequested = false;
  let lastPositionSave = 0;
  let gesturesArmed = false;
  let player;
  function markPlayed(active) {try {if (active) sessionStorage.setItem(SESSION_PLAYED_KEY, '1'); else sessionStorage.removeItem(SESSION_PLAYED_KEY);} catch { /* Music remains usable when session storage is blocked. */ }}
  function snapshotPosition() {player?.snapshot();}
  function storageStatus() {
    $('#settings-storage-status').textContent = storageFailed ? 'Preferences apply for this page. Browser storage is unavailable.' : '';
  }
  function persist() {
    try {
      if (!storage) throw Error('Storage unavailable');
      storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
      storageFailed = false;
    } catch {storageFailed = true;}
    storageStatus();
  }
  function emitChange() {
    document.dispatchEvent(new CustomEvent('portfolio:settingschange', {detail: {palette: preferences.palette, color: preferences.color, musicEnabled: preferences.musicEnabled, volume: preferences.volume, muted: preferences.muted, track: preferences.track}}));
  }
  function readableColor(color, minimum = 7) {
    let result = color;
    for (let attempt = 0; attempt < 30; attempt++) {
      const channels = [1, 3, 5].map(index => parseInt(result.slice(index, index + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      if ((.2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2] + .05) / .05 >= minimum) return result;
      result = mix(result, 255, .08);
    }
    return result;
  }
  function applyPalette() {
    for (const entry of originalProperties) for (const property of entry.values) {
      if (property.value) entry.element.style.setProperty(property.name, property.value, property.priority);
      else entry.element.style.removeProperty(property.name);
    }
    {
      const preset = PALETTES.find(palette => palette.id === preferences.palette);
      const text = preset?.text || preferences.color;
      const accent = preset?.accent || mix(text, 0, .12);
      const muted = mix(text, 0, .17);
      document.documentElement.dataset.textTheme = preferences.palette;
      for (const {element} of originalProperties) for (const [name, value] of Object.entries({'--green': accent, '--cream': text, '--muted': muted, '--line': mix(accent, 0, .68), '--text-color': text, '--text-accent': accent, '--text-muted': muted})) element.style.setProperty(name, value);
    }
    const selected = PALETTES.find(palette => palette.id === preferences.palette);
    const value = selected?.text || preferences.color;
    // Recovery controls remain readable even when a custom page color is black.
    const uiInk = readableColor(value);
    const uiAccent = readableColor(selected?.accent || mix(value, 0, .12), 4.5);
    for (const {element} of originalProperties) {
      element.style.setProperty('--ui-ink', uiInk);
      element.style.setProperty('--ui-muted', readableColor(mix(uiInk, 0, .18), 5));
      element.style.setProperty('--ui-accent', uiAccent);
    }
    colorInput.value = value;
    colorHex.value = value;
    colorHex.removeAttribute('aria-invalid');
    for (const radio of dialog.querySelectorAll('input[name="settings-palette"]')) radio.checked = radio.value === preferences.palette;
    const parts = [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16) / 255).map(part => part <= .04045 ? part / 12.92 : ((part + .055) / 1.055) ** 2.4);
    const contrast = (.2126 * parts[0] + .7152 * parts[1] + .0722 * parts[2] + .05) / .05;
    $('#settings-color-note').textContent = contrast < 4.5 ? 'This is a dark tone. A lighter color will be easier to read on the black background.' : '';
    emitChange();
  }
  function renderMusic() {
    const active = preferences.musicEnabled && (playRequested || ['starting','playing','buffering','crossfading'].includes(player?.state));
    playButton.textContent = active ? 'Pause' : 'Play';
    playButton.setAttribute('aria-label', active ? 'Pause background music' : 'Play background music');
    muteButton.textContent = preferences.muted ? 'Unmute' : 'Mute';
    muteButton.setAttribute('aria-pressed', String(preferences.muted));
    muteButton.setAttribute('aria-label', preferences.muted ? 'Unmute background music' : 'Mute background music');
    const muteLabel = preferences.muted ? 'Unmute background music' : 'Mute background music';
    headerMute.setAttribute('aria-label', muteLabel);
    headerMute.setAttribute('aria-pressed', String(preferences.muted));
    headerMute.title = muteLabel;
    headerMute.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><path d="M4 9h4l5-4v14l-5-4H4z"/>${preferences.muted ? '<path d="m17 9 5 6m0-6-5 6"/>' : '<path d="M17 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>'}</svg>`;
    volumeInput.value = String(Math.round(preferences.volume * 100));
    volumeInput.setAttribute('aria-valuetext', `${volumeInput.value}% volume`);
    $('#settings-volume-label').textContent = volumeInput.value + '%';
    trackInput.value = player?.requestedTrack || preferences.track;
    const current = TRACKS.find(track => track.file === preferences.track);
    status.textContent = musicState === 'playing' ? `Playing · ${current.title} · ${preferences.muted ? 'muted' : volumeInput.value + '% volume'}` : musicState === 'crossfading' ? `Blending into · ${current.title}` : musicState === 'buffering' ? 'Preparing the next track…' : musicState === 'starting' ? 'Starting music…' : musicState === 'blocked' ? 'Music is ready. Click or press a key to resume.' : musicState === 'error' ? 'This track could not be loaded. Choose another track or try Play again.' : musicState === 'paused' ? 'Paused' : 'Ready · starts after a click or keypress.';
    if (player?.notice) status.textContent += ` ${player.notice}`;
  }
  function disarmGestures() {
    if (!gesturesArmed) return;
    document.removeEventListener('pointerdown', onFirstGesture, true);
    document.removeEventListener('keydown', onFirstGesture, true);
    gesturesArmed = false;
  }
  async function playMusic() {
    preferences.musicEnabled = true;
    disarmGestures(); playRequested = true; musicState = 'starting'; persist(); renderMusic();
    await player.play(); playRequested = false; musicState = player.state; renderMusic();
  }
  function pauseMusic() {
    preferences.musicEnabled = false; markPlayed(false); playRequested = false; disarmGestures();
    snapshotPosition(); player.pause(); musicState = 'paused'; persist(); renderMusic();
  }
  function onFirstGesture(event) {
    if (!event.isTrusted || !preferences.musicEnabled || event.type === 'keydown' && ['Control', 'Meta', 'Alt', 'Shift', 'Escape'].includes(event.key)) return;
    if (event.target instanceof Element && event.target.closest('[data-music-control]')) return;
    playMusic();
  }
  function armGestures() {
    if (gesturesArmed || !preferences.musicEnabled) return;
    document.addEventListener('pointerdown', onFirstGesture, true);
    document.addEventListener('keydown', onFirstGesture, true);
    gesturesArmed = true;
  }
  function open() {if (!dialog.open) dialog.showModal();}
  listen(launch, 'click', open);
  listen($('.settings-close'), 'click', () => dialog.close());
  listen(dialog, 'close', () => {if (launch.isConnected && !document.querySelector('dialog[open]')) launch.focus();});
  listen(dialog, 'click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  for (const radio of dialog.querySelectorAll('input[name="settings-palette"]')) listen(radio, 'change', () => {
    if (!radio.checked) return;
    preferences.palette = radio.value;
    preferences.color = PALETTES.find(palette => palette.id === radio.value).text;
    applyPalette(); persist();
  });
  function customColor(value) {
    if (!validColor(value)) {colorHex.setAttribute('aria-invalid', 'true'); $('#settings-color-note').textContent = 'Enter a six-digit hex color, like #b8c4cd.'; return;}
    preferences.palette = 'custom'; preferences.color = value.toLowerCase(); applyPalette(); persist();
  }
  listen(colorInput, 'input', () => customColor(colorInput.value));
  listen(colorHex, 'change', () => customColor(colorHex.value.trim()));
  listen($('#settings-reset-color'), 'click', () => {preferences.palette = DEFAULT_PALETTE.id; preferences.color = DEFAULT_PALETTE.text; applyPalette(); persist();});
  listen(playButton, 'click', () => {if (preferences.musicEnabled && (playRequested || ['starting','playing','buffering','crossfading'].includes(player.state))) pauseMusic(); else playMusic();});
  function toggleMute() {preferences.muted = !preferences.muted; player.setMuted(preferences.muted); persist(); renderMusic();}
  listen(muteButton, 'click', toggleMute);
  listen(headerMute, 'click', toggleMute);
  listen(volumeInput, 'input', () => {preferences.volume = Math.max(0, Math.min(1, Number(volumeInput.value) / 100)); player.setVolume(preferences.volume); persist(); renderMusic();});
  listen(trackInput, 'change', () => {
    const file = trackInput.value;
    if (!TRACKS.some(track => track.file === file)) return;
    snapshotPosition(); player.select(file, {position: preferences.positions[file] || 0});
  });
  listen(document, 'visibilitychange', () => {if (document.hidden) {snapshotPosition(); persist();}});
  listen(window, 'pagehide', () => {snapshotPosition(); persist(); playRequested = false; player.pause({immediate:true});});
  listen(window, 'pageshow', event => {if (event.persisted) {musicState = preferences.musicEnabled ? 'ready' : 'paused'; renderMusic(); if (preferences.musicEnabled) playMusic();}});
  listen(window, 'storage', event => {
    if (event.key !== STORAGE_KEY || !event.newValue || event.newValue.length > 16000) return;
    try {
      const next = normalizePreferences(JSON.parse(event.newValue));
      const changedTrack = next.track !== preferences.track;
      preferences = next;
      player.setVolume(preferences.volume); player.setMuted(preferences.muted); applyPalette();
      if (!preferences.musicEnabled) {playRequested = false; markPlayed(false); player.pause(); musicState = 'paused'; disarmGestures();}
      if (changedTrack) player.select(preferences.track, {position: preferences.positions[preferences.track] || 0});
      if (preferences.musicEnabled && !player.enabled) armGestures();
      renderMusic();
    } catch { /* Ignore invalid preferences received from another tab. */ }
  });
  player = createMusicPlayer({
    tracks:TRACKS, track:preferences.track, volume:preferences.volume, muted:preferences.muted, positions:preferences.positions,
    onTrack(file) {preferences.track = file; persist(); renderMusic();},
    onPosition(file, position) {preferences.positions[file] = position; if (Date.now() - lastPositionSave > 2000) {persist(); lastPositionSave = Date.now();}},
    onChange(change) {musicState = change.state; playRequested = change.state === 'starting'; if (['playing','crossfading'].includes(change.state) && change.enabled) markPlayed(true); renderMusic();},
    onBlocked:armGestures,
  });
  applyPalette();
  storageStatus();
  renderMusic();
  if (preferences.musicEnabled) playMusic();
  attachHeader();
  instance = {open, attachHeader, reapplyPalette: applyPalette, close: () => dialog.close(), get audio() {return player.audio;}, player, getPreferences: () => JSON.parse(JSON.stringify(preferences)), dispose() {disarmGestures(); for (const remove of listeners) remove(); player.dispose(); dialog.remove(); headerMute.remove(); launch.remove(); instance = undefined;}};
  return instance;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountSettings, {once: true});
else mountSettings();
