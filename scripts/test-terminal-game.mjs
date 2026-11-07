import test from 'node:test';
import assert from 'node:assert/strict';
import {createArcadeState, arcadeAction, stepArcade} from '../terminal-game.js';

const running = mode => arcadeAction(createArcadeState(mode), 'start');
const advance = (state, seconds, input = {}, random = () => .5) => {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 120) state = stepArcade(state, 1 / 120, input, random);
  return state;
};

test('ready, pause, resume, restart and quit are immutable simulation transitions', () => {
  for (const mode of ['flappy', 'pong']) {
    const ready = createArcadeState(mode);
    assert.equal(stepArcade(ready, 1), ready);
    const started = arcadeAction(ready, 'start');
    assert.equal(ready.status, 'ready');
    const paused = arcadeAction(advance(started, .1), 'pause');
    assert.equal(paused.status, 'paused');
    assert.equal(stepArcade(paused, 30), paused);
    const resumed = arcadeAction(paused, 'start');
    assert.equal(resumed.elapsed, paused.elapsed);
    const ended = arcadeAction(resumed, 'quit');
    assert.equal(ended.status, 'quit');
    assert.equal(stepArcade(ended, .1), ended);
    const fresh = arcadeAction(ended, 'restart');
    assert.equal(fresh.status, 'ready');
    assert.equal(fresh.elapsed, 0);
    assert.deepEqual(fresh.score, [0, 0]);
  }
});

test('Flappy has real gravity, an immediate upward flap, and lethal floor and ceiling', () => {
  const original = running('flappy');
  const falling = advance(original, .3);
  assert.ok(falling.bird.y > original.bird.y + 30);
  assert.equal(original.bird.y, 170);
  assert.equal(original.elapsed, 0);
  const flapped = arcadeAction(falling, 'flap');
  assert.equal(flapped.bird.vy, -288);
  assert.ok(advance(flapped, .12).bird.y < falling.bird.y);
  assert.equal(advance(original, 2).status, 'over');
  const nearCeiling = {...running('flappy'), bird: {...original.bird, y: 18}};
  assert.equal(advance(arcadeAction(nearCeiling, 'flap'), .06).status, 'over');
});

test('Flappy gates have bounded reachable gaps, score once when cleared, and collide with their actual edges', () => {
  const state = running('flappy');
  state.bird.y = 180; state.bird.vy = -4;
  state.pipes = [{x: 133, gapY: 180, passed: false}];
  state.spawn = 10;
  let safe = advance(state, .32);
  assert.equal(safe.status, 'running');
  assert.equal(safe.score[0], 1);
  safe = advance(arcadeAction(safe, 'flap'), .1);
  assert.equal(safe.score[0], 1);
  assert.equal(state.pipes[0].passed, false, 'A simulation step does not mutate the previous gate');
  const hit = {...state, bird: {...state.bird, y: 100}, pipes: [{x: 150, gapY: 180, passed: false}]};
  assert.equal(stepArcade(hit, .02).status, 'over');
  for (const random of [() => 0, () => 1, () => NaN]) {
    const spawning = {...running('flappy'), spawn: 0};
    const next = stepArcade(spawning, .001, {}, random);
    assert.equal(next.pipes.length, 1);
    assert.ok(next.pipes[0].gapY >= 96 && next.pipes[0].gapY <= 252);
    assert.ok(Math.abs(next.pipes[0].gapY - 180) <= 80);
    assert.ok(next.pipes[0].x > 639, 'New gates arrive beyond the visible playing field');
  }
});

test('Flappy requires tighter clearance and increases pace without moving existing gate edges', () => {
  const fresh = stepArcade({...running('flappy'),spawn:0}, .01, {}, () => .5);
  const veteran = stepArcade({...running('flappy'),score:[24,0],spawn:0}, .01, {}, () => .5);
  assert.ok(fresh.pipes[0].gapHalf * 2 < 130, 'Opening gates are visibly tighter than the old 146px clearance');
  assert.ok(veteran.pipes[0].gapHalf < fresh.pipes[0].gapHalf, 'Later gates demand more precise altitude');
  assert.ok(660 - veteran.pipes[0].x > (660 - fresh.pipes[0].x) * 1.25, 'High-score runs have meaningfully less reaction time');
  assert.ok(veteran.spawn < fresh.spawn);
  const olderGate = {...veteran,pipes:[{...fresh.pipes[0],x:300}]};
  assert.equal(stepArcade(olderGate,.02).pipes[0].gapHalf,fresh.pipes[0].gapHalf,'A gate never shrinks around the player');
  const closeEdge = {...running('flappy'),bird:{...fresh.bird,y:122},pipes:[{x:150,gapY:180,gapHalf:fresh.pipes[0].gapHalf,passed:false}],spawn:10};
  assert.equal(stepArcade(closeEdge,.001).status,'over','Previously forgiving near-edge flight now collides with the rendered gate');
});

test('Flappy restart retains only its session best score and seeded input is reproducible', () => {
  const scored = {...running('flappy'), score: [9, 0], best: 9};
  const fresh = arcadeAction(scored, 'restart');
  assert.equal(fresh.best, 9); assert.equal(fresh.score[0], 0); assert.deepEqual(fresh.pipes, []);
  let a = running('flappy'), b = running('flappy');
  for (let frame = 0; frame < 100; frame++) {
    if (frame % 35 === 0) {a = arcadeAction(a, 'flap'); b = arcadeAction(b, 'flap');}
    a = stepArcade(a, 1 / 60, {}, () => .2); b = stepArcade(b, 1 / 60, {}, () => .2);
    assert.deepEqual(a, b);
  }
});

