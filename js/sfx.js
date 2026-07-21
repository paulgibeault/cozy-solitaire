// sfx.js — gentle managed-WebAudio cues via Arcade.audio (SDK 3.5.0+).
//
// Conventions (fleet Arcade.audio adoption):
//  - A1: one registration site — every cue is declared once at module load,
//    right after Arcade.init (audio is purely local; no need to await
//    Arcade.ready).
//  - A2: one feature-detected wrapper (`sfx`) — every play-site routes through
//    it, so the Arcade/audio guard lives in exactly one place.
//  - A3: NO in-game toggle. The launcher owns volume + the global mute button;
//    this game ships no sound setting, so there is no `soundOn` gate.
//  - A5: conservative, cozy palette — soft sine/triangle voices, short
//    durations, gains <= 0.25. Agents cannot listen to the result, so the
//    aesthetics need a human ear pass.

// Registered one-shot cues. Kept intentionally soft (cozy solitaire).
const CUES = {
  // A card lands on a pile (tableau / foundation / stock deal).
  'card-place':   { type: 'triangle', freq: 330,  dur: 0.06, gain: 0.12, attack: 0.004, release: 0.05 },
  // A face-down tableau card is turned up — brighter, slightly higher.
  'card-flip':    { type: 'sine',     freq: 494,  dur: 0.07, gain: 0.14, attack: 0.004, release: 0.05 },
  // A move/action was rejected — very soft, low, unobtrusive.
  'invalid-move': { type: 'sine',     freq: 150,  dur: 0.10, gain: 0.07, attack: 0.004, release: 0.08 },
  // Undo — a gentle downward glide.
  'undo':         { type: 'triangle', freq: 300, toFreq: 216, dur: 0.09, gain: 0.11, attack: 0.004, release: 0.07 },
};

// Win jingle — a short ascending arpeggio (C5 · E5 · G5 · C6), played as an
// inline sequence so it needs no dedicated cue registration. Sine voices for a
// warm, cozy flourish.
const WIN_JINGLE = [
  { type: 'sine', freq: 523,  dur: 0.12, gain: 0.16 },
  { type: 'sine', freq: 659,  dur: 0.12, gain: 0.16 },
  { type: 'sine', freq: 784,  dur: 0.12, gain: 0.16 },
  { type: 'sine', freq: 1047, dur: 0.20, gain: 0.18 },
];

function audioAvailable() {
  return !!(typeof window !== 'undefined' && window.Arcade && window.Arcade.audio);
}

// A1 — register every cue once, at module load (main.js imports this after the
// index.html inline Arcade.init has run).
if (audioAvailable()) {
  for (const name of Object.keys(CUES)) {
    Arcade.audio.cue(name, CUES[name]);
  }
}

// A2 — the single guarded play-site. `opts` are optional per-play overrides
// (e.g. a per-play `freq`). Silent + cheap when muted or WebAudio is absent.
export function sfx(name, opts) {
  if (audioAvailable()) Arcade.audio.play(name, opts);
}

// Convenience for the win flourish (inline sequence through the same wrapper).
export function playWinJingle() {
  sfx(WIN_JINGLE);
}
