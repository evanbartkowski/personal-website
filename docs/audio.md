# Background music

`settings.js` owns saved preferences and controls. `music-player.js` owns a persistent `#portfolio-music-player` host with two hidden audio decks. The active deck has `#portfolio-background-music`; the other has `#portfolio-background-music-buffer`. These IDs switch when an incoming song starts, while both actual elements and the host retain their identities.

Navigation and page cleanup preserve the entire host. Page changes do not pause, reload, recreate, or seek either deck, including during a blend.

Music fades in over 700ms, pauses over 420ms, and crossfades songs over 3.2 seconds. Crossfade gains preserve combined power and use smooth endpoints. Volume changes ramp over 180ms; mute acts immediately on both decks and unmute ramps up quietly. The saved volume remains the target, including zero, and the default is 10%.

The upcoming track preloads near the end of a song. Natural advances start from its beginning; manual selections restore their saved positions. A paused selection stays paused. A failed incoming song leaves the outgoing one available. Generation and per-play attempt guards cancel superseded requests and prevent delayed playback promises from leaving silent decks running. Disposal clears ramps, timeouts, playback, and listeners.

For browsers that do not allow media-element volume changes, the player uses Web Audio gain nodes after playback is permitted. If quiet mixing is unavailable, it keeps playback off. This handles the [platform volume restriction documented by Apple](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/Using_HTML5_Audio_Video/Device-SpecificConsiderations/Device-SpecificConsiderations.html). Autoplay rejection retains the existing click/key retry; an explicit pause remains paused.

Validation:

- `npm test` includes deterministic mixer, overlap, cancellation, timeout, muted-volume fallback, and position tests.
- `npm run test:music` also exercises the browser controls and real muted MP3 overlap through page navigation and natural song advances.
- `node scripts/qa-settings.mjs` and `node scripts/qa-navigation.mjs` verify saved preferences, controls, real decoding, and persistent deck identities.

Tracks remain the MP3s supplied by Evan in `assets/music/`. No audio files are altered by fades or navigation.
