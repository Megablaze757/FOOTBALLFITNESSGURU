import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CUES_EXPORT, CUES_PATH, MAX_ENTRIES, cuesJson, cuesCommitMessage,
  decodeFileContent, encodeFileContent,
  cueEntryProblems, mergeCues, parseCuesFile, renderCuesFile, toEntries, toMap,
  type CueEntry,
} from "./cues-file";
import { CUES_REQUIRED, CUE_MAX, CUE_MIN, WHY_MAX, WHY_MIN } from "./exercise-draft";

const code = (src: string) =>
  readFileSync(src, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

const entry = (over: Partial<CueEntry> = {}): CueEntry => ({
  name: "goblet squat",
  cues: ["Hold it against your chest.", "Sit between your hips.", "Stand without leaning forward."],
  why: "Loads the legs through a full range with a weight you can bail out of easily.",
  ...over,
});

test("a rendered file reads back as exactly what went in", () => {
  const entries = [entry(), entry({ name: "hip thrust" }), entry({ name: "ab wheel" })];
  assert.deepEqual(parseCuesFile(renderCuesFile(entries)), toEntries(toMap(entries)));
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EVERY PUBLISH IS A COMMIT, SO AN UNSTABLE RENDER IS A DIFF EVERY TIME.
 *
 * Publishing the same cues twice must produce byte-identical source, or the
 * repository fills with commits that change nothing and the real ones become
 * impossible to find.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the same cues in any order render byte-identically", () => {
  const a = [entry({ name: "zercher squat" }), entry({ name: "ab wheel" }), entry({ name: "hip thrust" })];
  const b = [a[1], a[2], a[0]];
  assert.equal(renderCuesFile(a), renderCuesFile(b));
  assert.equal(renderCuesFile(a), renderCuesFile(parseCuesFile(renderCuesFile(a))));
});

/**
 * A render that does not compile is a broken DEPLOY, not a bad cue — so the
 * escaping is the part that matters most. The map is emitted as JSON, which is
 * both a valid TypeScript object literal and parseable here, so this asserts
 * the property directly rather than trusting a regex over source.
 */
test("quotes, backslashes and newlines survive being written into source", () => {
  const nasty = entry({
    name: 'the "so-called" c:\\squat',
    cues: [
      'Say "brace" out loud before you lift it.',
      "Back\\slash and a\nnewline in one cue here.",
      "Émojis 🏋️ and — dashes — as well now.",
    ],
    why: 'A reason with "quotes", a \\backslash, a\nnewline and ${not a template} in it too.',
  });
  const file = renderCuesFile([nasty]);
  const json = cuesJson(file);
  assert.ok(json, "the rendered file does not contain a map this can even find");
  assert.doesNotThrow(() => JSON.parse(json),
    "the emitted object literal is not valid JSON, so it is probably not valid TypeScript either");
  assert.deepEqual(parseCuesFile(file), [{ ...nasty, name: nasty.name.toLowerCase() }]);
  /**
   * There was a third assertion here looking for a raw newline inside a string
   * literal. It was both redundant and wrong: JSON forbids one, so the parse
   * above already proves it — and the pattern matched the pretty-printer's
   * newlines BETWEEN two adjacent literals, so it failed on correct output.
   * A check that can only be wrong is worse than no check.
   */
});

test("publishing again fixes a bad cue rather than being ignored", () => {
  const before = [entry({ name: "hip thrust", why: "A first attempt that somebody wants replaced now." })];
  const after = [entry({ name: "hip thrust", why: "The corrected reason, which is the one that should win." })];
  const merged = mergeCues(before, after);
  assert.equal(merged.length, 1);
  assert.match(merged[0].why, /corrected/, "the file is append-only, so a bad cue can only be fixed by hand");
});

test("merging keeps what it was not asked about, sorted", () => {
  const merged = mergeCues([entry({ name: "hip thrust" }), entry({ name: "ab wheel" })], [entry({ name: "goblet squat" })]);
  assert.deepEqual(merged.map((e) => e.name), ["ab wheel", "goblet squat", "hip thrust"]);
});

// --- what may be written into source -----------------------------------------

test("a good entry has nothing wrong with it", () => {
  assert.deepEqual(cueEntryProblems(entry()), []);
});

test("entries that must never reach a page are refused", () => {
  const cases: [string, Partial<CueEntry>][] = [
    ["no name", { name: "  " }],
    ["not lowercased", { name: "Goblet Squat" }],
    ["too few cues", { cues: ["Hold it against your chest.", "Sit between your hips."] }],
    ["too many cues", { cues: Array(8).fill("Hold it against your chest properly.") }],
    ["a cue that is barely words", { cues: ["Go.", "Sit between your hips.", "Stand up straight now."] }],
    ["a cue longer than anybody reads", { cues: ["x".repeat(CUE_MAX + 1), "Sit between your hips.", "Stand up now please."] }],
    ["no reason", { why: "" }],
    ["a reason nobody finishes", { why: "y".repeat(400) }],
    ["markup", { why: `Loads the legs <script>alert(1)</script> through a full range of motion.` }],
    ["a link", { why: "Loads the legs, see https://example.com for the full explanation of it." }],
  ];
  for (const [label, over] of cases) {
    assert.ok(cueEntryProblems(entry(over)).length > 0, `${label} was allowed into the file`);
  }
});

/**
 * cues-file.ts declares these itself so the Worker can bundle it without
 * reaching lib/exercises.ts and, through it, a React component. A duplicated
 * constant is honest only while something checks it.
 */
test("the Worker's copy of the thresholds still matches the drafting tool's", () => {
  const declared = readFileSync("lib/cues-file.ts", "utf8");
  for (const [name, value] of Object.entries({ CUES_REQUIRED, CUE_MIN, CUE_MAX, WHY_MIN, WHY_MAX })) {
    assert.match(
      declared,
      new RegExp(`const ${name} = ${value};`),
      `cues-file.ts and exercise-draft.ts disagree about ${name} — the admin tool and the Worker would accept different cues`,
    );
  }
});

test("the thresholds are the drafting tool's, not a second opinion", () => {
  assert.ok(cueEntryProblems(entry({ cues: Array(CUES_REQUIRED).fill("Sit between your hips now.") })).length === 0);
  assert.ok(cueEntryProblems(entry({ why: "z".repeat(WHY_MIN - 1) })).length > 0);
  assert.ok(cueEntryProblems(entry({ why: "z".repeat(WHY_MIN) })).length === 0);
});

test("a malformed entry is refused rather than throwing", () => {
  for (const bad of [{}, { name: "x" }, { name: "x", cues: "not an array" }, null, undefined]) {
    assert.doesNotThrow(() => cueEntryProblems(bad as unknown as CueEntry), JSON.stringify(bad));
    assert.ok(cueEntryProblems(bad as unknown as CueEntry).length > 0, JSON.stringify(bad));
  }
});

/**
 * The safe direction: a file this cannot read produces NOTHING, so the caller
 * publishes a fresh one rather than silently merging into a half-understood
 * file and dropping whatever it failed to see.
 */
test("a file it cannot read yields nothing, never a guess", () => {
  for (const bad of [
    "", "// nothing here", `export const ${CUES_EXPORT} = ;`,
    `export const ${CUES_EXPORT}: X = { "a": broken }`,
    `export const ${CUES_EXPORT}: X = [1, 2, 3];`,
    "const OTHER = { \"a\": { cues: [], why: \"\" } };",
  ]) {
    assert.deepEqual(parseCuesFile(bad), [], JSON.stringify(bad.slice(0, 40)));
  }
});

test("an empty publish is a valid file, not a broken one", () => {
  const file = renderCuesFile([]);
  assert.deepEqual(parseCuesFile(file), []);
  assert.match(file, new RegExp(`export const ${CUES_EXPORT}`));
});

// --- the app and the Worker have to agree with it ----------------------------

test("the file this names is the file the catalogue reads", () => {
  const generated = CUES_PATH.replace(/^lib\//, "").replace(/\.ts$/, "");
  const catalogue = code("lib/exercise-catalog.ts");
  assert.ok(
    catalogue.includes(`from "./${generated}"`),
    `the catalogue does not import ${CUES_PATH}, so publishing changes nothing anybody sees`,
  );
  // And the file exists and parses, or the build is broken before anybody publishes.
  assert.doesNotThrow(() => parseCuesFile(readFileSync(CUES_PATH, "utf8")));
});

/**
 * HAND-WRITTEN WINS, and the order of these two lookups is the whole of that
 * rule. Reversed, a publish silently overwrites the 24 entries somebody wrote
 * and checked one at a time, and nothing anywhere would say so.
 */
test("hand-written cues are read before generated ones", () => {
  assert.match(
    code("lib/exercise-catalog.ts"),
    /COACHING\[key\] \?\? GENERATED_CUES\[key\]/,
    "generated cues can now overwrite the hand-written ones",
  );
});

test("the Worker refuses a publish too big to be one, and checks what it writes", () => {
  const worker = code("cloudflare/src/index.ts");
  assert.match(worker, /incoming\.length > MAX_ENTRIES/, "nothing caps how much one publish may write");
  // Checked in the WORKER, not trusted from the browser. What is being written
  // is source code: a malformed entry is a repository that does not compile,
  // which is a broken deploy for everybody from one bad cue.
  assert.match(worker, /cueEntryProblems\(raw\)/, "the Worker writes source it never checked");
  assert.ok(MAX_ENTRIES > 0 && MAX_ENTRIES < 5000);
});

/**
 * The token can write to the repository that builds the site. It lives on the
 * Worker and must never be handed to a browser — which is the difference
 * between "the admin page can publish" and "anyone who opens the admin page
 * holds a key to the repository".
 */
test("the repository token never leaves the Worker", () => {
  const worker = code("cloudflare/src/index.ts");
  assert.match(worker, /env\.GITHUB_TOKEN/, "nothing reads the token");
  assert.match(worker, /Bearer \$\{env\.GITHUB_TOKEN\}/, "the token is not sent as a bearer credential");
  /**
   * The VALUE, interpolated exactly once, into the Authorization header.
   *
   * The first version of this looked for the NAME near a `json({`, and fired
   * on the error message that says a token is missing — prose about the token
   * rather than the token. Counting interpolations catches the real thing: a
   * second `${env.GITHUB_TOKEN}` anywhere is the token going somewhere else.
   */
  const uses = worker.match(/\$\{env\.GITHUB_TOKEN\}/g) ?? [];
  assert.equal(uses.length, 1, `the token's value is interpolated ${uses.length} times, not once`);
  for (const file of ["components/admin/LibraryCues.tsx", "lib/cues-file.ts", "lib/api.ts"]) {
    assert.ok(!/GITHUB_TOKEN/.test(readFileSync(file, "utf8")), `${file} mentions the repository token`);
  }
});

/** Missing token must SAY so. A publish that reports success and commits
 *  nothing is indistinguishable from one that worked. */
test("publishing without a token fails loudly rather than quietly", () => {
  const worker = code("cloudflare/src/index.ts");
  assert.match(worker, /if \(!env\.GITHUB_TOKEN\)/, "an unset token is not checked at all");
  const at = worker.indexOf("if (!env.GITHUB_TOKEN)");
  assert.match(worker.slice(at, at + 400), /50[019]|40[0-9]/, "an unset token does not produce an error status");
});

/**
 * Re-publishing after a partial run is the normal thing to do, and an empty
 * commit for each one buries the real ones. The render is deterministic
 * precisely so this comparison is possible.
 */
test("an unchanged file is not committed again", () => {
  const worker = code("cloudflare/src/index.ts");
  assert.match(worker, /content === current/, "every publish commits, even when nothing changed");
});

test("the admin tool publishes through the Worker rather than pasting", () => {
  const src = code("components/admin/LibraryCues.tsx");
  assert.match(src, /invokeAI<[^>]*>\("publish-cues"/, "the tool still only hands over text to paste");
  assert.match(src, /clean\.map/, "it publishes drafts that were never checked");
  // The held ones must never be sent: held means the cue checks found
  // something wrong with the words, which is the failure that reads as fine.
  assert.ok(!/held\.map\(\(d\) => \(\{\s*name/.test(src), "held drafts are published too");
});

test("the Worker route is reachable", () => {
  const worker = code("cloudflare/src/index.ts");
  assert.match(worker, /endsWith\("\/publish-cues"\)\) return await publishCues/,
    "the route is defined and never wired up");
});

// --- the trip through the GitHub API -----------------------------------------

/**
 * `btoa` throws on anything outside Latin-1, and these cues carry em-dashes and
 * the occasional emoji — so the naive version fails on the real content and
 * works on every fixture somebody writes in ASCII.
 */
test("a file survives the round trip through base64 with its characters intact", () => {
  const file = renderCuesFile([entry({ cues: [
    "Hold it — like this — against your chest.",
    "Sit between your hips, 90° at the knee.",
    "Stand up 🏋️ without leaning forward at all.",
  ] })]);
  assert.equal(decodeFileContent(encodeFileContent(file)), file);
  assert.deepEqual(parseCuesFile(decodeFileContent(encodeFileContent(file))), parseCuesFile(file));
});

/**
 * GitHub wraps the base64 it returns. `atob` rejects the newlines, so a file
 * read straight from the API fails to decode — and a caller that treats an
 * unreadable file as an empty one replaces it, losing every cue ever published.
 */
test("base64 as GitHub actually returns it decodes", () => {
  const file = renderCuesFile([entry()]);
  const wrapped = (encodeFileContent(file).match(/.{1,60}/g) ?? []).join("\n") + "\n";
  assert.equal(decodeFileContent(wrapped), file);
});

test("an empty or absent body decodes to nothing rather than throwing", () => {
  for (const bad of ["", "   ", "\n"]) assert.doesNotThrow(() => decodeFileContent(bad));
  assert.equal(decodeFileContent(""), "");
});

test("the commit message says how many and where from", () => {
  assert.match(cuesCommitMessage(1), /1 movement\b/);
  assert.match(cuesCommitMessage(12), /12 movements/);
  assert.match(cuesCommitMessage(3), /Admin/);
});
