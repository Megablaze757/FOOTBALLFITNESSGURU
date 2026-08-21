import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * "I wanted the ask coach to be a floating chat bubble."
 *
 * Questions arrive while you are looking at something — a drill you do not
 * recognise mid-session, a calorie target that looks wrong, a number on
 * Progress you cannot read. A tab makes you leave the thing you are asking
 * about, type the question from memory, and navigate back to check the answer
 * against it. /ask stays for a conversation you arrive with; the bubble is for
 * the question you already have.
 */

const bubble = readFileSync(new URL("../components/CoachBubble.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/(app)/layout.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/(app)/ask/page.tsx", import.meta.url), "utf8");
const chat = readFileSync(new URL("../components/CoachChat.tsx", import.meta.url), "utf8");
const context = readFileSync(new URL("./coach-context.ts", import.meta.url), "utf8");

test("it is on every screen in the app", () => {
  assert.match(layout, /<CoachBubble \/>/, "the bubble is not mounted in the app shell");
  assert.match(layout, /from "@\/components\/CoachBubble"/);
});

test("it costs nothing until somebody opens it", () => {
  /**
   * THE BRIEFING IS TWELVE QUERIES — the block, the check-in, a month of
   * training, benchmarks, food, the rehab plan. Running that on every page load
   * to power a button nobody pressed would be indefensible.
   */
  assert.match(bubble, /everOpened \? loadCoachContext\(user\.id\) : null/,
    "the briefing loads on mount rather than on open");
  assert.match(bubble, /everOpened \? coachContextKey\(user\.id\) : undefined/,
    "an unopened bubble still claims a cache entry");
  // Sticky: closing the sheet must not throw the briefing away, or the next
  // open pays for twelve queries again.
  assert.match(bubble, /const \[everOpened, setEverOpened\] = useState\(false\)/);
  assert.ok(!/setEverOpened\(false\)/.test(bubble), "everOpened is reset, so reopening refetches");
});

test("one loader, so the coach knows the same things everywhere", () => {
  // A bubble that assembled its own briefing would be a second answer to "what
  // does the coach know", and the drift would show up as the coach knowing
  // about your rehab plan on one screen and not on another.
  assert.match(bubble, /loadCoachContext/);
  assert.match(page, /loadCoachContext\(user\.id\)/);
  assert.match(page, /coachContextKey\(user\.id\)/);
  assert.match(context, /export async function loadCoachContext/);
  // And the page no longer carries its own copy of it.
  assert.ok(!/const \[\s*program, checkIn, recentChecks/.test(page),
    "the 216-line loader is back inline on the page");
});

test("it does not open a copy of the page it is sitting on", () => {
  // A floating button that opens what is already behind it is a bug that looks
  // like a feature.
  assert.match(bubble, /pathname\?\.startsWith\("\/ask"\)/);
  // Nor does it exist purely to sell an upgrade on every press.
  assert.match(bubble, /!can\(tier, "ai_chat"\)/);
  assert.match(bubble, /return null;/);
});

test("the sheet behaves like every other sheet in the app", () => {
  assert.match(bubble, /e\.key === "Escape"/, "escape does not close it");
  assert.match(bubble, /document\.body\.style\.overflow = "hidden"/, "the page scrolls under the sheet");
  assert.match(bubble, /useEffect\(\(\) => setOpen\(false\), \[pathname\]\)/,
    "the sheet survives a route change and sits over an unrelated page");
  assert.match(bubble, /aria-label="Close the coach"/, "tapping the dimmed page does nothing");
  assert.match(bubble, /<Portal>/, "it renders inside the page's stacking context");
});

test("the button sits clear of the tab bar, which moves", () => {
  // The nav hides on scroll down and returns on scroll up, so anchoring to it
  // would make the bubble jump around.
  assert.match(bubble, /fixed bottom-24 right-4 z-40/);
  assert.match(bubble, /env\(safe-area-inset-bottom\)/, "it sits under the home indicator on an iPhone");
  assert.match(bubble, /h-14 w-14/, "well over the 44px floor, since this one is pressed one-handed");
});

test("the chat fills the sheet rather than measuring the viewport", () => {
  // On /ask the chat IS the page and knows how tall it should be. Inside an
  // 85dvh sheet, a child measuring itself against the viewport puts the
  // composer 15% below the bottom of the screen.
  assert.match(chat, /fill\?: boolean;/);
  assert.match(chat, /fill\s*\n\s*\? "flex h-full flex-col/);
  assert.match(bubble, /fill\s*\n?\s*\/>/, "the bubble does not ask the chat to fill it");
  // And the sheet's own header is not repeated inside it.
  assert.match(chat, /\{!fill && <header/);
});

test("the wait says what it is waiting for", () => {
  // A bare spinner makes "reading your whole training history" look like the
  // app being slow.
  assert.match(bubble, /Reading your block, today&apos;s check-in and your lifts…/);
});
