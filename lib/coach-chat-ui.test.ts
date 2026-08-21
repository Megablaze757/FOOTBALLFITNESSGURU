import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * "Make Ask coach a chat bubble."
 *
 * It was a card with 288px of scroll, identical bubbles on both sides, and a
 * grey box reading "Coach is thinking…". Everything worked and none of it read
 * as a conversation: with the same shape, the same colour weight and no avatar,
 * the only thing separating your words from the coach's was which margin they
 * were pushed against.
 */

const chat = readFileSync(new URL("../components/CoachChat.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/(app)/ask/page.tsx", import.meta.url), "utf8");

test("each side of the conversation has its own shape", () => {
  // THE TAIL IS THE WHOLE POINT. Squaring the corner nearest the speaker gives
  // each side a direction, which is what makes a stack of bubbles read as a
  // conversation before any reading happens.
  assert.match(chat, /rounded-2xl rounded-br-md/, "your messages have no tail");
  assert.match(chat, /rounded-2xl rounded-bl-md/, "the coach's messages have no tail");
  assert.ok(!/className=\{`max-w-\[85%\] rounded-2xl px-3/.test(chat), "the old identical bubbles are back");
});

test("the coach has a face, and it does not repeat down the margin", () => {
  assert.match(chat, /function CoachAvatar/);
  assert.match(chat, /showAvatar=\{messages\[i \+ 1\]\?\.role !== m\.role\}/,
    "the avatar is drawn beside every bubble, including four in a row from the same speaker");
  // A spacer keeps the left edge straight when the avatar is hidden.
  assert.match(chat, /<span className="w-6 shrink-0" aria-hidden \/>/);
});

test("thinking is a typing indicator, not a grey box of words", () => {
  assert.ok(!/Coach is thinking…<\/div>/.test(chat), "the old placeholder text is back");
  assert.match(chat, /animate-typing-dot/);
  assert.match(chat, /animationDelay: `\$\{dot \* 0\.16\}s`/, "the dots blink together instead of rippling");
  // Still announced, since an animation says nothing to a screen reader.
  assert.match(chat, /<span className="sr-only">Coach is typing<\/span>/);

  const tailwind = readFileSync(new URL("../tailwind.config.ts", import.meta.url), "utf8");
  assert.match(tailwind, /"typing-dot": \{/, "the keyframes are missing, so the dots sit still");
});

test("the conversation gets the screen", () => {
  // A 288px window is a transcript viewer, not somewhere you talk. Comments
  // stripped first: the note explaining what was removed names the old class,
  // and a test that trips on its own explanation is a test nobody keeps.
  const rendered = chat.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/max-h-72/.test(rendered), "the chat is back in a 288px box");
  assert.match(chat, /min-h-\[calc\(100dvh-14rem\)\]/, "the chat no longer fills the page");
  assert.match(chat, /flex-1 space-y-3 overflow-y-auto/, "the message list does not take the free space");
  // dvh, not vh: on iOS the address bar makes vh taller than the visible page,
  // which would push the composer under it.
  assert.ok(!/min-h-\[calc\(100vh/.test(chat), "vh puts the composer behind Safari's address bar");
});

test("the prompts survive the first message", () => {
  // The old row vanished the moment a conversation started, so the four
  // questions the coach can actually answer were only ever offered to somebody
  // who had not asked anything yet.
  assert.match(chat, /\{!thinking && input\.trim\(\) === "" && \(/,
    "the suggestions are gated on an empty conversation again");
  assert.ok(!/\{messages\.length === 0 && \(\s*<div className="mb-3 flex flex-wrap gap-2">/.test(chat));
});

test("the page does not crowd it out", () => {
  // Heading, prose, a small chat and a four-line paragraph underneath meant the
  // conversation was the smallest thing on the page.
  assert.match(page, /<details className="mt-3/, "the 'what can it see' note still takes four lines on every visit");
  assert.match(page, /What can it see\?/);
  assert.ok(!/<h1 className="text-3xl font-extrabold tracking-tight">Ask coach<\/h1>/.test(page),
    "the oversized heading is back");
});

test("nothing about how it works was traded for how it looks", () => {
  // The rewrite touched the render only. These are the parts that must survive
  // it: the twelve-turn history, the two restore paths, and the write-through
  // to coach_messages.
  assert.match(chat, /messages\.slice\(-12\)/, "the coach lost its memory of the conversation");
  assert.match(chat, /from\("coach_messages"\)/, "cross-device history is gone");
  assert.match(chat, /sessionStorage\.setItem\(storageKey/, "the tab-local conversation is gone");
  assert.match(chat, /localCoachAnswer\(question, context\)/, "the offline fallback is gone");
  assert.match(chat, /clearConversation/, "there is no way to start a new chat");
});
