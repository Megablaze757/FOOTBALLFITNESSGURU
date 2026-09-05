import { test } from "node:test";
import assert from "node:assert/strict";
import { configValue, hasEdgeSpace, secretValue } from "./env-value";

/**
 * The exact value that broke three runs: a repository variable saved with a
 * trailing carriage return. curl rejected the URL before it made a request, so
 * the step took zero seconds and the reel never reached the dashboard.
 */
test("a URL survives the newline a paste glues on", () => {
  const good = "https://txqhstackgidjqkkrzyj.supabase.co";
  for (const pasted of [
    `${good}\r`, `${good}\n`, `${good}\r\n`, ` ${good} `, `\t${good}`, `${good}\r\n\r\n`,
  ]) {
    assert.equal(configValue(pasted), good, JSON.stringify(pasted));
  }
  assert.equal(configValue(good), good, "a clean value must come back unchanged");
});

test("a key survives the same treatment", () => {
  assert.equal(configValue("sb_publishable_abc123\r\n"), "sb_publishable_abc123");
  assert.equal(configValue(undefined), "");
  assert.equal(configValue(null), "");
  assert.equal(configValue(""), "");
});

/**
 * A password is NOT a URL. Stripping every space would break a real credential
 * that contains one, and would do it silently — the failure mode this whole
 * file exists to stop.
 */
test("a password keeps its spaces and loses only the paste damage", () => {
  assert.equal(secretValue("correct horse battery\r\n"), "correct horse battery");
  assert.equal(secretValue(" leading"), " leading", "a leading space is part of the password");
  assert.equal(secretValue("trailing "), "trailing ", "a trailing space is part of the password");
  assert.equal(secretValue("TESTACCOUNT123"), "TESTACCOUNT123");
  assert.equal(secretValue(undefined), "");
});

test("edge spaces are reported so a run can name the cause without printing it", () => {
  assert.equal(hasEdgeSpace("clean"), false);
  assert.equal(hasEdgeSpace("trailing "), true);
  assert.equal(hasEdgeSpace(" leading"), true);
  assert.equal(hasEdgeSpace("a b"), false, "an inner space is not paste damage");
  // A newline alone is stripped first, so it is not reported as an edge space:
  // the code already fixed it and there is nothing for the user to do.
  assert.equal(hasEdgeSpace("clean\r\n"), false);
  assert.equal(hasEdgeSpace(undefined), false);
});
