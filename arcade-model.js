// The simulation uses a fixed-size world and seconds, independent of the DOM.
// Each step returns a new state so collisions and scoring can be tested directly.
export const ARCADE_WIDTH = 640;
export const ARCADE_HEIGHT = 360;
export const ARCADE_STEP = 1 / 120;
// Shared by the browser and the score verifier, so a submitted flight can be
// replayed from its seed and flap steps rather than trusting a posted number.
export function createArcadeRandom(seed) {
  let value = Number(seed) >>> 0;
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
export const FLAPPY_PIPE_WIDTH = 56;
const FLAPPY_GAP_HALF = 61;
export const PONG_PLAYER_HEIGHT = 60;
export const PONG_AI_HEIGHT = 68;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const roll = random => clamp(Number(random()) || 0, 0, 1);
const copy = state => ({...state, bird: {...state.bird}, pipes: state.pipes.map(pipe => ({...pipe})), ball: {...state.ball}, score: [...state.score]});
// Reflect the projected intercept through the top/bottom walls. The CPU still
// has to reach it at a finite speed and retains a small, time-varying aim error.
const pongIntercept = ball => {
  const projected = ball.y + ball.vy * Math.max(0, (600 - ball.x) / ball.vx) - 14;
  const folded = ((projected % 664) + 664) % 664;
  return 14 + (folded > 332 ? 664 - folded : folded);
};

export function createArcadeState(mode = 'flappy') {
  return {mode: mode === 'pong' ? 'pong' : 'flappy', status: 'ready', elapsed: 0, score: [0, 0], best: 0,
    bird: {x: 156, y: 170, vy: 0, radius: 11}, pipes: [], spawn: .5,
    playerY: 150, aiY: 146, ball: {x: 320, y: 180, vx: 300, vy: 130}, serve: .65, winner: null};
}

export function arcadeAction(state, action) {
  const next = copy(state);
  if (action === 'restart') return {...createArcadeState(state.mode), best: Math.max(state.best, state.score[0])};
  if (action === 'quit') {next.status = 'quit'; return next;}
  if (action === 'pause' && state.status === 'running') next.status = 'paused';
  if (action === 'start' && ['ready', 'paused'].includes(state.status)) next.status = 'running';
  if (action === 'flap' && ['ready', 'running', 'paused'].includes(state.status)) {
    next.status = 'running'; next.bird.vy = -288;
  }
  return next;
}

export function stepArcade(state, seconds, input = {}, random = Math.random) {
  if (state.status !== 'running') return state;
  // Substeps prevent a delayed frame from tunnelling through a gate or paddle.
  let next = copy(state);
  let remaining = clamp(Number(seconds) || 0, 0, .12);
  while (remaining > 0 && next.status === 'running') {
    const dt = Math.min(remaining, 1 / 120); remaining -= dt; next.elapsed += dt;
    if (next.mode === 'flappy') {
      next.bird.vy += 795 * dt; next.bird.y += next.bird.vy * dt;
      next.spawn -= dt;
      if (next.spawn <= 0) {
        const previous = next.pipes.at(-1)?.gapY ?? 180;
        next.pipes.push({x: 660, gapY: clamp(previous + (roll(random) - .5) * 160, 96, 252), gapHalf: FLAPPY_GAP_HALF - Math.min(next.score[0], 20) * .4, passed: false});
        next.spawn += 1.4 - Math.min(next.score[0], 20) * .007;
      }
      const speed = 185 + Math.min(next.score[0], 24) * 2.5;
      for (const pipe of next.pipes) {
        const gapHalf = pipe.gapHalf ?? FLAPPY_GAP_HALF;
        pipe.x -= speed * dt;
        if (!pipe.passed && pipe.x + FLAPPY_PIPE_WIDTH < next.bird.x - next.bird.radius) {pipe.passed = true; next.score[0]++;}
        const nearestX = clamp(next.bird.x, pipe.x, pipe.x + FLAPPY_PIPE_WIDTH);
        const radiusX = Math.abs(nearestX - next.bird.x);
        if (radiusX < next.bird.radius) {
          const reach = Math.sqrt(next.bird.radius ** 2 - radiusX ** 2);
          if (next.bird.y - reach < pipe.gapY - gapHalf || next.bird.y + reach > pipe.gapY + gapHalf) next.status = 'over';
        }
      }
      next.pipes = next.pipes.filter(pipe => pipe.x > -70);
      if (next.bird.y - next.bird.radius < 8 || next.bird.y + next.bird.radius > 340) next.status = 'over';
      next.best = Math.max(next.best, next.score[0]);
    } else {
      const movement = clamp(Number(input.move) || 0, -1, 1);
      next.playerY = Number.isFinite(input.targetY) ? clamp(input.targetY - PONG_PLAYER_HEIGHT / 2, 8, 352 - PONG_PLAYER_HEIGHT) : clamp(next.playerY + movement * 310 * dt, 8, 352 - PONG_PLAYER_HEIGHT);
      // It reads the bounce after the ball reaches its side of the court.
      // Early in a return it tracks the visible ball, giving angled shots a
      // chance to wrong-foot it instead of making it an all-knowing opponent.
      const target = (next.ball.vx > 0 ? next.ball.x >= 380 ? pongIntercept(next.ball) : next.ball.y : 180) - PONG_AI_HEIGHT / 2 + Math.sin(next.elapsed * 2.3) * 13;
      const aiSpeed = next.ball.vx > 0 ? 270 : 120;
      next.aiY = clamp(next.aiY + clamp(target - next.aiY, -aiSpeed * dt, aiSpeed * dt), 8, 284);
      if (next.serve > 0) {next.serve -= dt; continue;}
      const ball = next.ball;
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      if (ball.y < 14 && ball.vy < 0 || ball.y > 346 && ball.vy > 0) {ball.y = clamp(ball.y, 14, 346); ball.vy *= -1;}
      for (const [x, y, side, height] of [[40, next.playerY, 1, PONG_PLAYER_HEIGHT], [600, next.aiY, -1, PONG_AI_HEIGHT]]) {
        if (ball.vx * side < 0 && Math.abs(ball.x - x) < 13 && ball.y >= y - 7 && ball.y <= y + height + 7) {
          const angle = clamp((ball.y - (y + height / 2)) / (height / 2 + 5), -1, 1) * Math.PI / 3;
          const speed = Math.min(600, Math.hypot(ball.vx, ball.vy) * 1.085);
          ball.x = x + side * 13; ball.vx = side * Math.cos(angle) * speed; ball.vy = Math.sin(angle) * speed;
        }
      }
      if (ball.x < -12 || ball.x > 652) {
        const scorer = ball.x > 652 ? 0 : 1; next.score[scorer]++;
        if (next.score[scorer] === 5) {next.winner = scorer === 0 ? 'you' : 'computer'; next.status = 'over';}
        next.ball = {x: 320, y: 180, vx: scorer === 0 ? -300 : 300, vy: (roll(random) - .5) * 280}; next.serve = .85;
      }
    }
  }
  return next;
}

