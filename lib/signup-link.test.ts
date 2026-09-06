import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SIGNUP_CTA, SIGNUP_HREF, SIGNUP_PATH, wantsSignUp } from "./signup-link";

/**
 * The whole point of the constant. A "Sign up for free today" button that
 * links to a bare /login lands a first-time visitor on a form asking for a
 * password they have never set — the button renamed and the door still wrong.
 */
test("the signup link opens the create-account form, not sign-in", () => {
  assert.ok(SIGNUP_HREF.startsWith(SIGNUP_PATH), "the link left the login page");
  assert.notEqual(SIGNUP_HREF, SIGNUP_PATH, "the link is a bare /login, which opens on sign in");
  assert.ok(wantsSignUp(new URL(`https://x${SIGNUP_HREF}`).search),
    "the page would not open on the create-account form for its own link");
});

test("the words say it is free and it is now", () => {
  assert.match(SIGNUP_CTA, /free/i);
  assert.doesNotMatch(SIGNUP_CTA, /waitlist/i);
});

test("what counts as arriving to sign up", () => {
  assert.equal(wantsSignUp("?new=1"), true);
  assert.equal(wantsSignUp("new=1"), true, "a query string without its ? is still a query string");
  assert.equal(wantsSignUp("?new"), true, "a bare flag is still a flag");
  assert.equal(wantsSignUp("?new=1&plan=pro"), true);
});

test("what does not", () => {
  assert.equal(wantsSignUp(""), false);
  assert.equal(wantsSignUp("?"), false);
  assert.equal(wantsSignUp("?next=/home"), false, "\"next\" is not \"new\"");
  assert.equal(wantsSignUp("?new=0"), false);
  assert.equal(wantsSignUp("?new=false"), false);
  /**
   * `?plan=` also opens sign-up, and NOT from here — app/login/page.tsx owns
   * that, because it also checks the tier is on sale and remembers which one
   * was wanted. This must not quietly take it over.
   */
  assert.equal(wantsSignUp("?plan=pro"), false,
    "the plan path was folded in here, dropping the on-sale check that goes with it");
});

/** A login page that throws on a malformed address bar is worse than one that signs in. */
test("a broken query string still renders a login page", () => {
  for (const bad of [null, undefined, "?%", "?a=%E0%A4%A", "?=&&="]) {
    assert.doesNotThrow(() => wantsSignUp(bad as string), JSON.stringify(bad));
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NO PUBLIC PAGE SENDS A VISITOR TO THE WAITLIST.
 *
 * MarketingShell's two calls to action render on every public page — the
 * header on all of them, and GuideCta at the foot of all 859 guides, recipes
 * and exercises. They pointed at /waitlist, which is a lost signup now that
 * the door is open. This is the kind of thing that comes back one component at
 * a time, so it is checked at the source rather than remembered.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the site-wide calls to action point at signup, not the waitlist", () => {
  /**
   * COMMENTS STRIPPED FIRST. The first version of this failed on the comment
   * explaining the change — a guard matched by the wrong occurrence, which is
   * the mistake this repo keeps catching. What ships is the markup.
   */
  const code = (f: string) =>
    readFileSync(f, "utf8")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

  const shell = code("components/MarketingShell.tsx");
  assert.doesNotMatch(shell, /waitlist/i, "a public CTA still points at the waitlist");
  assert.match(shell, /SIGNUP_HREF/, "the CTA hard-codes a path instead of using the constant");

  const home = code("app/page.tsx");
  assert.doesNotMatch(home, /href="\/waitlist"/, "the home page still links to the waitlist");
});

/**
 * The affiliate link carries `?new=1` AND `?ref=`. linkTo hard-coded `?ref=`,
 * which was fine while every destination was a bare path and would have
 * produced "/login?new=1?ref=CODE" here — a URL where `ref` does not parse at
 * all, so the affiliate keeps sharing it and quietly stops being credited.
 */
test("a referral link to a page that already has a query is still a valid URL", async () => {
  const { signupLink } = await import("./referral");
  const link = signupLink("MATE10");
  const url = new URL(link, "https://pocketathlete.com");
  assert.equal(url.searchParams.get("ref"), "MATE10", `ref did not parse out of ${link}`);
  assert.equal(url.searchParams.get("new"), "1", `the signup flag was lost in ${link}`);
  assert.ok(!link.includes("?new=1?"), `two question marks: ${link}`);
});
