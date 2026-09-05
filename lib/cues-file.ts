// =============================================================================
// THE GENERATED CUES FILE — how a draft in a browser becomes a page on the web.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY A FILE AND NOT A TABLE, which is the question this design answers.
//
// The 173 movements without cues are the last large piece of content work on
// the site, and the POINT of doing it is search: those pages are under two
// hundred words and read as a movement listed rather than taught. This app is
// a static export — every exercise page is prerendered at build time — so cues
// living in a database would reach a signed-in athlete and never reach Google,
// which is the one reader they were written for.
//
// So publishing writes SOURCE, the build compiles it, and the cues are in the
// HTML. The Worker commits this file through the GitHub Contents API; CI does
// the rest. Every publish is a commit, which means every publish is a diff
// somebody can read and a revert somebody can do.
//
// SEPARATE FROM `COACHING` in lib/exercise-catalog.ts, deliberately. That map
// is hand-written and hand-maintained, with 24 entries somebody wrote and
// checked one at a time. Splicing machine output into the middle of it would
// mean the Worker parsing and rewriting a file a person owns — and the first
// bad splice takes the hand-written work with it. A separate file it owns
// entirely can be rewritten wholesale, which is the safest edit there is.
//
// HAND-WRITTEN WINS. The merge in exercise-catalog.ts reads COACHING first, so
// a movement somebody has written cues for keeps them however many times this
// file is regenerated. Machine output never overwrites a person's.
//
// THE FORMAT IS JSON, inside a TypeScript file. `JSON.stringify(map, null, 2)`
// is both a valid TS object literal and valid JSON, so rendering and parsing
// are the standard library rather than a regex over source code that has to
// get string escaping right — and getting that wrong writes a file that does
// not compile, which is a broken deploy rather than a bad cue.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THIS MODULE IMPORTS NOTHING, AND THAT IS THE POINT.
 *
 * The Worker bundles it, and the Worker has no "@/" path mapping. Importing
 * the thresholds from lib/exercise-draft.ts pulled in lib/exercises.ts, which
 * imports a React component — so the Worker's typecheck failed on a module
 * three hops away that it has no business knowing about.
 *
 * The alternative was mapping "@/" in the Worker's tsconfig, which fixes the
 * resolution and leaves the real problem: this file would then be one careless
 * import away from bundling 380 exercises and 335 recipes into a script with a
 * size limit, to check the length of a sentence.
 *
 * So the numbers are declared here, and a test asserts they still match
 * exercise-draft's. A duplicated constant with a test is honest; a duplicated
 * constant without one is a bug waiting for somebody to change one of them.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const CUES_REQUIRED = 3;
const CUE_MIN = 10;
const CUE_MAX = 70;
const WHY_MIN = 40;
const WHY_MAX = 200;

/** Where the file lives, as the GitHub Contents API wants it. */
export const CUES_PATH = "lib/exercise-cues.generated.ts";

/** The export the catalogue reads. Renaming this breaks the merge. */
export const CUES_EXPORT = "GENERATED_CUES";

/**
 * A ceiling on one commit.
 *
 * There are fewer than 400 movements in the whole catalogue, so anything past
 * this is not a publish — it is a bug or an abuse, and either way it should be
 * refused before it becomes a commit.
 */
export const MAX_ENTRIES = 500;

export interface CueEntry {
  /** Lowercased, exactly as build() looks it up. */
  name: string;
  cues: string[];
  why: string;
}

export type CueMap = Record<string, { cues: string[]; why: string }>;

/**
 * Is this entry safe to write into source?
 *
 * Structural only — length, shape, and characters. Whether a cue is TRUE of
 * the movement is checked against the movement's own description by
 * lib/exercise-draft.ts, which needs the catalogue and therefore runs in the
 * browser. This runs in the Worker, where the catalogue is 380 exercises it
 * has no reason to carry, so the two checks are deliberately different jobs.
 */
