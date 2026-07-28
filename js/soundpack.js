// cozy-solitaire sound pack — the game's own sound design.
//
// Loaded as a plain script after /arcade-audio.js. js/audio.js registers
// everything here with Arcade.audio; the launcher's tools/soundpack renderer
// loads this same file to produce audition WAVs, so what gets approved by ear
// is what plays.
//
// ── the parlor after hours ───────────────────────────────────────────────
// A small, warm, wood-panelled card room: worn felt, a low lamp, nobody in a
// hurry. That is the whole brief, and it is a deliberately different register
// from its two sibling packs — hecknsic is hard bright glass, sow-duku is
// organic outdoor animal, and this is SOFT FIBRE: cardstock, felt, and a
// wooden table under both.
//
// The material is honest but not literal. A real deck close-miked is a harsh,
// clicky, casino-ish thing; every flick has an edge on it. What is here is the
// same gesture rounded off and slowed down — the same caricature move sow-duku
// made turning a hog into a piglet. Realism was tried in the pre-graph profile
// and it is why card-place had to be kept almost inaudible: an honest card is
// unpleasant at the rate this game fires one.
//
// THE GAME IS UNPITCHED, WITH TWO SANCTIONED EXCEPTIONS. Nothing mid-hand is
// an instrument: placing, flipping, dealing, rejecting are all felt, card and
// table. Pitch enters exactly twice — `undo`, because rewinding is not a card
// gesture at all, and `win`, because an ending is allowed to be an instrument
// where a move is not. Both are voiced on `pluck`, so the two exceptions are
// audibly the same instrument, and both were pitched in the pre-graph profile
// too. That boundary is the identity of the pack; do not smudge it by giving
// some mid-game cue a note.
//
// THE LADDER. A card arriving on a foundation rings its RANK: the felt ring's
// band climbs about an octave from ace to king (see `rankHz`). This is
// material pitch, not melody — the same trick squelch plays with grain pitch —
// so it does not break the rule above, but it means the foundations audibly
// climb all game, and the auto-complete cascade turns into four rising
// staircases that hand off into the music box. It is the single biggest
// emotional payoff in the design and the reason `foundation` is its own cue
// rather than a `place` with extra steps.
//
// Contour grammar, unchanged from the fleet: rising is good (flip, foundation,
// cascade, win), falling is over (invalid, pass-limit), discrete steps are
// settled (every landing), a dull edgeless scrape is unsettled (the rejection,
// which is the one gesture in the game with no ring in it at all).
//
// Thirteen cues:
//
//   place       a card lands              felt, table, done
//   foundation  a card lands home         a landing plus its rank
//   flip        a face-down turns up      the card's own body, stepping up
//   lift        a drag begins             a corner peeling off felt
//   run-place   a run lands               several sheets, then one landing
//   invalid     the move is refused       a dull scrape and a droop
//   pass-limit  no passes left            the same, lower and final
//   recycle     the waste turns over      a packet squared and set down
//   deal        a new game                the one flourish: a riffle
//   auto-place  a cascade tick            place plus the ladder, disciplined
//   sequence    a spider run completes    thirteen cards and the whole ladder
//   undo        a move taken back         a warm note gliding down (pitched)
//   win         the game is out           a music box, then the deck away
//
// Register plan, so simultaneous cues occupy different bands:
//   table/thump 60–320 · felt landing 500–1100 · rank ladder 720–1550
//   card body 900–2400 · riffle 900–1900 · snaps 1500–4100
//   music box 520–2400 · undo glide 200–300
//
// Every cue takes an `r` (seeded random stream) and varies pitch, timing and
// content per play — but NEVER LEVEL. That rule is inherited, not rediscovered:
// sow-duku paid for it twice (density-varied grain clouds landing on loud
// outliers, coin-flip layers digging 6 dB holes), and the flex element is
// peak-normalised per sheet for exactly this reason — `flaps` and `count` are
// texture controls, not hidden volume controls.

