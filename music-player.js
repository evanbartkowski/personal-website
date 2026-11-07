// Two persistent media decks keep the outgoing song alive while the next one
// loads. Gains are power-blended, so the middle of a crossfade stays even.
export const MUSIC_FADES = Object.freeze({track: 3200, play: 700, pause: 420, volume: 180, unmute: 420, settle: 140});
const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
const smooth = value => value * value * (3 - 2 * value);
export const blendMusicGain = (from, to, progress) => Math.sqrt(Math.max(0, from * from * (1 - smooth(clamp(progress))) + to * to * smooth(clamp(progress))));

export function createMusicPlayer({
  tracks, track, volume = .1, muted = false, positions = {},
  onChange = () => {}, onTrack = () => {}, onPosition = () => {}, onBlocked = () => {},
  document: owner = globalThis.document, now = () => performance.now(),
  setInterval: schedule = globalThis.setInterval, clearInterval: unschedule = globalThis.clearInterval,
  setTimeout: defer = globalThis.setTimeout, clearTimeout: cancelDelay = globalThis.clearTimeout,
  AudioContext: Context = globalThis.AudioContext || globalThis.webkitAudioContext,
} = {}) {
  if (!Array.isArray(tracks) || !tracks.length) throw new Error('Music tracks are required.');
  const files = tracks.map(item => typeof item === 'string' ? item : item.file);
  const host = owner.createElement('div'); host.id = 'portfolio-music-player'; host.hidden = true;
  const listeners = [];
  const listen = (target, name, handler) => {target.addEventListener(name, handler); listeners.push(() => target.removeEventListener(name, handler));};
  let active = 0, enabled = false, state = 'ready', notice = '', disposed = false, generation = 0;
  let targetVolume = clamp(volume), master = targetVolume, isMuted = Boolean(muted), timer, gainRamp, masterRamp, pending, transitioning = false;
  let requestedTrack = files.includes(track) ? track : files[0], autoFailedFor = null;
  let mediaVolumeSupported = true, mixer, mixerUnavailable = false;
  const decks = [0, 1].map(index => {
    const audio = owner.createElement('audio'); audio.hidden = true; audio.preload = 'metadata';
    audio.dataset.musicDeck = String(index); audio.muted = isMuted;
    try {audio.volume = 0; if (audio.volume !== 0) mediaVolumeSupported = false;} catch {mediaVolumeSupported = false;}
    host.append(audio);
    return {audio, track: null, gain: index === 0 ? 1 : 0, seek: 0, restored: false};
  });
  owner.body.append(host);
  host.dataset.gainControl = mediaVolumeSupported ? 'media' : 'webaudio';

  async function prepareMixer() {
    if (mediaVolumeSupported) return;
    if (mixerUnavailable) throw new Error('Quiet playback is unavailable.');
    if (!mixer) {
      if (!Context) {host.dataset.gainControl = 'unavailable'; throw new Error('Quiet playback is unavailable.');}
      let context; const channels = [];
      try {
        context = new Context();
        for (const deck of decks) {
          const source = context.createMediaElementSource(deck.audio), gain = context.createGain();
          gain.gain.value = 0; source.connect(gain); gain.connect(context.destination); channels.push({source, gain});
          try {deck.audio.volume = 1;} catch { /* Hardware-controlled volume uses the gain node. */ }
        }
        mixer = {context, channels}; apply();
      } catch (error) {
        mixerUnavailable = true; host.dataset.gainControl = 'unavailable';
        for (const channel of channels) {channel.source.disconnect();channel.gain.disconnect();}
        context?.close().catch(()=>{}); throw error;
      }
    }
    if (mixer.context.state === 'suspended') {
      // Some mobile browsers leave resume pending until a trusted gesture.
      // Do not start the element at hardware volume while waiting for it.
      let delay;
      try {
        await Promise.race([mixer.context.resume(), new Promise((_, reject) => {delay = defer(() => reject(new DOMException('Tap to enable quiet playback.', 'NotAllowedError')), 600);})]);
      } finally {cancelDelay(delay);}
    }
    if (mixer.context.state !== 'running') throw new DOMException('Tap to enable quiet playback.', 'NotAllowedError');
  }

  function emit(next = state, message = notice) {
    state = next; notice = message;
    host.dataset.musicState = state; host.dataset.track = decks[active].track || requestedTrack;
    host.dataset.requestedTrack = requestedTrack;
    host.dataset.crossfading = String(transitioning);
    if (!disposed) onChange({state, notice, enabled, track: decks[active].track, requestedTrack});
  }
  function identify() {
    decks.forEach((deck, index) => {deck.audio.id = index === active ? 'portfolio-background-music' : 'portfolio-background-music-buffer'; deck.audio.dataset.active = String(index === active);});
  }
  function apply() {
    for (const [index, deck] of decks.entries()) {
      const value = clamp(master * deck.gain);
      if (mediaVolumeSupported) deck.audio.volume = value;
      else if (mixer) mixer.channels[index].gain.gain.value = isMuted ? 0 : value;
      deck.audio.muted = isMuted;
      deck.audio.dataset.gain = deck.gain.toFixed(5);
    }
    host.dataset.masterVolume = master.toFixed(5);
  }
  function finishRamp(name, success = false) {
    const ramp = name === 'gain' ? gainRamp : masterRamp;
    if (name === 'gain') gainRamp = undefined; else masterRamp = undefined;
    ramp?.resolve(success);
  }
  function stopTimerIfIdle() {if (!gainRamp && !masterRamp && timer !== undefined) {unschedule(timer); timer = undefined;}}
  function tick() {
    const time = now();
    if (masterRamp) {
      const ramp = masterRamp, progress = clamp((time - ramp.start) / ramp.duration);
      master = progress === 1 ? ramp.to : ramp.from + (ramp.to - ramp.from) * smooth(progress);
      if (progress === 1) finishRamp('master', true);
    }
    if (gainRamp) {
      const ramp = gainRamp, progress = clamp((time - ramp.start) / ramp.duration);
      decks.forEach((deck, index) => {deck.gain = blendMusicGain(ramp.from[index], ramp.to[index], progress);});
      if (progress === 1) finishRamp('gain', true);
    }
    apply(); stopTimerIfIdle();
  }
  function animate(name, to, duration) {
    tick(); finishRamp(name);
    const promise = new Promise(resolve => {
      const ramp = {from: name === 'gain' ? decks.map(deck => deck.gain) : master, to, start: now(), duration: Math.max(1, duration), resolve};
      if (name === 'gain') gainRamp = ramp; else masterRamp = ramp;
    });
    if (timer === undefined) timer = schedule(tick, 25);
    return promise;
  }
  function save(deck, ended = false) {
    if (deck.track && deck.restored && Number.isFinite(deck.audio.currentTime)) onPosition(deck.track, ended ? 0 : Math.max(0, deck.audio.currentTime));
  }
  function restore(deck) {
    if (deck.restored || !Number.isFinite(deck.audio.duration) || deck.audio.duration <= 0) return;
    try {deck.audio.currentTime = Math.min(deck.seek, Math.max(0, deck.audio.duration - .2)); deck.restored = true;} catch { /* Metadata may precede a seekable media range. */ }
  }
  function clearDeck(deck) {
    save(deck); deck.gain = 0; apply(); deck.audio.pause();
  }
  function load(deck, file, position = 0, preload = 'metadata') {
    if (deck.track === file) {if (deck.audio.paused) {deck.seek = Math.max(0, Number(position) || 0); deck.restored = false;} restore(deck); return;}
    clearDeck(deck); deck.track = file; deck.seek = Math.max(0, Number(position) || 0); deck.restored = false;
    deck.audio.dataset.track = file; deck.audio.preload = preload; deck.audio.src = '/assets/music/' + file; deck.audio.load(); restore(deck);
  }
  function cancelPending() {if (pending) {pending.cancel(); pending = undefined;}}
  function playDeck(deck, token) {
    let cancel;
    const canceled = new Promise((_, reject) => {cancel = () => reject(new DOMException('Music request superseded.', 'AbortError'));});
    let timeout;
    const timedOut = new Promise((_, reject) => {timeout = defer(() => reject(new Error('Music did not become ready.')), 10_000);});
    let fail;
    const failed = new Promise((_, reject) => {fail = () => reject(new Error('Music could not be loaded.'));});
    const onError = () => fail();
    deck.audio.addEventListener('error', onError, {once: true});
    pending = {deck, token, cancel};
    const attempt = {valid: true}; deck.playAttempt = attempt;
    const played = Promise.resolve().then(async () => {await prepareMixer(); if (!attempt.valid || token !== generation || disposed) throw new DOMException('Music request superseded.', 'AbortError'); restore(deck); return deck.audio.play();}).then(() => {if ((!attempt.valid || token !== generation) && deck.playAttempt === attempt) clearDeck(deck);});
    return Promise.race([played, canceled, timedOut, failed]).catch(error => {attempt.valid = false; throw error;}).finally(() => {
      cancelDelay(timeout); deck.audio.removeEventListener('error', onError);
      if (pending?.token === token) pending = undefined;
    });
  }
  async function settle(token, preferActive = false) {
    if (!transitioning && !gainRamp && decks[1 - active].gain < .0001) return;
    const keeper = !preferActive && decks[1 - active].gain > decks[active].gain && !decks[1 - active].audio.paused ? 1 - active : active;
    const changed = keeper !== active; active = keeper; identify(); transitioning = false;
    if (changed) onTrack(decks[active].track);
    const complete = await animate('gain', decks.map((_, index) => Number(index === active)), MUSIC_FADES.settle);
    if (!complete || token !== generation || disposed) return;
    clearDeck(decks[1 - active]);
  }
  async function select(file, {position = positions[file] || 0, natural = false} = {}) {
    if (disposed || !files.includes(file)) return false;
    requestedTrack = file; const token = ++generation; cancelPending(); notice = '';
    await settle(token);
    if (token !== generation || disposed) return false;
    const outgoing = decks[active];
    if (outgoing.track === file && !outgoing.audio.ended) {emit(enabled ? 'playing' : 'paused', ''); return true;}
    const incoming = decks[1 - active];
    if (!enabled) {
      clearDeck(outgoing); load(incoming, file, position); active = 1 - active;
      decks[active].gain = 1; identify(); apply(); onTrack(file); emit('paused', ''); return true;
    }
    load(incoming, file, position, 'auto'); incoming.gain = 0; apply(); emit('buffering', '');
    try {
      await playDeck(incoming, token);
      if (token !== generation || disposed || !enabled) {if (token === generation) clearDeck(incoming); return false;}
      const outgoingIndex = active; save(outgoing); active = 1 - active; identify(); onTrack(file);
      if (master < .000001 && targetVolume > 0 && !masterRamp) animate('master', targetVolume, MUSIC_FADES.play);
      transitioning = !outgoing.audio.paused && !outgoing.audio.ended;
      emit(transitioning ? 'crossfading' : 'playing', '');
      const complete = await animate('gain', decks.map((_, index) => Number(index === active)), transitioning ? MUSIC_FADES.track : MUSIC_FADES.play);
      if (!complete || token !== generation || disposed) return false;
      clearDeck(decks[outgoingIndex]); if (natural) {outgoing.restored = false; onPosition(outgoing.track, 0);}
      transitioning = false; emit('playing', ''); return true;
    } catch (error) {
      if (token !== generation || disposed) return false;
      clearDeck(incoming); requestedTrack = outgoing.track; onTrack(outgoing.track);
      if (!outgoing.audio.paused && !outgoing.audio.ended) {
        outgoing.gain = 1; apply(); emit('playing', 'The next track could not start. The current track is still playing.');
      } else {emit(error.name === 'NotAllowedError' ? 'blocked' : 'error', ''); if (error.name === 'NotAllowedError') onBlocked();}
      return false;
    }
  }
  async function play() {
    if (disposed) return;
    if (enabled && ['playing','crossfading'].includes(state) && !decks[active].audio.paused && !pending) return;
    const token = ++generation; cancelPending(); finishRamp('master'); enabled = true; notice = '';
    await settle(token, true);
    if (token !== generation || disposed) return;
    const deck = decks[active]; if (deck.audio.paused) master = 0; deck.gain = 1; apply(); emit('starting', '');
    try {
      await playDeck(deck, token);
      if (token !== generation || disposed || !enabled) return;
      animate('master', targetVolume, MUSIC_FADES.play); emit('playing', '');
    } catch (error) {
      if (token !== generation || disposed) return;
      emit(error.name === 'NotAllowedError' ? 'blocked' : error.name === 'AbortError' ? 'paused' : 'error', '');
      if (error.name === 'NotAllowedError') onBlocked();
    }
  }
  async function pause({immediate = false} = {}) {
    if (disposed) return;
    enabled = false; const token = ++generation; cancelPending(); requestedTrack = decks[active].track; transitioning = false; finishRamp('gain');
    snapshot(); emit('paused', '');
    if (!immediate) {const complete = await animate('master', 0, MUSIC_FADES.pause); if (!complete || token !== generation || disposed) return;}
    else {finishRamp('master'); master = 0; apply();}
    decks.forEach((deck, index) => {deck.audio.pause(); deck.gain = Number(index === active);}); apply(); stopTimerIfIdle();
  }
  function setVolume(value) {targetVolume = clamp(value); if (enabled) animate('master', targetVolume, MUSIC_FADES.volume); else if (!masterRamp) {master = 0; apply();}}
  function setMuted(value) {
    const next = Boolean(value); if (next === isMuted) return;
    isMuted = next;
    if (!enabled) {finishRamp('master'); master = 0; decks.forEach(deck => deck.audio.pause()); apply(); stopTimerIfIdle();}
    else if (next) apply();
    else {master = 0; apply(); animate('master', enabled ? targetVolume : 0, MUSIC_FADES.unmute);}
    emit();
  }
  function snapshot() {decks.forEach(deck => save(deck));}
  function next(deck, ended = false) {
    if (disposed || !enabled || deck !== decks[active] || pending || transitioning) return;
    const duration = deck.audio.duration, remaining = duration - deck.audio.currentTime;
    if (!ended && (!Number.isFinite(duration) || duration <= 0 || remaining > MUSIC_FADES.track / 1000 || remaining <= 0)) return;
    if (autoFailedFor === deck.track && !ended) return;
    const file = files[(files.indexOf(deck.track) + 1) % files.length];
    if (ended) save(deck, true);
    autoFailedFor = deck.track;
    select(file, {position: 0, natural: true});
  }
  for (const deck of decks) {
    listen(deck.audio, 'loadedmetadata', () => restore(deck)); listen(deck.audio, 'canplay', () => restore(deck));
    listen(deck.audio, 'timeupdate', () => {
      save(deck); next(deck);
      if (enabled && deck === decks[active] && !pending && !transitioning && Number.isFinite(deck.audio.duration) && deck.audio.duration - deck.audio.currentTime < 12) {
        const file = files[(files.indexOf(deck.track) + 1) % files.length];
        if (decks[1 - active].track !== file) load(decks[1 - active], file, 0, 'auto');
      }
    });
    listen(deck.audio, 'ended', () => next(deck, true));
    listen(deck.audio, 'waiting', () => {if (deck === decks[active] && enabled && !pending) emit('buffering');});
    listen(deck.audio, 'playing', () => {if (deck === decks[active] && enabled && !pending && !transitioning && deck.playAttempt?.valid) emit('playing', '');});
    listen(deck.audio, 'error', () => {
      if (pending?.deck === deck || deck !== decks[active] || !enabled) return;
      const outgoing = decks[1 - active];
      if (transitioning && !outgoing.audio.paused && !outgoing.audio.ended) {
        ++generation; finishRamp('gain'); clearDeck(deck); active = 1 - active; identify(); requestedTrack = outgoing.track; onTrack(outgoing.track); transitioning = false;
        animate('gain', decks.map((_, index) => Number(index === active)), MUSIC_FADES.settle); emit('playing', 'The next track could not start. The current track is still playing.');
      } else emit('error', '');
    });
  }
  load(decks[active], requestedTrack, positions[requestedTrack] || 0); decks[active].gain = 1; identify(); apply();
  return {
    host, get audio() {return decks[active].audio;}, get audios() {return decks.map(deck => deck.audio);}, get state() {return state;}, get enabled() {return enabled;}, get notice() {return notice;}, get requestedTrack() {return requestedTrack;}, get crossfading() {return transitioning;},
    play, pause, select, setVolume, setMuted, snapshot,
    dispose() {if (disposed) return; disposed = true; ++generation; cancelPending(); finishRamp('gain'); finishRamp('master'); if (timer !== undefined) unschedule(timer); timer = undefined; for (const remove of listeners) remove(); master = 0; apply(); for (const deck of decks) {deck.audio.pause(); deck.audio.removeAttribute('src'); deck.audio.load();} if (mixer) {for (const channel of mixer.channels) {channel.source.disconnect();channel.gain.disconnect();} mixer.context.close().catch(()=>{});} host.remove();},
  };
}
