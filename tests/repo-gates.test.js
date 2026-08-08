// Source-level gates: everything tracked has to parse.
//
// Deliberately about the SOURCE, not the deploy — what the published artifact
// must contain is deploy-artifact.test.js's job, and it checks the staged
// output rather than the checkout, which is the only way to catch a staging
// rule that drops a file the game needs.
import { test } from "node:test";
import assert from "node:assert";
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../tools/stage.mjs";

const tracked = execSync("git ls-files -z", { cwd: ROOT, encoding: "utf8" })
  .split("\0").filter(Boolean);

test("every tracked JS file parses", () => {
  for (const f of tracked.filter((f) => /\.(js|mjs)$/.test(f))) {
    const r = spawnSync(process.execPath, ["--check", f], { cwd: ROOT });
    assert.strictEqual(r.status, 0, `node --check ${f} failed:\n${r.stderr}`);
  }
});

test("every tracked JSON file parses", () => {
  for (const f of tracked.filter((f) => f.endsWith(".json"))) {
    assert.doesNotThrow(
      () => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")),
      `${f} is not valid JSON`);
  }
});

// GAME_INTEGRATION §6d — "Let the screen rest". An infinite CSS animation is a
// rAF loop that never stops, expressed declaratively: it keeps the compositor
// producing frames on a board where nothing is happening. Emphasis effects
// pulse a finite number of times via the launcher's token and settle to a
// static treatment. This game currently has no keyframe animations at all;
// the gate is here so the first one to arrive has to be finite.
test("no infinite CSS animations (§6d)", () => {
  const styled = tracked.filter((f) => /\.(css|html)$/.test(f));
  for (const f of styled) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const line of src.split("\n")) {
      if (!/\banimation(-iteration-count)?\s*:/.test(line)) continue;
      assert.ok(!/\binfinite\b/.test(line),
        `${f}: infinite animation — pulse finitely via ` +
        `animation-iteration-count: var(--arcade-pulse-count, 3) and settle ` +
        `to a static resting treatment (GAME_INTEGRATION §6d)\n  ${line.trim()}`);
    }
  }
});

// The CSS half of the power-saver contract carries its own fallback, so any
// iteration count a game does declare should be the token, not a bare number.
test("declared animation iteration counts ride --arcade-pulse-count (§5)", () => {
  const styled = tracked.filter((f) => /\.(css|html)$/.test(f));
  for (const f of styled) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const line of src.split("\n")) {
      if (!/animation-iteration-count\s*:/.test(line)) continue;
      assert.ok(/var\(\s*--arcade-pulse-count/.test(line),
        `${f}: hard-coded iteration count — use ` +
        `var(--arcade-pulse-count, 3) so the launcher's power-saver and ` +
        `reduced-motion ladder applies (GAME_INTEGRATION §5)\n  ${line.trim()}`);
    }
  }
});
