// Every email the app sends, inside one shell.
//
// The launch announcement was built properly — table layout, a preheader, a
// real button, a palette worked out against Gmail's dark mode in a real inbox.
// Everything else was three tags:
//
//     <h2>Title</h2><p>body</p><p><a href="...">Open PocketAthlete →</a></p>
//
// Times New Roman on white, a naked blue link, the product's name nowhere on
// it. That is what an athlete receives when their block is ready or their trial
// is ending, and for most of them it is the only thing they ever see of the
// product outside the app.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderEmail, renderText, type EmailShell } from "../cloudflare/src/email-layout";

const worker = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");

const SAMPLE: EmailShell = {
  preheader: "Lower body — five lifts, about 55 minutes.",
  eyebrow: "Today's session",
  heading: "Wednesday: lower body",
  paragraphs: ["Five lifts, about 55 minutes.", "Squat is up 2.5kg."],
  cta: { href: "https://pocketathlete.com/coach", label: "Open today's session →" },
  note: "Nobody else was emailed.",
  footerHtml: 'Training emails are on. <a href="https://pocketathlete.com/profile">Change that</a>.',
};

test("an email is a document, not a fragment", () => {
  const html = renderEmail("Wednesday: lower body", SAMPLE);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<meta name="viewport"/, "no viewport — it renders desktop-width on a phone");
  assert.match(html, /role="presentation"/, "not table-based, so Outlook will not lay it out");
  assert.match(html, /font-family:-apple-system/, "falls back to Times New Roman");
  assert.match(html, /PocketAthlete/, "the product's name is not on its own email");
});

