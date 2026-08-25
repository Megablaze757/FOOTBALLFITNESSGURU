import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isShortcutUrl, appleShortcutFallback, resolveShortcutUrl } from "./apple-shortcut";

const REAL = "https://www.icloud.com/shortcuts/0123456789abcdef0123456789abcdef";

test("a real iCloud shortcut link is accepted", () => {
  assert.equal(isShortcutUrl(REAL), true);
  assert.equal(isShortcutUrl("https://icloud.com/shortcuts/0123456789abcdef"), true);
  assert.equal(isShortcutUrl(`  ${REAL}  `), true, "pasted links carry whitespace");
  assert.equal(isShortcutUrl(`${REAL}/`), true);
});

/**
 * THE FAILURE THIS EXISTS TO PREVENT is a button that looks live and goes
 * nowhere. It has happened here before: the ingest endpoint was never deployed,
 * and the setup guide sent everybody through five careful steps into a 404.
 */
test("anything that would not install a shortcut is refused", () => {
  for (const bad of [
    "",
    "   ",
    "PASTE_THE_LINK_HERE",
    "https://www.icloud.com/shortcuts/",
    "https://www.icloud.com/shortcuts/abc",              // too short to be real
    "https://www.icloud.com/shortcuts/not-hex-not-hex-x",
    "https://icloud.com/photos/0123456789abcdef0123456789abcdef",
    "http://www.icloud.com/shortcuts/0123456789abcdef0123456789abcdef", // not https
    "https://routinehub.co/shortcut/12345",
    "https://example.com/icloud.com/shortcuts/0123456789abcdef",
  ]) {
    assert.equal(isShortcutUrl(bad), false, bad || "(empty)");
  }
  assert.equal(isShortcutUrl(null), false);
  assert.equal(isShortcutUrl(undefined), false);
});

test("the fallback returns null rather than a broken value", () => {
  const url = appleShortcutFallback();
  assert.ok(url === null || isShortcutUrl(url));
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A STORED VALUE THAT IS NOT A REAL LINK IS ABSENT, NOT AN OVERRIDE.
 *
 * The database constraint (0103) should refuse junk, but a column can be
 * written by other means, and "somebody put nonsense here" must not silently
 * disable a fallback that was working. The same reasoning as every other
 * absent-is-not-zero decision in this codebase.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("resolving prefers what an admin published and falls back otherwise", () => {
  assert.equal(resolveShortcutUrl(REAL), REAL);
  assert.equal(resolveShortcutUrl(`  ${REAL}  `), REAL, "pasted links carry whitespace");

  for (const junk of [null, undefined, "", "   ", "not a link", "https://example.com/x"]) {
    assert.equal(
      resolveShortcutUrl(junk), appleShortcutFallback(),
      `${String(junk)} should fall back rather than turn the feature off`,
    );
  }
});

/**
 * THE SHARED SHORTCUT IS THE SAME SHORTCUT FOR EVERYBODY WHO INSTALLS IT, so
 * nothing account-specific may ever be built into this link. If a token or a
 * user id ever ends up here, everyone who taps the link writes biometrics to
 * one account.
 */
test("no credential is baked into the configured link", () => {
  const src = readFileSync(new URL("./apple-shortcut.ts", import.meta.url), "utf8");
  const configured = /const CONFIGURED = "([^"]*)"/.exec(src);
  assert.ok(configured, "CONFIGURED must stay a plain string literal");
  const value = configured[1];
  assert.ok(value === "" || isShortcutUrl(value), "CONFIGURED must be empty or a real link");
  assert.ok(!/[?&]/.test(value), "an iCloud link carries no query string, so it carries no token");
});
