// audio.js — Sound for cozy-solitaire, via the launcher SDK's `Arcade.audio`.
// This is the game's single audio registration site.
//
// An ES module, unlike its sibling games' plain-script audio.js, because this
// game's own code is a module graph — main.js imports these wrappers directly.
// js/soundpack.js is still a plain <script> in index.html and still has to
// load before this module evaluates; the <script> order there is what
// guarantees it (classic scripts run before module code).
//
// Two registration paths live here:
//
//   GRAPH PATH (the SDK's /arcade-audio.js companion loaded) — the real sound
//     design. js/soundpack.js holds the pack; every cue is a WebAudio node
//     graph built from physical-gesture elements, and every cue feeds one
//     shared convolution room — a small panelled card room — so overlapping
//     sounds fuse into one place instead of stacking into a pile. That pack is
//     rendered to an audition WAV and approved by ear before it ships; do not
//     retune it from here.
//
//     NO SYNTHESIS LIVES IN THIS GAME. Every gesture the pack is built from is
//     an element in the launcher's shared library. What belongs to
//     cozy-solitaire is the design — which gestures, how loud, how far away,
//     how often — and that is all js/soundpack.js contains. A gesture this
//     game needs and the library lacks goes into the library: `flex`, the
//     springy-sheet element the whole pack is built on, was added there rather
//     than here for exactly that reason, and a page turn or a cloth snap in
//     some future game gets it for free.
//
//   FALLBACK PATH (older cached SDK, or standalone without /arcade-audio.js) —
//     the archived spec-cue profile, frozen from js/sfx.js as it stood at the
//     end of the card-table retune. Oscillator-plus-envelope voices: the only
//     thing an `Arcade.audio` without the elements library can play. It exists
//     because a player on a stale service-worker cache should get the old
//     sound rather than silence; that is an expected state, not an error, so
//     it is not logged.
//
//     Its BODIES are frozen — that profile was tuned as a whole. Its KEYS are
//     not: they track whatever the wrappers below call, so the cues the pack
//     renamed or added map onto the nearest archived body rather than going
//     silent. A stale cache hearing the old sound is the point; a stale cache
//     hearing nothing because a key drifted is a bug.
//
// Both paths answer the same thirteen wrapper functions, so no call site in
// the game has to know which one is live.
//
// Conventions (fleet Arcade.audio conventions, launcher GAME_INTEGRATION.md §5):
//   A1 — cues are registered ONCE, here, at module load. Audio is purely
//        local, so no `await Arcade.ready` is needed.
//   A2 — every play-site in the game goes through a wrapper below, which is a
//        pure feature detect. cozy-solitaire has NO in-game sound setting.
//   A3 — the launcher owns volume and the global mute; this module adds no
//        control of its own. `play()` is free and silent when muted.
//   A4 — cue names are lowercase and event-shaped.

const CUE_NAMES = [
  'place', 'foundation', 'flip', 'lift', 'run-place', 'invalid', 'pass-limit',
  'recycle', 'deal', 'auto-place', 'sequence', 'undo', 'win',
];

// The gestures and APIs the pack is built out of. A cached older SDK or
// element library may have graph() and el() but not these, and a missing
// element would throw from inside a cue at play time — a cue that half-plays
// is worse than the fallback profile, so the graph path is gated on the pack's
// actual dependencies rather than on a version number.
const NEEDED_ELEMENTS = ['flex', 'strike', 'thump', 'pluck', 'cents', 'between'];

function audio() {
  return (typeof window !== 'undefined' && window.Arcade && window.Arcade.audio)
    ? window.Arcade.audio
    : null;
}

function pack() {
  return (typeof window !== 'undefined' && window.CozySolitairePack) || null;
}

// The one guarded play-site, so the feature check lives in exactly one place.
// Must never throw: these are called from the input path.
function sfx(name, params) {
  const a = audio();
  if (a) a.play(name, params);
}

function registerPack(a, p) {
  a.room(p.ROOM);                       // one room for the whole game
  CUE_NAMES.forEach((name) => {
    if (p.CUES[name]) a.graph(name, p.CUES[name], { send: p.SENDS[name] });
  });
}

