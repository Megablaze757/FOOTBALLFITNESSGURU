import assert from "node:assert/strict";
import test from "node:test";
import { durationMinutes, durationSeconds, formatElapsed, isActivity } from "./training-duration";

test("exact seconds win without breaking older minute-only rows", () => {
  assert.equal(durationSeconds({ duration_seconds: 1546, total_minutes: 26 }), 1546);
  assert.equal(durationMinutes({ duration_seconds: null, total_minutes: 26 }), 26);
  assert.equal(durationSeconds({ duration_seconds: undefined, total_minutes: 5.5 }), 330);
});

test("elapsed time keeps seconds and supports sessions over an hour", () => {
  assert.equal(formatElapsed(1546), "25:46");
  assert.equal(formatElapsed(3845), "1:04:05");
});

test("an intentional rest day is not counted as training activity", () => {
  assert.equal(isActivity({ session_type: "rest_day" }), false);
  assert.equal(isActivity({ session_type: "active_rest" }), true);
  assert.equal(isActivity({ session_type: null }), true);
});
