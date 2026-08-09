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

// The §6d no-infinite-animation scan and the §5 iteration-count scan used to
// live here. They are the launcher's job now: tools/contract-gates.mjs runs
// against every fleet-ci caller, so this repo is still held to both rules —
// just from the one place the fleet CI/CD standard says drift gates live,
// rather than from a copy here that only this repo benefits from.
//
// The fleet version is strictly stronger than what left. Both scans here were
// line-based, so neither could see an `infinite` inside a multi-line
// `animation:` shorthand; the fleet gate reads whole files. It also judges
// each comma-separated iteration count on its own, and adds a guarded-read
// gate for Arcade.settings.powerSaver() that this repo never had.