// ─── fallback: the archived spec-cue profile ────────────────────────────────
// Frozen from js/sfx.js at the end of the card-table retune. Keep these bodies
// in sync with that archive rather than editing them here.
function registerSpecCues(a) {
  // A card lands on a pile. The workhorse — also the auto-complete cascade —
  // so it is the softest of the card cues: a brief felt-scuff under a low
  // triangle that settles. The noise transient always leads; the tone follows
  // via `delay` so the two overlap into one event rather than two sounds.
  const place = [
    { type: 'noise',    dur: 0.028, gain: 0.055, attack: 0.002, release: 0.024 },
    { type: 'triangle', freq: 330, dur: 0.06, gain: 0.10, attack: 0.006, release: 0.05, delay: 0.01 },
  ];
  // A face-down tableau card is turned up. Same material, different gesture:
  // shorter and proportionally louder noise (a flick, not a landing), tone a
  // fourth higher decaying faster — quicker and crisper without being louder.
  const flip = [
    { type: 'noise', dur: 0.026, gain: 0.085, attack: 0.001, release: 0.022 },
    { type: 'sine',  freq: 494, dur: 0.05,  gain: 0.10,  attack: 0.005, release: 0.042, delay: 0.014 },
  ];
  // A move was rejected. The quietest and lowest cue — a barely-there scuff
  // and a low sine drooping a whole tone. A soft "nope", never a buzzer.
  const invalid = [
    { type: 'noise', dur: 0.02, gain: 0.03, attack: 0.002, release: 0.018 },
    { type: 'sine',  freq: 150, toFreq: 132, dur: 0.11, gain: 0.07, attack: 0.006, release: 0.09, delay: 0.012 },
  ];

  a.cue('place', place);
  a.cue('flip', flip);
  a.cue('invalid', invalid);
  // Undo — a warm downward glide, roughly a fifth. Pure sine, no transient:
  // rewinding is a gesture, not an impact, and the rounder timbre keeps it
  // clear of place's triangle. (The graph path voices this on a plucked
  // string for the same reason, an octave and a half up.)
  a.cue('undo', { type: 'sine', freq: 300, toFreq: 200, dur: 0.12, gain: 0.12, attack: 0.008, release: 0.10 });
  // The ascending arpeggio (C5 · E5 · G5 · C6) voiced as a music box: each
  // note a soft strike whose release spans almost its whole duration, `delay`
  // about half the note length so notes ring into one another. The final C6
  // hangs. The only place this profile goes above 500 Hz.
  a.cue('win', [
    { type: 'sine', freq: 523,  dur: 0.22, gain: 0.15, attack: 0.012, release: 0.20 },
    { type: 'sine', freq: 659,  dur: 0.22, gain: 0.15, attack: 0.012, release: 0.20, delay: 0.11 },
    { type: 'sine', freq: 784,  dur: 0.24, gain: 0.15, attack: 0.012, release: 0.22, delay: 0.11 },
    { type: 'sine', freq: 1047, dur: 0.45, gain: 0.16, attack: 0.014, release: 0.42, delay: 0.12 },
  ]);

  // Cues with no archived body — they postdate the archive, and several of
  // their call sites had no sound at all before the pack. They get the nearest
  // archived body, or a minimal voice in the same idiom, so a stale cache
  // hears something plausible rather than silence.
  a.cue('foundation', place);
  a.cue('auto-place', place);
  a.cue('run-place', place);
  a.cue('sequence', place);
  a.cue('pass-limit', invalid);
  a.cue('lift', [{ type: 'noise', dur: 0.018, gain: 0.022, attack: 0.002, release: 0.016 }]);
  a.cue('recycle', [
    { type: 'noise', dur: 0.05, gain: 0.05, attack: 0.004, release: 0.044 },
    { type: 'noise', dur: 0.06, gain: 0.045, attack: 0.004, release: 0.054, delay: 0.07 },
    { type: 'triangle', freq: 260, dur: 0.08, gain: 0.07, attack: 0.006, release: 0.07, delay: 0.09 },
  ]);
  a.cue('deal', [
    { type: 'noise', dur: 0.07, gain: 0.055, attack: 0.006, release: 0.06 },
    { type: 'noise', dur: 0.06, gain: 0.05, attack: 0.005, release: 0.054, delay: 0.09 },
    { type: 'triangle', freq: 330, dur: 0.07, gain: 0.08, attack: 0.006, release: 0.06, delay: 0.10 },
  ]);
}

// ─── A1 — the single registration site ──────────────────────────────────────
let graphMode = false;

(function registerCues() {
  const a = audio();
  if (!a) return;

  const p = pack();
  const el = (typeof a.el === 'function') ? a.el() : null;
  const graphable =
    !!p &&
    typeof a.graph === 'function' &&
    typeof a.room === 'function' &&
    el !== null &&
    NEEDED_ELEMENTS.every((name) => typeof el[name] === 'function');

  if (graphable) {
    registerPack(a, p);
    graphMode = true;
  } else {
    // Stale cached SDK, or standalone without /arcade-audio.js. Expected, not
    // a bug — no console noise.
    registerSpecCues(a);
  }
})();

// ─── A2 — the play wrappers ─────────────────────────────────────────────────
// Silent no-ops when Arcade.audio is absent or the launcher has muted. The
// params each takes are ignored by the fallback path, which is why they are
// safe to pass unconditionally.

// True when the graph pack registered — for diagnostics and tests; the game
// itself never needs to branch on it.
export function isGraphMode() { return graphMode; }

export function playPlace() { sfx('place'); }
export function playFlip() { sfx('flip'); }
export function playLift() { sfx('lift'); }
export function playInvalid() { sfx('invalid'); }
export function playPassLimit() { sfx('pass-limit'); }
export function playRecycle() { sfx('recycle'); }
export function playDeal() { sfx('deal'); }
export function playUndo() { sfx('undo'); }
export function playWin() { sfx('win'); }
export function playSequence() { sfx('sequence'); }

// `rank` is the card's 1–13 order; it puts the landing on the pack's rank
// ladder, which is what makes a run of foundation cards climb.
export function playFoundation(rank) { sfx('foundation', { rank }); }
export function playAutoPlace(rank) { sfx('auto-place', { rank }); }

// `count` is how many cards moved together; it scales the packet.
export function playRunPlace(count) { sfx('run-place', { count }); }