export function cueEntryProblems(entry: CueEntry): string[] {
  const problems: string[] = [];
  const name = (entry?.name ?? "").trim();

  if (!name) problems.push("no name");
  else if (name.length > 80) problems.push("the name is longer than any movement");
  else if (name !== name.toLowerCase()) problems.push("the name must be lowercased — build() looks it up that way");

  const cues = Array.isArray(entry?.cues) ? entry.cues : [];
  if (cues.length < CUES_REQUIRED) problems.push(`${cues.length} cues, needs ${CUES_REQUIRED}`);
  if (cues.length > 6) problems.push("more cues than anybody reads");
  for (const cue of cues) {
    if (typeof cue !== "string" || cue.trim().length < CUE_MIN) problems.push(`a cue is shorter than ${CUE_MIN} characters`);
    else if (cue.length > CUE_MAX) problems.push(`a cue is longer than ${CUE_MAX} characters`);
  }

  const why = typeof entry?.why === "string" ? entry.why.trim() : "";
  if (why.length < WHY_MIN) problems.push(`the reason is shorter than ${WHY_MIN} characters`);
  if (why.length > WHY_MAX) problems.push(`the reason is longer than ${WHY_MAX} characters`);

  /**
   * NOTHING THAT COULD BE MARKUP OR A DIRECTIVE.
   *
   * These strings are rendered into pages and compiled into source. React
   * escapes them on the way out and JSON.stringify escapes them on the way in,
   * so neither is a live hole — but a cue containing a tag is wrong on its own
   * terms, and refusing it here is cheaper than finding it on a page.
   */
  for (const text of [name, why, ...cues.filter((c) => typeof c === "string")]) {
    if (/[<>]/.test(text)) problems.push("angle brackets are not coaching");
    if (/https?:\/\//i.test(text)) problems.push("a link is not a cue");
  }

  return [...new Set(problems)];
}

/** Deterministic, so re-publishing unchanged cues produces no diff at all. */
export function toMap(entries: readonly CueEntry[]): CueMap {
  const map: CueMap = {};
  for (const key of [...entries.map((e) => e.name.trim().toLowerCase())].sort()) {
    const entry = entries.find((e) => e.name.trim().toLowerCase() === key);
    if (entry) map[key] = { cues: entry.cues, why: entry.why };
  }
  return map;
}

export function toEntries(map: CueMap): CueEntry[] {
  return Object.keys(map).sort().map((name) => ({ name, cues: map[name].cues, why: map[name].why }));
}

/**
 * INCOMING WINS, because publishing again is how a bad cue gets fixed.
 *
 * The alternative — keeping what is already committed — would make this file
 * append-only, and the only way to correct something would be editing the
 * generated file by hand, which is the thing this exists to avoid.
 */
export function mergeCues(existing: readonly CueEntry[], incoming: readonly CueEntry[]): CueEntry[] {
  const map = toMap(existing);
  for (const entry of incoming) map[entry.name.trim().toLowerCase()] = { cues: entry.cues, why: entry.why };
  return toEntries(map);
}

const HEADER = `// ============================================================================
// GENERATED FILE — DO NOT EDIT BY HAND.
//
// Written by the Worker's /publish-cues route from the admin drafting tool,
// and rewritten wholesale on every publish: an edit made here is lost the next
// time somebody publishes, without warning and without a conflict.
//
// To change a cue, publish it again from Admin → Ops. To keep one permanently,
// move it into COACHING in lib/exercise-catalog.ts, which is hand-maintained
// and always wins over this file.
//
// See lib/cues-file.ts for the format and why it is a file rather than a table.
// ============================================================================
`;

export function renderCuesFile(entries: readonly CueEntry[]): string {
  const map = toMap(entries);
  return `${HEADER}
export const ${CUES_EXPORT}: Record<string, { cues: string[]; why: string }> = ${
    JSON.stringify(map, null, 2)
  };
`;
}

/**
 * Read back a file this renderer wrote.
 *
 * Returns [] for anything it does not recognise — including a hand-edited file
 * it can no longer parse. That is the safe direction: the caller then publishes
 * a fresh file rather than silently merging into a half-understood one.
 */
/**
 * The JSON text inside a rendered file, or null.
 *
 * Exported so nothing has to locate it twice. The first version of this lived
 * inline in the parser and was copied into a test, and BOTH copies had the
 * same bug — a duplicated locator is a bug duplicated.
 */
export function cuesJson(source: string): string | null {
  const at = source.indexOf(`${CUES_EXPORT}:`);
  if (at < 0) return null;
  /**
   * `= {`, not the next `{`.
   *
   * The declaration is annotated — `: Record<string, { cues: string[]; ... }>`
   * — so the first brace after the name belongs to the TYPE. Slicing from
   * there produced something that was never JSON, and the parser returned []
   * for every file it had itself written: the merge would have silently
   * dropped everything already published.
   */
  const marker = source.indexOf("= {", at);
  if (marker < 0) return null;
  const open = marker + 2;
  const close = source.lastIndexOf("}");
  if (close <= open) return null;
  return source.slice(open, close + 1);
}

export function parseCuesFile(source: string): CueEntry[] {
  const json = cuesJson(source);
  if (json === null) return [];
  try {
    const map = JSON.parse(json) as CueMap;
    if (!map || typeof map !== "object" || Array.isArray(map)) return [];
    return toEntries(map).filter((e) => Array.isArray(e.cues) && typeof e.why === "string");
  } catch {
    return [];
  }
}

// --- Talking to the GitHub Contents API --------------------------------------

/**
 * Base64 for a file, in both directions.
 *
 * Here rather than in the Worker because both directions have a trap that only
 * shows up on real content, and both are testable:
 *
 *   * `btoa` throws on anything outside Latin-1, and these cues carry em-dashes
 *     and the occasional emoji. The bytes have to be UTF-8 encoded FIRST.
 *   * GitHub returns base64 with newlines wrapped into it. A spec-compliant
 *     `atob` strips ASCII whitespace itself — verified, and true in Node and
 *     in workerd — so the strip below is belt-and-braces rather than the fix
 *     an earlier version of this comment claimed it was. It is kept because
 *     the runtime that matters is workerd and these tests run in Node, so
 *     nothing here can actually observe that boundary; a mutation removing it
 *     therefore survives, and that is expected rather than a gap. What the
 *     test does prove is the property: wrapped base64 decodes to the file.
 */
export function encodeFileContent(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeFileContent(base64: string): string {
  const binary = atob((base64 || "").replace(/\s+/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/** The commit message, so a publish reads as one thing in the log. */
export function cuesCommitMessage(count: number): string {
  return `Coaching cues for ${count} movement${count === 1 ? "" : "s"}\n\n`
    + "Published from Admin → Ops. Generated file — see lib/cues-file.ts.\n";
}