test('generated Flappy courses remain flyable with a simple visible-gap controller', () => {
  for (let seed = 1; seed <= 100; seed++) {
    let value = seed;
    const random = () => ((value = (value * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    let state = running('flappy');
    for (let frame = 0; frame < 3600 && state.status === 'running'; frame++) {
      const target = state.pipes.find(pipe => pipe.x + 56 > state.bird.x - 12)?.gapY ?? 180;
      if (state.bird.y > target + 18 && state.bird.vy > -45) state = arcadeAction(state, 'flap');
      state = stepArcade(state, 1 / 60, {}, random);
    }
    assert.equal(state.status, 'running', `Course ${seed} should remain reachable`);
    assert.ok(state.score[0] >= 35);
  }
});

test('Pong paddle controls stay in bounds and AI movement has a fair speed limit', () => {
  const start = running('pong');
  const up = advance(start, .3, {move: -1});
  assert.ok(up.playerY < start.playerY - 90);
  assert.equal(advance(start, 2, {move: -1}).playerY, 8);
  assert.equal(advance(start, 2, {move: 1}).playerY, 292);
  assert.equal(stepArcade(start, .01, {targetY: 800}).playerY, 292);
  assert.equal(stepArcade(start, .01, {targetY: -30}).playerY, 8);
  const chasing = {...start, aiY: 8, ball: {...start.ball, y: 330}};
  const after = stepArcade(chasing, .1);
  assert.ok(Math.abs(after.aiY - chasing.aiY) <= 27.00001, 'AI cannot teleport to the intercept');
});

test('Pong CPU anticipates wall rebounds but can still lose a demanding return', () => {
  const anticipating = {...running('pong'),serve:0,aiY:200,ball:{x:400,y:320,vx:300,vy:450}};
  const aimed = stepArcade(anticipating,.08);
  assert.ok(aimed.aiY < anticipating.aiY - 20,'CPU moves toward the future wall-bounced intercept instead of blindly following current height');
  const unreachable = {...running('pong'),serve:0,aiY:8,ball:{x:580,y:320,vx:560,vy:0}};
  const winner = advance(unreachable,.2);
  assert.deepEqual(winner.score,[1,0],'A well-placed fast shot beats the speed-limited CPU');
  assert.equal(unreachable.aiY,8,'AI prediction never mutates the previous state');
});

test('a skilled keyboard player can win complete Pong matches through angled returns', () => {
  // Use only the same bounded movement input as W/S, with no state injection
  // after the initial serve. This catches an impossibly perfect CPU predictor.
  const reflect = y => {const value=((y-14)%664+664)%664;return 14+(value>332?664-value:value);};
  for(let seed=1;seed<=5;seed++) {
    let value=seed;
    const random=()=>((value=(value*1664525+1013904223)>>>0)/2**32);
    let state=running('pong');
    for(let frame=0;frame<60*150&&state.status==='running';frame++) {
      const intercept=state.ball.vx<0?reflect(state.ball.y+state.ball.vy*Math.max(0,(40-state.ball.x)/state.ball.vx)):180;
      const target=intercept-28;
      const move=Math.max(-1,Math.min(1,(target-(state.playerY+30))*.15));
      state=stepArcade(state,1/60,{move},random);
    }
    assert.equal(state.winner,'you',`Seed ${seed}: legal paddle movement and aimed returns can beat the CPU`);
    assert.equal(state.score[0],5);
  }
});

test('Pong serves faster and hard rallies accelerate while keeping a capped speed', () => {
  const served = running('pong');
  assert.ok(Math.hypot(served.ball.vx,served.ball.vy) > 320,'First serve already requires a quicker response');
  for(const speed of [350,590]) {
    const approach={...served,serve:0,ball:{x:55,y:180,vx:-speed,vy:0}};
    const returned=stepArcade(approach,.02);
    assert.ok(returned.ball.vx>0);
    assert.ok(Math.hypot(returned.ball.vx,returned.ball.vy)>Math.min(590,speed*1.08));
    assert.ok(Math.hypot(returned.ball.vx,returned.ball.vy)<=600.00001,'Long rallies remain bounded and playable');
  }
});

test('Pong rebounds from paddles and walls, rewards a miss exactly once, and ends at five', () => {
  const start = {...running('pong'), serve: 0};
  const approach = {...start, ball: {x: 55, y: start.playerY + 50, vx: -300, vy: 0}};
  const rebound = stepArcade(approach, .03);
  assert.ok(rebound.ball.vx > 0);
  assert.ok(rebound.ball.vy > 0, 'Off-center paddle contact changes the return angle');
  const wall = stepArcade({...start, ball: {x: 320, y: 15, vx: 150, vy: -200}}, .03);
  assert.ok(wall.ball.vy > 0);
  const point = stepArcade({...start, ball: {x: 651, y: 30, vx: 300, vy: 0}}, .03, {}, () => .5);
  assert.deepEqual(point.score, [1, 0]); assert.equal(point.ball.x, 320); assert.ok(point.serve > .8);
  assert.deepEqual(advance(point, .4).score, [1, 0], 'Serve delay prevents repeated scoring');
  const won = stepArcade({...start, score: [4, 2], ball: {x: 651, y: 30, vx: 300, vy: 0}}, .03);
  assert.equal(won.status, 'over'); assert.equal(won.winner, 'you'); assert.deepEqual(won.score, [5, 2]);
  const lost = stepArcade({...start, score: [2, 4], ball: {x: -11, y: 30, vx: -300, vy: 0}}, .03);
  assert.equal(lost.status, 'over'); assert.equal(lost.winner, 'computer');
});
