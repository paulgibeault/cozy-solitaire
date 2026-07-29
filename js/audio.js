// audio.js — Sound for cozy-solitaire, via the launcher SDK's `Arcade.audio`.
// This is the game's single audio registration site.
//
// An ES module, unlike its sibling games' plain-script audio.js, because this
// game's own code is a module graph — main.js imports these wrappers directly.
// js/soundpack.js is still a plain <script> in index.html and still has to
// load before this module evaluates; the <script> order there is what
// guarantees it (classic scripts run before module code).
//
// THE PACK IS THE SOUND. js/soundpack.js holds the game's one sound design;
// every cue is a WebAudio node graph built from physical-gesture elements,
// and every cue feeds one shared convolution room — a small panelled card
// room — so overlapping sounds fuse into one place instead of stacking into a
// pile. That pack is rendered to an audition WAV and approved by ear before
// it ships; do not retune it from here.
//
// NO SYNTHESIS LIVES IN THIS GAME. Every gesture the pack is built from is
// an element in the launcher's shared library. What belongs to
// cozy-solitaire is the design — which gestures, how loud, how far away,
// how often — and that is all js/soundpack.js contains. A gesture this
// game needs and the library lacks goes into the library: `flex`, the
// springy-sheet element the whole pack is built on, was added there rather
// than here for exactly that reason, and a page turn or a cloth snap in
// some future game gets it for free.
//
// THERE IS NO FALLBACK. When the pack cannot register — an older cached SDK,
// or standalone without /arcade-audio.js — this module registers nothing and
// the game is silent. That is fleet policy (launcher repo #108), not an
// oversight: chiptune is a sound identity a game adopts on purpose, the way
// pi-game has, never a degraded mode a stale service-worker cache drops into.
// Silence on a stale cache is expected and deliberate, so it is not logged.
// The pre-pack spec-cue profile survives as inert provenance in
// audio/chiptune-archive.mjs; nothing here plays it.
//
// All thirteen wrapper functions answer either way: `Arcade.audio.play` on a
// name with nothing registered resolves no cue and returns, so no call site
// in the game has to know whether the pack is live.
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
// is worse than silence, so registration is gated on the pack's actual
// dependencies rather than on a version number.
const NEEDED_ELEMENTS = ['flex', 'strike', 'thump', 'pluck', 'cents', 'between'];

function audio() {
  return (typeof window !== 'undefined' && window.Arcade && window.Arcade.audio)
    ? window.Arcade.audio
    : null;
}

function pack() {
  return (typeof window !== 'undefined' && window.ArcadeSoundPack) || null;
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
  }
  // Not graphable: register nothing, and the game is silent. Stale cached SDK,
  // or standalone without /arcade-audio.js. Expected, not a bug — no console
  // noise. (See THERE IS NO FALLBACK above.)
})();

// ─── A2 — the play wrappers ─────────────────────────────────────────────────
// Silent no-ops — never throws, these are called from the input path — when
// Arcade.audio is absent, when the launcher has muted, or when the pack did
// not register (play() on a name with no cue behind it resolves nothing and
// returns).

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
