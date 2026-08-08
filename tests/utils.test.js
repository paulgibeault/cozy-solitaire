import { test, describe, afterEach } from "node:test";
import assert from "node:assert";
import { isPowerSaving, parseSeed } from "../js/utils.js";

describe("isPowerSaving — the guarded settings read", () => {
  afterEach(() => { delete globalThis.Arcade; });

  test("reports the setting when the SDK has it (3.13.0+)", () => {
    globalThis.Arcade = { settings: { powerSaver: () => true } };
    assert.strictEqual(isPowerSaving(), true);
    globalThis.Arcade = { settings: { powerSaver: () => false } };
    assert.strictEqual(isPowerSaving(), false);
  });

  // The footgun GAME_INTEGRATION §5 calls out: on a pre-3.13 SDK the method
  // doesn't exist, and calling it throws — inside an onSettingsChange handler
  // that's a throw on every launcher settings write, not just at startup.
  test("degrades to 'not saving' on an SDK without the method", () => {
    globalThis.Arcade = { settings: { reducedMotion: () => false } };
    assert.doesNotThrow(() => isPowerSaving());
    assert.strictEqual(isPowerSaving(), false);
  });

  test("degrades with no SDK at all", () => {
    assert.strictEqual(isPowerSaving(), false);
    globalThis.Arcade = {};
    assert.strictEqual(isPowerSaving(), false);
  });
});

describe("parseSeed", () => {
  test("clamps into [1, 999999] and rejects junk", () => {
    assert.strictEqual(parseSeed(""), undefined);
    assert.strictEqual(parseSeed(undefined), undefined);
    assert.strictEqual(parseSeed("abc"), undefined);
    assert.strictEqual(parseSeed("0"), 1);
    assert.strictEqual(parseSeed("42"), 42);
    assert.strictEqual(parseSeed("1000000"), 999999);
  });
});
