# Migration: move elapsed timer onto `Arcade.session` persistKey

The Arcade SDK's `Arcade.session.start()` now accepts `{ persistKey }`. When set,
the tracker reads its initial elapsed from `Arcade.state[persistKey]` on start,
writes `elapsedMs()` back on suspend / reset / stop, and on `stateReplaced`
re-reads the freshly imported value as the new baseline.

This lets cozy-solitaire drop the `_timerBase` glue and stop carrying `elapsed`
inside the `currentGame` save blob — elapsed isn't really game state, it's
session state.

## Changes

### `js/main.js` — timer glue collapses

- Delete `_timerBase` (line 57) and `getElapsed()` (lines 64-66).
- Rewrite `startTimer` (lines 58-63) to drop the `initialElapsed` parameter —
  session loads its own value:
  ```js
  function startTimer() {
    if (_timer) _timer.stop();
    _timer = Arcade.session.start({ persistKey: 'sessionElapsed' });
    _timer.pause();
  }
  ```
- In `newGame` (line 208): keep `startTimer()` for the first call, then add
  `_timer.reset()` to zero out the persisted value (or fold the reset into a
  `startTimer({ fresh: true })` flag — caller's choice). The load-saved-game
  branch (line 164) becomes `startTimer()` with no argument.
- In `Arcade.onSuspend` (line 147): drop `state.elapsed = getElapsed();`. The
  `saveGameState(serializeState(state))` call stays — still needed for move
  history.
- Replace any `getElapsed()` callers with `_timer.elapsedMs()` (one in this
  file, plus check the UI render path that calls `UI.updateHeader`).

### `js/storage.js` and serialization

- Drop the `elapsed` field from `serializeState` / `deserializeState`
  (whichever module owns those). Session owns it under
  `arcade.v1.cozy-solitaire.sessionElapsed`.

### `index.html` — one-shot migration to preserve existing saves

Add a third migration after the existing two:

```js
Arcade.state.migrate('v3-elapsed-to-session', function () {
  var saved = Arcade.state.get('currentGame');
  if (saved && typeof saved.elapsed === 'number') {
    Arcade.state.set('sessionElapsed', saved.elapsed);
    delete saved.elapsed;
    Arcade.state.set('currentGame', saved);
  }
});
```

Order matters: this must run before any `Arcade.session.start()` call, so put
it alongside the existing migrations before `main.js` imports.

## Net delta

Roughly **−15 lines** (the `_timerBase` field, `getElapsed()`, the suspend
write, the elapsed serialization round-trip), **+6 lines** (the migration
block).

## Verify after migration

The `onStateReplaced(() => location.reload())` line stays — cozy reloads on
import, so the SDK's new "re-read from state" branch never actually runs in
cozy. That's fine; just don't be confused if you ever remove the reload and
find the timer behaving differently than other game state.
