import {ARCADE_WIDTH, ARCADE_HEIGHT, ARCADE_STEP, FLAPPY_PIPE_WIDTH, PONG_PLAYER_HEIGHT, PONG_AI_HEIGHT, createArcadeRandom, createArcadeState, arcadeAction, stepArcade} from './arcade-model.js';
export {ARCADE_WIDTH, ARCADE_HEIGHT, ARCADE_STEP, FLAPPY_PIPE_WIDTH, PONG_PLAYER_HEIGHT, PONG_AI_HEIGHT, createArcadeRandom, createArcadeState, arcadeAction, stepArcade} from './arcade-model.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const copy = state => ({...state, bird: {...state.bird}, pipes: state.pipes.map(pipe => ({...pipe})), ball: {...state.ball}, score: [...state.score]});
const DEVICE_BEST_KEY = 'evan-flappy-best-v1';
const validRecord = value => Number.isSafeInteger(value) && value >= 0 && value <= 100000;

export function mountTerminalArcade(panel, {dialog, onExit = () => {}} = {}) {
  const controller = new AbortController();
  const on = (node, name, fn, options = {}) => node.addEventListener(name, fn, {...options, signal: controller.signal});
  panel.className = 'terminal-game-panel';
  panel.setAttribute('aria-label', 'Space arcade');
  panel.innerHTML = `<div class="arcade-top"><span class="arcade-label">ORBITAL ARCADE</span><div class="arcade-top-actions"><div class="arcade-tabs" role="group" aria-label="Choose a game"><button type="button" data-arcade-mode="flappy">Flappy Orbit</button><button type="button" data-arcade-mode="pong">Pong</button></div><button type="button" class="arcade-fullscreen-toggle" data-arcade-action="fullscreen" aria-label="Toggle fullscreen mode" title="Toggle fullscreen (F)"><span class="fullscreen-icon" aria-hidden="true">⛶</span></button></div></div><div class="arcade-hud"><strong class="arcade-title">Flappy Orbit</strong><span class="arcade-score"></span></div><div class="arcade-record" role="status"><span>ALL-TIME HIGH</span><strong>Loading…</strong></div><p class="arcade-record-status" role="status"></p><div class="arcade-arena"><canvas class="terminal-game-canvas" width="960" height="540" tabindex="0" aria-label="Flappy Orbit game. Space or tap to flap. P pauses. F for fullscreen."></canvas><div class="arcade-overlay"><strong></strong><span></span><button type="button" data-arcade-action="start">Start flight</button></div></div><p class="arcade-instructions"></p><p class="arcade-announcement sr-only" role="status"></p><div class="terminal-game-controls"><button type="button" data-arcade-action="flap">Flap <span>Space / tap</span></button><button type="button" data-arcade-hold="-1" aria-label="Move paddle up">↑</button><button type="button" data-arcade-hold="1" aria-label="Move paddle down">↓</button><button type="button" data-arcade-action="pause">Pause</button><button type="button" data-arcade-action="restart">Restart</button><button type="button" data-arcade-action="fullscreen" aria-label="Toggle fullscreen">Fullscreen <span>F</span></button><button type="button" data-arcade-action="shell">Back to shell</button></div>`;
  const $ = selector => panel.querySelector(selector);
  const canvas = $('.terminal-game-canvas'); const context = canvas.getContext('2d');
  const overlay = $('.arcade-overlay'); const score = $('.arcade-score');
  let state = createArcadeState();
  let deviceBest = 0;
  try {const saved = Number(localStorage.getItem(DEVICE_BEST_KEY)); if (validRecord(saved)) deviceBest = saved;} catch { /* The game also works without browser storage. */ }
  state.best = deviceBest;
  let disposed = false, frame = 0, lastTime = 0, visible = false, frames = 0;
  let move = 0, targetY, pointerDown = false, lastStatus = '', paletteAt = -1;
  let accent = '#719e5b', ink = '#b4d5ba';
  let highScore = null, recordLoading = true, recordMessage = '', recordRequest, recordTimer;
  let flight, flightPromise, flightGeneration = 0, pendingAction, remainder = 0;
  const keys = new Set();
  const stars = Array.from({length: 66}, (_, index) => ({x: (index * 137.51) % 640, y: (index * 83.17) % 330, r: index % 9 === 0 ? 1.5 : .65}));
  const available = () => !disposed && panel.isConnected && dialog.open && !document.hidden && visible;
  function redrawDescription() {if (!disposed) {lastStatus = ''; describe();}}
  function acceptRecord(value) {
    if (!validRecord(value)) throw Error('Invalid shared score');
    highScore = Math.max(highScore ?? 0, value);recordLoading = false;
  }
  async function arcadeRequest(body) {
    const response = await fetch('/api/arcade', {method: body ? 'POST' : 'GET',cache: 'no-store',signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6000)]),...(body ? {headers: {'Content-Type': 'application/json'},body: JSON.stringify(body)} : {})});
    if (!response.ok) throw Error('Shared scores unavailable');
    const data = await response.json();if (disposed) throw Error('Arcade closed');return data;
  }
  function refreshRecord() {
    if (disposed || recordRequest) return recordRequest;
    recordRequest = arcadeRequest().then(data => {acceptRecord(data.highScore);if (recordMessage === 'Shared record unavailable. You can still play.') recordMessage = '';})
      .catch(() => {if (!disposed) {recordLoading = false;if (highScore === null) recordMessage = 'Shared record unavailable. You can still play.';}})
      .finally(() => {recordRequest = undefined;redrawDescription();});
    return recordRequest;
  }
  function rememberBest() {
    if (state.mode !== 'flappy' || state.best <= deviceBest) return;
    deviceBest = state.best;
    try {localStorage.setItem(DEVICE_BEST_KEY, String(deviceBest));} catch { /* Keep this session's best if storage is blocked. */ }
  }
  function newFlight(data) {
    return {runId: data?.runId || null,expiresAt: data?.expiresAt || 0,maxSteps: data?.maxSteps || 108000,random: createArcadeRandom(data?.seed ?? Math.floor(Math.random() * 2 ** 32)),steps: 0,flaps: [],submitted: false};
  }
  function prepareFlight() {
    if (disposed || state.mode !== 'flappy' || state.status !== 'ready' || flightPromise || flight) return;
    const generation = flightGeneration;
    flightPromise = arcadeRequest({action: 'start'}).then(data => {
      if (disposed || generation !== flightGeneration || state.mode !== 'flappy') return;
      const expiry = typeof data.expiresAt === 'number' ? data.expiresAt : Date.parse(data.expiresAt);
      if (typeof data.runId !== 'string' || data.runId.length < 8 || data.runId.length > 4096 || !Number.isInteger(data.seed) || data.seed < 0 || data.seed > 0xffffffff || !Number.isFinite(expiry) || expiry <= Date.now() || data.step !== ARCADE_STEP || !Number.isInteger(data.maxSteps) || data.maxSteps < 1 || data.maxSteps > 108000) throw Error('Invalid flight');
      acceptRecord(data.highScore);flight = newFlight({...data,expiresAt: expiry});
      if (recordMessage.startsWith('Shared') || recordMessage.startsWith('This flight')) recordMessage = '';
    }).catch(() => {
      if (disposed || generation !== flightGeneration || state.mode !== 'flappy') return;
      flight = newFlight();recordLoading = false;recordMessage = 'This flight is local practice. Your best stays on this device.';
    }).finally(() => {
      if (disposed || generation !== flightGeneration) return;
      flightPromise = undefined;
      const action = pendingAction;pendingAction = undefined;redrawDescription();
      if (action && state.mode === 'flappy' && state.status === 'ready') act(action);
    });
  }
  function resetFlight() {flightGeneration++;flight = undefined;flightPromise = undefined;pendingAction = undefined;remainder = 0;}
  function publishFlight() {
    rememberBest();
    const completed = flight;
    if (!completed || completed.submitted || !completed.runId || completed.steps > completed.maxSteps || completed.flaps.length > 6000) return;
    completed.submitted = true;recordMessage = 'Saving your flight…';redrawDescription();
    const payload = {action: 'finish',runId: completed.runId,steps: completed.steps,flaps: [...completed.flaps],score: state.score[0]};
    arcadeRequest(payload).then(data => {
      if (data.verifiedScore !== payload.score) throw Error('Flight verification failed');
      acceptRecord(data.highScore);
      if (flight === completed) recordMessage = data.record ? 'New all-time high. Shared with every player.' : 'Flight saved. The all-time high is shared by every player.';
    }).catch(() => {if (!disposed && flight === completed) recordMessage = 'Shared score could not be saved. Your best stays on this device.';})
      .finally(redrawDescription);
  }
  function describe() {
    panel.dataset.game = state.mode; panel.dataset.outcome = state.status;
    panel.dataset.score = state.score.join(':'); panel.dataset.frames = String(frames);
    // A readable snapshot also makes browser assertions independent of pixels.
    panel.dataset.birdY = state.bird.y.toFixed(2); panel.dataset.paddleY = state.playerY.toFixed(2);
    dialog.dataset.gameState = state.status;
    const flappy = state.mode === 'flappy';
    $('.arcade-title').textContent = flappy ? 'Flappy Orbit' : 'Pong // deep space';
    const scoreText = flappy ? `GATES ${state.score[0]} · YOUR BEST ${state.best}` : `YOU ${state.score[0]} : ${state.score[1]} CPU`;
    if (score.textContent !== scoreText) score.textContent = scoreText;
    $('.arcade-record').hidden = !flappy;$('.arcade-record-status').hidden = !flappy;
    const sharedText = highScore === null ? recordLoading ? 'Loading…' : 'Unavailable' : highScore.toLocaleString();
    if ($('.arcade-record strong').textContent !== sharedText) $('.arcade-record strong').textContent = sharedText;
    $('.arcade-record-status').textContent = pendingAction ? 'Preparing your shared-score flight…' : recordMessage;
    panel.dataset.highScore = highScore === null ? '' : String(highScore);
    panel.dataset.flightSteps = String(flight?.steps || 0);
    if (lastStatus === `${state.mode}:${state.status}`) return;
    $('.arcade-instructions').textContent = flappy ? 'Space, click or tap to flap. Slip through the gates. P pauses.' : 'W / S or ↑ / ↓ to move. Drag on the court or hold the arrow buttons. First to 5 wins.';
    canvas.setAttribute('aria-label', flappy ? 'Flappy Orbit game. Space or tap to flap. P pauses.' : 'Pong game. W and S or arrow keys move your paddle. P pauses.');
    for (const button of panel.querySelectorAll('[data-arcade-mode]')) button.setAttribute('aria-pressed', String(button.dataset.arcadeMode === state.mode));
    $('[data-arcade-action="flap"]').hidden = !flappy;
    for (const button of panel.querySelectorAll('[data-arcade-hold]')) button.hidden = flappy;
    const pause = $('[data-arcade-action="pause"]'); pause.textContent = state.status === 'paused' ? 'Resume' : 'Pause'; pause.disabled = !['running', 'paused'].includes(state.status);
    overlay.hidden = state.status === 'running';
    const title = state.status === 'ready' ? (flappy ? 'A little flight. A long way home.' : 'You. A paddle. Deep space.') : state.status === 'paused' ? (flappy ? 'Flight on hold' : 'Match on hold') : state.status === 'quit' ? 'Back among the stars' : flappy ? 'One more orbit?' : state.winner === 'you' ? 'The galaxy is yours.' : 'The rematch is calling.';
    overlay.querySelector('strong').textContent = title;
    overlay.querySelector('span').textContent = state.status === 'paused' ? 'Resume when you are ready.' : state.status === 'ready' ? (flappy ? 'Flap through the luminous gates.' : 'Outplay the ship. First to five.') : flappy ? `${state.score[0]} gates cleared · your best ${state.best}${highScore === null ? '' : ` · all-time high ${highScore}`}` : `${state.score[0]} : ${state.score[1]} · first to five`;
    overlay.querySelector('button').textContent = state.status === 'paused' ? 'Resume' : state.status === 'ready' ? (flappy ? 'Start flight' : 'Start match') : 'Play again';
    overlay.querySelector('button').disabled = Boolean(pendingAction);
    if (lastStatus !== `${state.mode}:${state.status}`) {$('.arcade-announcement').textContent = `${flappy ? 'Flappy Orbit' : 'Pong'}. ${state.status}. ${overlay.querySelector('span').textContent}`; lastStatus = `${state.mode}:${state.status}`;}
  }
  function draw() {
    if (!context) return;
    if (state.elapsed - paletteAt > .7 || paletteAt < 0) {const css = getComputedStyle(panel); accent = css.getPropertyValue('--green').trim() || accent; ink = css.getPropertyValue('--cream').trim() || ink; paletteAt = state.elapsed;}
    const c = context; c.setTransform(1.5, 0, 0, 1.5, 0, 0);
    c.fillStyle = '#030611'; c.fillRect(0, 0, 640, 360);
    const haze = c.createRadialGradient(460, 110, 5, 460, 110, 360); haze.addColorStop(0, '#172541'); haze.addColorStop(.6, '#0a1029'); haze.addColorStop(1, '#030611'); c.fillStyle = haze; c.fillRect(0, 0, 640, 360);
    for (const star of stars) {c.globalAlpha = .35 + star.r * .25; c.fillStyle = '#e4ecff'; c.beginPath(); c.arc((star.x - state.elapsed * (star.r * 2) % 640 + 640) % 640, star.y, star.r, 0, Math.PI * 2); c.fill();} c.globalAlpha = 1;
    c.strokeStyle = '#22334a'; c.lineWidth = .6;
    for (let x = 0; x < 640; x += 40) {c.beginPath(); c.moveTo(x, 340); c.lineTo(320 + (x - 320) * 1.5, 360); c.stroke();}
    c.beginPath(); c.moveTo(0, 340); c.lineTo(640, 340); c.stroke();
    if (state.mode === 'flappy') {
      c.fillStyle = '#151d3a'; c.beginPath(); c.arc(520, 88, 38, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#445479'; c.beginPath(); c.ellipse(520, 88, 60, 12, -.35, 0, Math.PI * 2); c.stroke();
      for (const pipe of state.pipes) {
        const gapHalf = pipe.gapHalf ?? FLAPPY_GAP_HALF;
        for (const [y, height] of [[0, pipe.gapY - gapHalf], [pipe.gapY + gapHalf, 340 - pipe.gapY - gapHalf]]) {
          const fill = c.createLinearGradient(pipe.x, 0, pipe.x + FLAPPY_PIPE_WIDTH, 0); fill.addColorStop(0, '#101c2d'); fill.addColorStop(.55, '#192d3b'); fill.addColorStop(1, '#070c18');
          c.fillStyle = fill; c.fillRect(pipe.x, y, FLAPPY_PIPE_WIDTH, height); c.strokeStyle = accent; c.shadowColor = accent; c.shadowBlur = 8; c.strokeRect(pipe.x, y, FLAPPY_PIPE_WIDTH, height); c.shadowBlur = 0;
          c.strokeStyle = '#395065'; for (let stripe = y + 16; stripe < y + height - 5; stripe += 26) {c.beginPath(); c.moveTo(pipe.x + 10, stripe); c.lineTo(pipe.x + 43, stripe); c.stroke();}
          c.fillStyle = '#b4f0e5'; c.fillRect(pipe.x - 4, y === 0 ? height - 4 : y, 64, 4);
        }
      }
      c.save(); c.translate(state.bird.x, state.bird.y); c.rotate(clamp(state.bird.vy / 540, -.45, .85));
      c.fillStyle = '#7285ff'; c.shadowColor = '#9bbaff'; c.shadowBlur = 16; c.beginPath(); c.moveTo(-10, -5); c.lineTo(-25 - (state.status === 'running' ? Math.sin(state.elapsed * 35) * 5 : 0), 0); c.lineTo(-10, 5); c.fill();
      c.fillStyle = '#d3f5ff'; c.beginPath(); c.moveTo(15, 0); c.lineTo(-8, -10); c.lineTo(-4, 0); c.lineTo(-8, 10); c.closePath(); c.fill(); c.shadowBlur = 0;
      c.fillStyle = '#5d92c7'; c.beginPath(); c.ellipse(2, -1, 5, 3, 0, 0, Math.PI * 2); c.fill(); c.restore();
    } else {
      c.setLineDash([5, 9]); c.strokeStyle = '#445067'; c.beginPath(); c.moveTo(320, 18); c.lineTo(320, 342); c.stroke(); c.setLineDash([]);
      c.strokeStyle = '#1d2944'; c.beginPath(); c.arc(320, 180, 48, 0, Math.PI * 2); c.stroke();
      for (const [x, y, color, height] of [[28, state.playerY, accent, PONG_PLAYER_HEIGHT], [600, state.aiY, '#9798f1', PONG_AI_HEIGHT]]) {
        c.shadowBlur = 15; c.shadowColor = color; c.fillStyle = color; c.fillRect(x, y, 12, height); c.shadowBlur = 0; c.fillStyle = '#ebffff'; c.fillRect(x + 4, y + 6, 2, height - 12);
      }
      c.globalAlpha = .17; c.fillStyle = '#b3d8ff'; for (let trail = 1; trail <= 5; trail++) {c.beginPath(); c.arc(state.ball.x - state.ball.vx * trail * .012, state.ball.y - state.ball.vy * trail * .012, 7 - trail * .65, 0, Math.PI * 2); c.fill();} c.globalAlpha = 1;
      c.shadowColor = '#dcecff'; c.shadowBlur = 20; c.fillStyle = '#f1fbff'; c.beginPath(); c.arc(state.ball.x, state.ball.y, 7, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
      if (state.serve > 0 && state.status === 'running') {c.fillStyle = ink; c.font = '12px monospace'; c.textAlign = 'center'; c.fillText('GET READY', 320, 240);}
    }
  }
  function stop() {cancelAnimationFrame(frame); frame = 0; lastTime = 0; keys.clear(); move = 0; targetY = undefined; pointerDown = false;}
  function pause() {if (disposed) return; pendingAction = undefined; state = arcadeAction(state, 'pause'); stop(); redrawDescription(); draw();}
  function tick(time) {
    frame = 0;
    if (!available() || state.status !== 'running') {pause(); return;}
    const dt = lastTime ? Math.min((time - lastTime) / 1000, .05) : 1 / 60; lastTime = time;
    if (state.mode === 'flappy') {
      remainder += dt;
      while (remainder + 1e-10 >= ARCADE_STEP && state.status === 'running') {
        state = stepArcade(state, ARCADE_STEP, {}, flight.random);flight.steps++;remainder -= ARCADE_STEP;
        if (flight.runId && flight.steps > flight.maxSteps) {flight.runId = null;recordMessage = 'This long flight is local practice. Your best stays on this device.';}
      }
      rememberBest();
    } else state = stepArcade(state, dt, {move: move || Number(keys.has('arrowdown') || keys.has('s')) - Number(keys.has('arrowup') || keys.has('w')), targetY});
    frames++; describe(); draw();
    if (state.status === 'running') frame = requestAnimationFrame(tick); else {stop();if (state.mode === 'flappy' && state.status === 'over') publishFlight();}
  }
  function run() {if (available() && state.status === 'running' && !frame) {lastTime = 0; frame = requestAnimationFrame(tick);}}
  function toggleFullscreen() {
    const isFs = document.fullscreenElement === panel || document.webkitFullscreenElement === panel || panel.classList.contains('arcade-fullscreen');
    if (isFs) {
      delete panel.dataset.manualFs;
      panel.classList.remove('arcade-fullscreen');
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      else if (document.webkitFullscreenElement) document.webkitExitFullscreen?.();
    } else {
      panel.dataset.manualFs = 'true';
      panel.classList.add('arcade-fullscreen');
      if (panel.requestFullscreen) panel.requestFullscreen().catch(() => {});
      else if (panel.webkitRequestFullscreen) panel.webkitRequestFullscreen();
    }
    const btns = panel.querySelectorAll('[data-arcade-action="fullscreen"]');
    for (const b of btns) b.setAttribute('aria-pressed', String(!isFs));
    canvas.focus({preventScroll: true});
    draw();
  }
  function act(action) {
    if (disposed) return;
    if (action === 'fullscreen') { toggleFullscreen(); return; }
    if (action === 'shell') {stop();resetFlight(); state = arcadeAction(state, 'quit'); describe(); draw(); onExit(); return;}
    if (action === 'pause') action = state.status === 'paused' ? 'start' : 'pause';
    if (action === 'restart' || action === 'start' && ['over', 'quit'].includes(state.status)) {
      stop();resetFlight();state = arcadeAction(state, 'restart');state.best = state.mode === 'flappy' ? Math.max(state.best,deviceBest) : state.best;recordMessage = '';
      if (state.mode === 'flappy') prepareFlight();
      if (action === 'restart') {redrawDescription();draw();return;}
    }
    if (state.mode === 'flappy' && state.status === 'ready' && ['start','flap'].includes(action)) {
      if (flight?.runId && flight.expiresAt < Date.now() + 14 * 60000) {resetFlight();prepareFlight();}
      if (!flight) {pendingAction = action;prepareFlight();redrawDescription();return;}
    }
    if (state.mode === 'flappy' && action === 'flap' && ['ready','running','paused'].includes(state.status)) {
      if (flight.flaps.at(-1) !== flight.steps) flight.flaps.push(flight.steps);
      if (flight.flaps.length > 6000) {flight.runId = null;recordMessage = 'This flight is local practice. Your best stays on this device.';}
    }
    state = arcadeAction(state, action);
    if (action === 'pause') pendingAction = undefined;
    describe(); draw();
    if (state.status === 'running') {canvas.focus({preventScroll: true}); run();} else stop();
  }
  function open(mode, {resume = false} = {}) {
    if (disposed) return;
    stop();
    if (!resume || state.status === 'quit') {resetFlight();state = createArcadeState(mode || state.mode);state.best = state.mode === 'flappy' ? deviceBest : 0;recordMessage = '';}
    else if (state.status === 'running') state = arcadeAction(state, 'pause');
    if (state.mode === 'flappy') {refreshRecord();prepareFlight();}
    paletteAt = -1; describe(); draw();
  }
  on(panel, 'click', event => {
    const mode = event.target.closest('[data-arcade-mode]'); if (mode) {open(mode.dataset.arcadeMode); return;}
    const button = event.target.closest('[data-arcade-action]'); if (button) act(button.dataset.arcadeAction);
  });
  on(canvas, 'keydown', event => {
    const key = event.key.toLowerCase();
    if ([' ', 'arrowup', 'arrowdown', 'w', 's', 'p', 'r', 'f'].includes(key)) event.preventDefault(); else return;
    if (key === 'f' && !event.repeat) act('fullscreen');
    else if (key === 'p' && !event.repeat) act('pause');
    else if (key === 'r' && !event.repeat) act('restart');
    else if (state.mode === 'flappy' && (key === ' ' || key === 'arrowup') && !event.repeat) act('flap');
    else if (state.mode === 'pong') keys.add(key);
  });
  const onFsChange = () => {
    const inFs = document.fullscreenElement === panel || document.webkitFullscreenElement === panel;
    if (!inFs && !panel.dataset.manualFs) panel.classList.remove('arcade-fullscreen');
    const btns = panel.querySelectorAll('[data-arcade-action="fullscreen"]');
    for (const b of btns) b.setAttribute('aria-pressed', String(panel.classList.contains('arcade-fullscreen') || inFs));
    draw();
  };
  on(document, 'fullscreenchange', onFsChange);
  on(document, 'webkitfullscreenchange', onFsChange);
  on(canvas, 'keyup', event => keys.delete(event.key.toLowerCase()));
  on(canvas, 'blur', event => {keys.clear(); if (!panel.contains(event.relatedTarget) && state.status === 'running') pause();});
  on(canvas, 'pointerdown', event => {
    event.preventDefault(); canvas.focus({preventScroll: true});
    if (state.mode === 'flappy') {if (['over', 'quit'].includes(state.status)) return; act('flap');}
    else {pointerDown = true; canvas.setPointerCapture(event.pointerId); targetY = (event.clientY - canvas.getBoundingClientRect().top) / canvas.getBoundingClientRect().height * 360; if (state.status === 'ready' || state.status === 'paused') act('start');}
  });
  on(canvas, 'pointermove', event => {if (pointerDown && state.mode === 'pong') targetY = (event.clientY - canvas.getBoundingClientRect().top) / canvas.getBoundingClientRect().height * 360;});
  const release = () => {move = 0; pointerDown = false; targetY = undefined;};
  on(window, 'pointerup', release); on(window, 'pointercancel', release);
  for (const button of panel.querySelectorAll('[data-arcade-hold]')) {
    on(button, 'pointerdown', event => {
      event.preventDefault(); canvas.focus({preventScroll: true}); move = Number(button.dataset.arcadeHold); button.setPointerCapture(event.pointerId);
      if (state.status === 'ready' || state.status === 'paused') act('start');
    });
    on(button, 'click', event => {
      if (event.detail !== 0) return;
      if (state.status === 'ready' || state.status === 'paused') act('start');
      state = stepArcade(state, .08, {move: Number(button.dataset.arcadeHold)}); describe(); draw(); canvas.focus({preventScroll: true});
    });
  }
  on(dialog, 'close', pause);
  on(document, 'visibilitychange', () => {if (document.hidden) pause();});
  on(window, 'blur', pause);
  const observer = new IntersectionObserver(entries => {visible = entries[0].isIntersecting; if (!visible) pause(); else run();}, {threshold: .15}); observer.observe(canvas);
  recordTimer = setInterval(() => {if (available() && state.mode === 'flappy') refreshRecord();}, 60000);
  describe(); draw();
  return {open, pause, quit() {if (disposed) return; stop();resetFlight(); state = arcadeAction(state, 'quit'); describe(); draw();}, get snapshot() {return copy(state);}, dispose() {disposed = true;stop();resetFlight();clearInterval(recordTimer);observer.disconnect();controller.abort();if (panel.classList.contains('arcade-fullscreen')) {panel.classList.remove('arcade-fullscreen');if (document.fullscreenElement) document.exitFullscreen?.().catch(()=>{});}panel.dataset.outcome = 'disposed';}};
}