test("it survives Gmail's dark mode, the way the launch email does", () => {
  // Gmail inverts emails and cannot be talked out of it — established in a real
  // inbox, twice. So the design is light and the inversion is used rather than
  // fought: Gmail flips luminance and keeps hue, so #8a6510 lands back on
  // roughly the brand gold. Clients that honour the query get a real dark
  // palette instead, which is what the pa-* classes are for.
  const html = renderEmail("x", SAMPLE);
  assert.match(html, /<meta name="color-scheme" content="light dark">/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  for (const cls of ["pa-bg", "pa-card", "pa-h", "pa-gold", "pa-body", "pa-muted"]) {
    assert.ok(html.includes(`.${cls}`), `${cls} has no dark rule`);
    assert.ok(html.includes(`class="${cls}"`) || html.includes(`class="${cls} `) || html.includes(` ${cls}"`),
      `${cls} has a dark rule and is never applied`);
  }
  // A stylesheet only beats an inline style when it says so.
  const dark = html.slice(html.indexOf("@media (prefers-color-scheme: dark)"), html.indexOf("</style>"));
  const rules = dark.match(/:[^;{}]+;/g) ?? [];
  assert.ok(rules.length > 5);
  for (const rule of rules) assert.match(rule, /!important/, `${rule.trim()} loses to the inline style`);
});

test("the preheader is not the heading again", () => {
  // Left out, every client fills it with whatever text comes first — which was
  // the heading. Two chances to say something, both spent on one thing.
  const html = renderEmail("x", SAMPLE);
  assert.match(html, /display:none;max-height:0/);
  assert.ok(html.indexOf(SAMPLE.preheader) < html.indexOf(SAMPLE.heading),
    "the preheader does not come first, so the inbox will not use it");
  assert.notEqual(SAMPLE.preheader, SAMPLE.heading);
});

test("the button is a table cell, because Outlook ignores padding on a link", () => {
  const html = renderEmail("x", SAMPLE);
  const button = html.slice(html.indexOf("#e3b53f"));
  assert.match(button, /bgcolor="#e3b53f"/, "Outlook reads the attribute when it refuses the style");
  assert.match(button, /display:block;padding:17px/, "not full-bleed, so it is a small target on a phone");
});

test("a title with an ampersand does not become markup", () => {
  const html = renderEmail("x", { ...SAMPLE, heading: "Squat & bench", paragraphs: ["<script>alert(1)</script>"] });
  assert.match(html, /Squat &amp; bench/);
  assert.ok(!html.includes("<script>"), "notification text is injected as markup");
});

test("every email carries a plain-text part", () => {
  // An HTML mail with no text alternative scores worse in every spam filter,
  // and it is what a watch, a screen reader and a text-only client show. These
  // had none at all: the Worker sent `html` and nothing else.
  const text = renderText(SAMPLE);
  assert.match(text, /WEDNESDAY: LOWER BODY/);
  assert.match(text, /Five lifts/);
  assert.match(text, /https:\/\/pocketathlete\.com\/coach/, "the link is only in the HTML half");
  assert.ok(!text.includes("<"), "markup leaked into the plain-text part");
  // The footer's link survives as an address rather than being tidied away.
  assert.match(text, /https:\/\/pocketathlete\.com\/profile/);

  assert.match(worker, /async function email\(env: Env, to: string, subject: string, html: string, text\?: string\)/);
  assert.match(worker, /\.\.\.\(text \? \{ text \} : \{\}\)/, "the text part is never sent to the provider");
});

test("the notification email goes through the shell, not through tags", () => {
  const code = worker.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /renderEmail\(title, shell\)/);
  assert.match(code, /renderText\(shell\)/);
  assert.ok(!/`<h2>\$\{escapeHtml\(notification\.title\)\}<\/h2>/.test(code), "the bare template is still there");
  // The preheader is the body, because the inbox already shows the title.
  assert.match(code, /preheader: body\.split\("\\n"\)\[0\] \|\| title/);
});

test("every notification kind has a label, and an unknown one still looks like us", () => {
  // The ten values are pinned by the check constraint in migration 0091. A kind
  // added in SQL must not be able to ship a heading with a gap above it.
  const kinds = (readFileSync(new URL("../supabase/migrations/0091_notifications_trials_and_consent.sql", import.meta.url), "utf8")
    .match(/kind in \(([\s\S]*?)\)/)?.[1] ?? "")
    .split(",").map((k) => k.trim().replace(/'/g, "")).filter(Boolean);
  assert.ok(kinds.length >= 10, `found ${kinds.length} kinds — has 0091 moved?`);
  const table = worker.slice(worker.indexOf("const NOTIFICATION_EYEBROW"), worker.indexOf("async function emailStatus"));
  for (const kind of kinds) assert.match(table, new RegExp(`\\b${kind}:`), `${kind} has no label`);
  assert.match(worker, /NOTIFICATION_EYEBROW\[notification\.kind\] \?\? "PocketAthlete"/);
});

test("the admin test looks like the real thing", () => {
  // A test that renders differently from a reminder proves the pipeline and
  // says nothing about what lands in an athlete's inbox.
  const fn = worker.slice(worker.indexOf("async function emailTest"), worker.indexOf("async function emailRetry"));
  assert.match(fn, /renderEmail\("PocketAthlete — test email", shell\)/);
  assert.match(fn, /renderText\(shell\)/);
});

test("the launch email keeps its own copy, on purpose", () => {
  // cloudflare/src/launch-email.ts is GENERATED from the Deno Edge Function and
  // a test asserts the two are byte-identical. Importing the shared shell into
  // it would trade that live invariant for thirty lines — and the announcement
  // is the one email where a build-time difference between two runtimes would
  // be found by twelve thousand people at once.
  const layout = readFileSync(new URL("../cloudflare/src/email-layout.ts", import.meta.url), "utf8");
  assert.match(layout, /AND YES, THE BUTTON IS DUPLICATED/);
  const launch = readFileSync(new URL("../cloudflare/src/launch-email.ts", import.meta.url), "utf8");
  assert.ok(!launch.includes("./email-layout"), "the generated module now imports, so the sync check will fail");
});

test("a list in the notification stays a list", () => {
  // Half of what writes a notification writes a list — the week's numbers, the
  // session's lifts. Flattened to one blob with <br> between the lines, a
  // weekly summary reads as a paragraph that happens to contain digits.
  const html = renderEmail("x", {
    ...SAMPLE,
    paragraphs: ["- Back squat, 4 × 6\n- Romanian deadlift, 3 × 8\n- Leg curl, 3 × 12"],
  });
  assert.match(html, /&bull;/, "the bullets were dropped");
  assert.ok(!html.includes("- Back squat"), "the marker is still in the text as a hyphen");
  assert.equal((html.match(/Back squat|Romanian deadlift|Leg curl/g) ?? []).length, 3);
});

test("a run of label-and-value becomes a table", () => {
  const html = renderEmail("x", {
    ...SAMPLE,
    paragraphs: ["Sessions: 4\nTotal load: 11,240kg\nStreak: 6 weeks"],
  });
  assert.match(html, /align="right"/, "the values are not set against the labels");
  assert.match(html, /font-weight:800;color:#0e1411;border-top/, "the value is not the emphasised half");
});

test("prose with a colon in it is left as prose", () => {
  // The rule that turns lines into a table has to know when not to. "One thing:
  // you skipped Tuesday" is a sentence, and a sentence in a stat row looks like
  // a bug in the data rather than a bug in the layout.
  const html = renderEmail("x", {
    ...SAMPLE,
    paragraphs: ["One thing to watch: you skipped Tuesday and the block assumes four days.\nIt will even out if you train Saturday."],
  });
  assert.ok(!html.includes('align="right"'), "a sentence was rendered as a stat row");
});

test("the last thing on the card says who it is from", () => {
  // It opened with the wordmark and ended on a grey sentence about email
  // preferences, so the final impression of every reminder was an unsubscribe
  // note.
  const html = renderEmail("x", SAMPLE);
  const footer = html.slice(html.lastIndexOf("border-top:1px solid #e4e8e3"));
  assert.match(footer, /PocketAthlete/);
  assert.ok(footer.indexOf("PocketAthlete") < footer.indexOf(SAMPLE.footerHtml!.slice(0, 12)),
    "the signature comes after the small print");
});