(function (global) {
  'use strict';
  const S = global.ArcadeAudioElements;

  // Every cue here is built from the element library's gestures, so with the
  // library absent — a stale service-worker cache, or running standalone off
  // the launcher origin — there is nothing registrable and the game's audio
  // module takes its fallback path. Bail before dereferencing S: this file is
  // a plain script, and a throw here would surface as a page error even though
  // the fallback itself works. Also covers an OLDER library that predates
  // registerPack, which is the same stale-cache scenario one version on.
  if (!S || typeof S.registerPack !== 'function') return;

  // A small paneled room with soft furnishings: more reflective than
  // sow-duku's open yard, far deader than hecknsic's glass box, and warmer
  // than either — the high shelf is the single biggest lever for "parlor"
  // rather than "kitchen table".
  const ROOM = {
    dur: 0.90,
    decay: 0.26,
    preDelay: 0.011,
    wet: 0.34,
    shelfHz: 3800,
    shelfDb: -6,
    seed: 4177,
  };

  // How much room each cue sits in — really a statement about distance. The
  // table is directly under your hands, so touch cues are nearly dry; the
  // verdicts and the ending get air.
  const SENDS = {
    'place': 0.07,
    'foundation': 0.09,
    'flip': 0.07,
    'lift': 0.05,
    'run-place': 0.10,
    'invalid': 0.06,
    'pass-limit': 0.10,
    'recycle': 0.11,
    'deal': 0.12,
    'auto-place': 0.08,
    'sequence': 0.14,
    'undo': 0.12,
    'win': 0.17,
  };

  // Levels, by role. Balanced as a set — retune here, not inside a cue. The
  // workhorse touch cues sit at TOUCH and everything else is placed relative
  // to it, because `place` and `flip` are what the player actually hears
  // thousands of times and everything else has to live beside them.
  const TOUCH = 0.135;    // a card onto felt — the reference level
  const GRAZE = 0.072;    // a corner lifting; half a gesture and feels it
  const NO = 0.115;       // refused — present, never a buzzer
  const SHUFFLE = 0.100;  // per sheet in a riffle; many of them at once
  const REWIND = 0.115;   // undo, the small pitched exception
  const RUN = 0.185;      // a spider sequence completing — the big one
  const FANFARE = 0.145;  // one note of the music box

  // The win fires from inside the same handler as the placement that caused
  // it (both call sites in main.js), so without a pre-roll it starts
  // underneath the landing instead of after it.
  const WAIT_WIN = 0.45;

  // ── materials ─────────────────────────────────────────────────────────
  // Two presets, not three: unlike hecknsic's board there is only one
  // physical object in this game, seen from two angles — the sheet itself
  // (flipped, lifted, riffled) and the sheet meeting the table (landing).
  // FELT is dark, dead and low; CARDSTOCK is defined and bright.
  const FELT = { stiffness: 0.42, f0: 820, snap: 0.45, flaps: 3 };
  const CARDSTOCK = { stiffness: 0.82, f0: 1450, snap: 0.75, flaps: 4 };

  // The rank ladder: ace low, king high, a little over an octave across the
  // thirteen. Deliberately not a scale — it is where the felt ring's band
  // sits, so it reads as a brighter or duller card rather than as a note.
  const rankHz = (order) => 720 * Math.pow(2, (Math.max(1, Math.min(13, order || 1)) - 1) / 11.2);

  // A card arriving on a pile: the contact, the sheet settling, and the table
  // taking the weight. hecknsic composes `strike + body` into a knock for the
  // same reason — a landing is three things arriving together, and any one of
  // them alone reads as a synth.
  function land(ctx, o, t, r, gain) {
    const g = gain == null ? TOUCH : gain;
    S.strike(ctx, o, t, {
      dur: S.between(r, 0.003, 0.005), hp: S.between(r, 2400, 2900),
      gain: g * 0.45, seed: (r() * 1e6) | 0,
    });
    S.flex(ctx, o, t + 0.001, {
      dur: S.between(r, 0.055, 0.068), flaps: FELT.flaps, accel: 2.4,
      stiffness: FELT.stiffness, f0: FELT.f0 * S.cents(r, 110), snap: FELT.snap,
      gain: g, seed: (r() * 1e6) | 0,
    });
    S.thump(ctx, o, t + S.between(r, 0.004, 0.009), {
      f0: S.between(r, 88, 98), f1: S.between(r, 64, 72),
      dur: S.between(r, 0.055, 0.070), attack: 0.012,
      gain: g * 0.30, seed: (r() * 1e6) | 0,
    });
    return 0.25;
  }

  // The rank ring — the ladder's voice. A short bright sheet-flex whose band
  // is the card's rank. Rides on top of a landing; never fires alone.
  function rankRing(ctx, o, t, r, order, gain) {
    S.flex(ctx, o, t, {
      dur: S.between(r, 0.042, 0.055), flaps: 4, accel: 2.0,
      stiffness: 0.86, f0: rankHz(order) * S.cents(r, 45), snap: 0.30,
      gain: gain, seed: (r() * 1e6) | 0,
    });
  }

  const CUES = {
    // A card lands on a pile — tableau, waste, a stock deal. The workhorse:
    // it fires more than everything else combined, so it is deliberately the
    // least characterful thing in the game. Variation ranges stay narrow;
    // level does not move at all.
    'place': function (ctx, o, t, params, r) {
      return land(ctx, o, t, r);
    },

    // A card lands HOME. Everything `place` does, plus the rank ringing on
    // top — the same gesture with a result attached. Pass `rank` (1–13) to
    // put it on the ladder; without one it still lands, just flat.
    'foundation': function (ctx, o, t, params, r) {
      land(ctx, o, t, r);
      rankRing(ctx, o, t + S.between(r, 0.010, 0.016), r,
        (params && params.rank) || 1, TOUCH * 0.52);
      return 0.3;
    },

    // A face-down card is turned up. Same material as a landing, opposite
    // gesture: no table under it (nothing is set down — a card is turned
    // over), a sharper snap, and the card's own body rather than the felt.
    // A second tiny flex a beat later and much higher makes it two steps
    // going UP, which is what separates a reveal from a placement without
    // making it louder.
    'flip': function (ctx, o, t, params, r) {
      S.strike(ctx, o, t, {
        dur: S.between(r, 0.0025, 0.004), hp: S.between(r, 3000, 3600),
        gain: TOUCH * 0.40, seed: (r() * 1e6) | 0,
      });
      S.flex(ctx, o, t, {
        dur: S.between(r, 0.045, 0.056), flaps: CARDSTOCK.flaps, accel: 2.6,
        stiffness: CARDSTOCK.stiffness, f0: CARDSTOCK.f0 * S.cents(r, 100),
        snap: CARDSTOCK.snap, gain: TOUCH * 0.92, seed: (r() * 1e6) | 0,
      });
      S.flex(ctx, o, t + S.between(r, 0.016, 0.024), {
        dur: S.between(r, 0.030, 0.040), flaps: 3, accel: 2.2,
        stiffness: 0.88, f0: S.between(r, 2050, 2300), snap: 0.35,
        gain: TOUCH * 0.34, seed: (r() * 1e6) | 0,
      });
      return 0.22;
    },

    // A drag begins: one corner peeling off the felt. The smallest thing in
    // the game by a distance — no snap at all, two soft flaps, and gone. It
    // has to survive being triggered on every aborted drag without ever
    // becoming a click track, which is why it is a single tiny gesture.
    'lift': function (ctx, o, t, params, r) {
      S.flex(ctx, o, t, {
        dur: S.between(r, 0.038, 0.050), flaps: 2, accel: 1.6,
        stiffness: 0.34, f0: S.between(r, 640, 760), snap: 0,
        gain: GRAZE, seed: (r() * 1e6) | 0,
      });
      return 0.12;
    },

    // A run of cards lands as one. The sheets arrive first — a short packet
    // riffling closed, DECELERATING (`end` > 1) because a run being placed
    // settles rather than being flung — and then the whole thing lands once.
    // `count` scales the packet but is capped at eight: a twelve-card spider
    // run and an eight-card one should differ in weight, not turn into a drum
    // roll. Per-sheet level is well under a single landing so a big run is
    // fuller, never louder.
    'run-place': function (ctx, o, t, params, r) {
      const n = Math.max(2, Math.min(8, Math.round((params && params.count) || 2)));
      S.flex(ctx, o, t, {
        count: n, rate: S.between(r, 30, 34), end: 1.55,
        dur: S.between(r, 0.045, 0.056), flaps: 3, accel: 2.2,
        stiffness: 0.70, f0: S.between(r, 1080, 1220), snap: 0.50,
        gain: SHUFFLE * 0.62, seed: (r() * 1e6) | 0,
      });
      // clear of the last sheet, not on top of it — landing exactly as the
      // packet closes stacks the two transients into one hot peak
      land(ctx, o, t + n / 31 + 0.05, r);
      return 0.5;
    },

    // The move is refused. The one gesture in the game with NO ring in it:
    // a soft dead scrape (snap 0, stiffness right down, so the sheet never
    // springs back) and a low droop under it. Quiet and quickly over —
    // six in a row have to stay disappointment rather than scolding.
    'invalid': function (ctx, o, t, params, r) {
      S.flex(ctx, o, t, {
        dur: S.between(r, 0.075, 0.095), flaps: 3, accel: 1.3,
        stiffness: 0.20, f0: S.between(r, 440, 510), snap: 0, lp: 780,
        gain: NO, seed: (r() * 1e6) | 0,
      });
      S.thump(ctx, o, t + S.between(r, 0.008, 0.014), {
        f0: S.between(r, 146, 158), f1: S.between(r, 126, 134),
        dur: S.between(r, 0.115, 0.135), attack: 0.014,
        gain: NO * 0.50, seed: (r() * 1e6) | 0,
      });
      return 0.32;
    },

    // No passes left — the deck is spent. Same material as a refusal, but
    // longer, lower and with a real drop in it: a refusal says "not there",
    // this says "not any more". These two must stay tellable apart blind,
    // which is why the interval is a fifth rather than a whole tone.
    'pass-limit': function (ctx, o, t, params, r) {
      S.flex(ctx, o, t, {
        dur: S.between(r, 0.095, 0.115), flaps: 3, accel: 1.2,
        stiffness: 0.18, f0: S.between(r, 380, 440), snap: 0, lp: 700,
        gain: NO * 0.95, seed: (r() * 1e6) | 0,
      });
      S.thump(ctx, o, t + S.between(r, 0.010, 0.018), {
        f0: S.between(r, 168, 180), f1: S.between(r, 108, 116),
        dur: S.between(r, 0.30, 0.35), attack: 0.022,
        gain: NO * 0.72, seed: (r() * 1e6) | 0,
      });
      return 0.55;
    },

    // The waste turns back into the stock: a packet gathered, squared and set
    // down. Ten sheets DECELERATING into a soft thump — the deceleration is
    // what makes it read as tidying up rather than as another riffle, and the
    // thump at the end is the stack meeting the table.
    'recycle': function (ctx, o, t, params, r) {
      S.flex(ctx, o, t, {
        count: 10, rate: S.between(r, 21, 24), end: 1.75,
        dur: S.between(r, 0.050, 0.062), flaps: 3, accel: 2.0,
        stiffness: 0.55, f0: S.between(r, 850, 960), snap: 0.42,
        gain: SHUFFLE * 0.58, seed: (r() * 1e6) | 0,
      });
      S.thump(ctx, o, t + S.between(r, 0.46, 0.50), {
        f0: S.between(r, 82, 92), f1: S.between(r, 58, 66),
        dur: 0.10, attack: 0.016, gain: TOUCH * 0.55, seed: (r() * 1e6) | 0,
      });
      S.flex(ctx, o, t + S.between(r, 0.47, 0.51), {
        dur: 0.07, flaps: 4, accel: 2.4, stiffness: 0.5,
        f0: 760, snap: 0.3, gain: SHUFFLE * 0.5, seed: (r() * 1e6) | 0,
      });
      return 0.75;
    },

    // A new game. The one flourish the pack allows itself: a real riffle,
    // sixteen sheets ACCELERATING (`end` < 1 — a packet let go, the opposite
    // curve to `recycle`'s settling), and then the first few cards landing
    // out of it. Once per game, so it can afford to be a gesture.
    'deal': function (ctx, o, t, params, r) {
      S.flex(ctx, o, t, {
        count: 16, rate: S.between(r, 32, 36), end: 0.68,
        dur: S.between(r, 0.045, 0.055), flaps: 3, accel: 2.3,
        stiffness: 0.72, f0: S.between(r, 1180, 1320), snap: 0.55,
        gain: SHUFFLE * 0.52, seed: (r() * 1e6) | 0,
      });
      let at = S.between(r, 0.42, 0.46);
      for (let i = 0; i < 3; i++) {
        land(ctx, o, t + at, r, TOUCH * (0.80 - i * 0.06));
        at += S.between(r, 0.085, 0.115);
      }
      return 0.9;
    },

    // A cascade tick — `foundation` with the discipline turned all the way up.
    // It fires every 100 ms for up to fifty cards, and ten a second is a
    // different problem from one: three ticks are always sounding at once, and
    // a low layer is what stacks worst when they do.
    //
    // So the table comes out. No thump: during a cascade the cards are going
    // home by themselves rather than being set down by hand, so there is no
    // weight to carry — and dropping it keeps the whole run measuring level
    // with a single placement instead of building into a rumble. What is left
    // is contact, sheet and rank: light, quick, climbing. Which is what the
    // moment is.
    'auto-place': function (ctx, o, t, params, r) {
      S.strike(ctx, o, t, {
        dur: S.between(r, 0.0028, 0.004), hp: S.between(r, 2500, 2850),
        gain: TOUCH * 0.30, seed: (r() * 1e6) | 0,
      });
      S.flex(ctx, o, t + 0.001, {
        dur: S.between(r, 0.040, 0.048), flaps: 3, accel: 2.4,
        stiffness: FELT.stiffness, f0: FELT.f0 * S.cents(r, 70), snap: FELT.snap,
        gain: TOUCH * 0.42, seed: (r() * 1e6) | 0,
      });
      rankRing(ctx, o, t + 0.011, r, (params && params.rank) || 1, TOUCH * 0.40);
      return 0.28;
    },

    // A spider run completes: thirteen cards leave the column as one and the
    // whole rank ladder goes off underneath them. The biggest sound in the
    // game short of winning, and until now it had none at all. Three things
    // in sequence — the run sweeping off (accelerating, it is being lifted
    // clear), the ladder running ace to king, and the packet landing home.
    'sequence': function (ctx, o, t, params, r) {
      S.flex(ctx, o, t, {
        count: 13, rate: S.between(r, 40, 45), end: 0.72,
        dur: S.between(r, 0.042, 0.052), flaps: 3, accel: 2.4,
        stiffness: 0.75, f0: S.between(r, 1150, 1280), snap: 0.50,
        gain: SHUFFLE * 0.55, seed: (r() * 1e6) | 0,
      });
      // the ladder, ace to king, quick enough to read as one rising figure.
      // Rings are the only layer here that stacks, and they are short and
      // high — no low end to sum — so this can be the loudest thing in the
      // game short of the win without going near the cascade's problem.
      const step = S.between(r, 0.030, 0.034);
      const t0 = t + S.between(r, 0.13, 0.16);
      for (let i = 0; i < 13; i++) {
        rankRing(ctx, o, t0 + i * step, r, i + 1, RUN * 0.62);
      }
      land(ctx, o, t0 + 13 * step + 0.05, r, TOUCH * 1.15);
      return 1.0;
    },

    // Undo — the first of the two pitched moments, and the older of them:
    // the pre-graph profile made undo the one purely tonal cue for the same
    // reason this does. Rewinding is not a card touching felt, it is the game
    // itself moving, so it carries no material at all. A warm plucked note
    // gliding down a fifth: `bend` is a real playback-rate glide, so the note
    // sags rather than stepping. Same instrument as the win, an octave and a
    // half below it and over in a quarter second.
    'undo': function (ctx, o, t, params, r) {
      S.pluck(ctx, o, t, {
        freq: S.between(r, 292, 308), bend: S.between(r, 0.64, 0.69),
        dur: S.between(r, 0.26, 0.30), damping: 0.9928, tone: 1700,
        gain: REWIND, seed: (r() * 1e6) | 0,
      });
      return 0.4;
    },

    // THE WIN — a music box, and then the deck put away.
    //
    // The pre-graph profile's win was an ascending C-E-G-C arpeggio voiced as
    // a music box; that shape survives because it was right. What is new is
    // that it is a plucked comb rather than four sine tones, that each note is
    // preceded by the tick of its own tooth — so the instrument is audibly
    // sitting on the same table as the cards, not floating above the game —
    // and that the timing has a little mechanical wow in it, because a real
    // box is a cylinder with imperfect pins.
    //
    // Then the parlor tidies up: the cards gathered, and the deck set down.
    // The game does not end on a ringing note, it ends on the table.
    //
    // Waits WAIT_WIN so the whole thing starts in clear air after the last
    // card lands.
    'win': function (ctx, o, t, params, r) {
      const t0 = t + WAIT_WIN;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      const holds = [0.9, 0.9, 1.0, 2.0];
      let at = 0;
      for (let i = 0; i < 4; i++) {
        // the tooth: the mechanism, not the note
        S.flex(ctx, o, t0 + at - 0.008, {
          dur: 0.020, flaps: 2, accel: 2.0, stiffness: 0.9,
          f0: S.between(r, 2600, 3100), snap: 0.55,
          gain: FANFARE * 0.16, seed: (r() * 1e6) | 0,
        });
        S.pluck(ctx, o, t0 + at, {
          freq: notes[i] * S.cents(r, 8), dur: holds[i],
          damping: 0.9948, tone: 2400,
          gain: FANFARE * (1.0 - i * 0.05), seed: (r() * 1e6) | 0,
        });
        at += S.between(r, 0.125, 0.155);   // the cylinder's wow
      }
      // the deck gathered and set down — the game ends on the table
      S.flex(ctx, o, t0 + S.between(r, 1.15, 1.22), {
        count: 7, rate: S.between(r, 24, 27), end: 1.7,
        dur: 0.055, flaps: 3, accel: 2.0, stiffness: 0.6,
        f0: S.between(r, 880, 990), snap: 0.40,
        gain: SHUFFLE * 0.45, seed: (r() * 1e6) | 0,
      });
      S.thump(ctx, o, t0 + S.between(r, 1.50, 1.56), {
        f0: S.between(r, 78, 88), f1: S.between(r, 54, 62),
        dur: 0.16, attack: 0.020, gain: TOUCH * 0.62, seed: (r() * 1e6) | 0,
      });
      return WAIT_WIN + 2.4;
    },
  };

  // Published under the framework's well-known handle (arcade-audio.js
  // registerPack) so the game's audio module and the launcher's soundpack
  // toolchain both reach it without either side knowing this game's name.
  S.registerPack({ name: 'cozy-solitaire', ROOM, SENDS, CUES });
})(typeof window !== 'undefined' ? window : globalThis);
