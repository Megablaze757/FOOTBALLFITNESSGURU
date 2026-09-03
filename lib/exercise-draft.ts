/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHERE A MODEL ACTUALLY EARNS ITS PLACE.
 *
 * 197 of the imported gym movements have a real how-to description that
 * somebody wrote, and next to it: `why: "Builds the legs."`, `cues: []`. The
 * description teaches the movement. The `why` and the cues are the part an
 * athlete reads first and they are empty or a stub.
 *
 * That is a genuine gap in the data, which is the only kind of gap worth
 * pointing a model at. It is the opposite of the collection pages, where the
 * answer was already computable and generated prose would have added a review
 * step and a drift risk in exchange for nothing.
 *
 * Three things make this reviewable rather than a wall of plausible text:
 *
 *   1. GROUND TRUTH IS ALREADY IN THE ROW. The description says what the
 *      movement is. A cue can be checked against it — by this file before a
 *      person sees it, and by the person afterwards.
 *
 *   2. THE SURFACE IS TWO FIELDS. `why` and `cues`, nothing else. The model
 *      cannot touch the name, the description, the muscles, the equipment, the
 *      demo animation or the video. Tempo is left alone too: "Controlled" is
 *      the honest answer for most of these and is already there.
 *
 *   3. THE OUTPUT IS A CODE CHANGE. The catalogue is a compiled TypeScript
 *      file, so nothing here can publish itself. A draft becomes a diff that a
 *      human reads and commits, which is a stronger gate than any admin queue.
 *
 * House style below is not invented — it is measured off the 187 curated
 * entries: exactly three cues, 10–70 characters, no trailing full stop; a
 * `why` that ends with one.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { Exercise } from "@/lib/exercises";

export const CUES_REQUIRED = 3;
export const CUE_MIN = 10;
export const CUE_MAX = 70;
export const WHY_MIN = 40;
export const WHY_MAX = 200;

/**
 * The stub the bulk import left behind: "Builds the legs.", "Builds the core."
 *
 * At most two words after "the", and that is not fussiness. The catalogue also
 * contains "Builds the chest through a bigger range than a barbell, evening out
 * left/right" and six others like it — real sentences somebody wrote. A looser
 * pattern classifies those as placeholders and quietly points a model at work
 * that was already done properly.
 */
export const STUB_WHY = /^builds? the [a-z]+(?: [a-z]+)?\.?$/i;

export interface DraftTarget {
  id: string;
  name: string;
  category: string;
  equipment: string;
  muscles: string[];
  description: string;
}

export interface Draft {
  id: string;
  why: string;
  cues: string[];
}

/**
 * An entry worth drafting for: real how-to text, but nothing telling the
 * athlete what to feel or why they are doing it.
 *
 * The description requirement is the important half. Without it there is no
 * ground truth, and a model asked to write cues for a name alone is guessing —
 * which is exactly the output nobody can review.
 */
export function needsDraft(e: Exercise): boolean {
  const hasDescription = (e.description ?? "").trim().length >= 80;
  const noCues = (e.cues?.length ?? 0) === 0;
  const stubWhy = STUB_WHY.test((e.why ?? "").trim());
  return hasDescription && (noCues || stubWhy);
}

export function draftTargets(exercises: Exercise[]): DraftTarget[] {
  return exercises.filter(needsDraft).map((e) => ({
    id: e.id,
    name: e.name,
    category: e.category,
    equipment: e.equipment,
    muscles: e.muscles,
    description: (e.description ?? "").trim(),
  }));
}

/**
 * The prompt.
 *
 * It hands over the description and asks for nothing that isn't derivable from
 * it. "Do not invent" is worth saying but is not the control — draftProblems()
 * below is the control, and it runs on every draft whether the model behaved
 * or not.
 */
export function draftPrompt(t: DraftTarget): { system: string; user: string } {
  const system = [
    "You write coaching cues for a strength and conditioning app used by amateur athletes.",
    "",
    "You are given an exercise and a description that already teaches the movement.",
    "Write only what the description supports. Do not introduce equipment, body parts,",
    "rep schemes or variations it does not mention.",
    "",
    "Reply with JSON only, no prose around it, in exactly this shape:",
    '{"why": "...", "cues": ["...", "...", "..."]}',
    "",
    `"why": one sentence, ${WHY_MIN}-${WHY_MAX} characters, ending in a full stop, saying what`,
    "this movement gives an athlete on the pitch or in the gym. Be specific to this",
    'exercise. "Builds the legs." is the placeholder you are replacing — do not return it.',
    "",
    `"cues": exactly ${CUES_REQUIRED} short coaching cues, ${CUE_MIN}-${CUE_MAX} characters each,`,
    "no trailing full stop. Imperative and second person, as a coach would shout them:",
    '"Chest up as you drive", "Knees track over the toes". One thing per cue.',
    "",
    "Never claim an exercise prevents, treats, fixes or rehabilitates an injury.",
    "Never say it is the best or only way to train something.",
  ].join("\n");

  const user = [
    `Name: ${t.name}`,
    `Category: ${t.category}`,
    `Equipment: ${t.equipment}`,
    `Muscles: ${t.muscles.join(", ")}`,
    "",
    "Description:",
    t.description,
  ].join("\n");

  return { system, user };
}

/**
 * Pull the JSON out of a reply.
 *
 * Models fence JSON in markdown, prefix it with "Here is", or both, whatever
 * the prompt says. That is not worth a retry — it is worth a parser.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NAMED, BECAUSE TWO STRINGS IN A ROW ARE TWO STRINGS A COMPILER CANNOT TELL
 * APART.
 *
 * This was `parseDraft(id, raw)`. The admin drafting screen called it as
 * `parseDraft(json, id)` — arguments the wrong way round — and TypeScript had
 * nothing to say, because both are strings. It returned null for every
 * exercise and the screen reported that the model had produced nothing usable,
 * which was a lie about a bug one frame away.
 *
 * An object cannot be swapped.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function parseDraft({ id, raw }: { id: string; raw: string }): Draft | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const { why, cues } = parsed as { why?: unknown; cues?: unknown };
  if (typeof why !== "string" || !Array.isArray(cues)) return null;
  if (!cues.every((c): c is string => typeof c === "string")) return null;

  return { id, why: why.trim(), cues: cues.map((c) => c.trim()).filter(Boolean) };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EQUIPMENT AND ANATOMY THE EXERCISE DOES NOT HAVE.
 *
 * The failure that matters here is not clumsy writing — a person catches that
 * in a second. It is a cue that is confidently about a different exercise:
 * "keep the bar tight to your back" on a leg press, "squeeze the glutes" on a
 * chest press. Those read perfectly and are wrong, and they are wrong in a way
 * that gets somebody hurt.
 *
 * So a cue may only name a piece of equipment the exercise actually uses, and
 * may only name a body part its own row or description already names.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const EQUIPMENT_WORDS: Record<string, string[]> = {
  bar: ["barbell", "bar", "ez bar", "trap bar", "smith machine", "landmine"],
  dumbbell: ["dumbbell", "dumbbells", "weights"],
  kettlebell: ["kettlebell", "kettlebells"],
  machine: ["machine", "smith machine", "sled/scrum machine"],
  cable: ["cable"],
  band: ["band", "band or ankle weight", "band/sled", "light dumbbells or band"],
  bench: ["bench", "dumbbells + bench", "wall/bench"],
  box: ["box", "step or box", "step"],
  sled: ["sled", "band/sled", "sled/scrum machine"],
  rope: ["rope"],
  ball: ["ball", "balls", "wobble board or cushion"],
  hurdle: ["hurdles", "line or low hurdle"],
  wall: ["wall", "wall for balance", "wall/bench", "ball + wall", "balls + wall/goal"],
  cone: ["cones", "ball + cones", "ball + defender/cone"],
};

const BODY_WORDS = [
  "achilles", "adductor", "adductors", "ankle", "ankles", "back", "bicep", "biceps",
  "calf", "calves", "chest", "core", "delt", "delts", "elbow", "elbows", "forearm",
  "forearms", "glute", "glutes", "grip", "groin", "hamstring", "hamstrings", "hand",
  "hands", "head", "heel", "heels", "hip", "hips", "knee", "knees", "lat", "lats",
  "neck", "oblique", "obliques", "quad", "quads", "ribs", "shin", "shins", "shoulder",
  "shoulders", "spine", "toe", "toes", "trap", "traps", "tricep", "triceps", "wrist",
  "wrists",
];

/**
 * Never true of any exercise, however the sentence is arranged.
 *
 * The claim verb and the injury noun are allowed to be apart, because
 * "prevents knee injuries" puts a word between them and an adjacent-words
 * pattern reads it as clean. Bounded to 25 characters and stopped at a full
 * stop so the window cannot wander into the next sentence: "Fix your eyes
 * ahead and keep the back flat" is a real cue and must stay legal.
 */
const BANNED = [
  /\b(prevent|treat|cure|heal|fix|eliminat)\w*\b[^.]{0,25}\b(injur|pain|strain|tear|niggle)/i,
  /\b(injur|pain)\w*\b[^.]{0,25}\b(prevent|proof|free)\b/i,
  /\brehabilitat/i,
  /\bphysiotherap/i,
  /\btherapeutic/i,
  /\bbest\s+(exercise|movement|lift|way)\b/i,
  /\bonly\s+(exercise|movement|lift|way)\b/i,
  /\bguarantee/i,
  /\bbulletproof/i,
  /\binjury[- ]proof/i,
];

const stripPunct = (s: string) => s.toLowerCase().replace(/[^a-z\s-]/g, " ");
const words = (s: string) => stripPunct(s).split(/\s+/).filter(Boolean);

/**
 * Equipment words the row genuinely licenses, from its own equipment string.
 *
 * Only the spellings that ACTUALLY MATCH, not every spelling filed under the
 * key that matched. The first version added all of them, so "Machine" matched
 * via `machine` and quietly licensed "sled" and "scrum" out of the neighbouring
 * "sled/scrum machine" — and "Drive the sled away" passed clean on a leg press.
 */
function allowedEquipment(t: DraftTarget): Set<string> {
  const equip = t.equipment.toLowerCase();
  const allowed = new Set<string>();
  for (const [key, spellings] of Object.entries(EQUIPMENT_WORDS)) {
    const matched = spellings.filter((s) => equip.includes(s));
    if (matched.length === 0) continue;
    allowed.add(key);
    for (const s of matched) for (const w of words(s)) allowed.add(w);
  }
  // Anything the description itself names is fair game — it is the ground truth.
  for (const w of words(t.description)) allowed.add(w);
  for (const w of words(t.name)) allowed.add(w);
  return allowed;
}

function allowedBody(t: DraftTarget): Set<string> {
  const allowed = new Set<string>();
  for (const source of [t.description, t.name, t.muscles.join(" ")]) {
    for (const w of words(source)) allowed.add(w);
  }
  // Singular and plural of anything named, so "knees" licenses "knee".
  for (const w of [...allowed]) {
    if (w.endsWith("s")) allowed.add(w.slice(0, -1));
    else allowed.add(`${w}s`);
  }
  return allowed;
}

/**
 * Everything wrong with a draft, in the order a reviewer would care.
 *
 * Returns reasons rather than a boolean: "rejected" tells whoever runs this
 * nothing, and a queue of silent rejections is how a drafting run quietly
 * produces four usable rows out of two hundred.
 */
export function draftProblems(draft: Draft, t: DraftTarget): string[] {
  const problems: string[] = [];
  const why = draft.why.trim();

  if (why.length < WHY_MIN || why.length > WHY_MAX) {
    problems.push(`why is ${why.length} characters, wanted ${WHY_MIN}-${WHY_MAX}`);
  }
  if (!why.endsWith(".")) problems.push("why does not end in a full stop");
  if (STUB_WHY.test(why)) problems.push(`why is still the placeholder: "${why}"`);

  if (draft.cues.length !== CUES_REQUIRED) {
    problems.push(`${draft.cues.length} cues, wanted exactly ${CUES_REQUIRED}`);
  }
  const seen = new Set<string>();
  for (const cue of draft.cues) {
    if (cue.length < CUE_MIN || cue.length > CUE_MAX) {
      problems.push(`cue is ${cue.length} characters, wanted ${CUE_MIN}-${CUE_MAX}: "${cue}"`);
    }
    if (cue.endsWith(".")) problems.push(`cue ends in a full stop: "${cue}"`);
    const key = cue.toLowerCase();
    if (seen.has(key)) problems.push(`duplicate cue: "${cue}"`);
    seen.add(key);
    if (/\bi\b|\bwe\b|\bmy\b/i.test(cue)) problems.push(`cue is not in second person: "${cue}"`);
  }

  for (const text of [why, ...draft.cues]) {
    for (const pattern of BANNED) {
      if (pattern.test(text)) problems.push(`claim this app will not make: "${text}"`);
    }
  }

  const equipment = allowedEquipment(t);
  const body = allowedBody(t);
  for (const cue of draft.cues) {
    for (const word of words(cue)) {
      if (EQUIPMENT_WORDS[word] && !equipment.has(word)) {
        problems.push(`cue names "${word}", which this exercise does not use: "${cue}"`);
      }
      if (BODY_WORDS.includes(word) && !body.has(word)) {
        problems.push(`cue names "${word}", which this exercise does not train: "${cue}"`);
      }
    }
  }

  /**
   * Did it read the description at all?
   *
   * A cue sharing no meaningful word with the how-to text is a cue written from
   * the exercise NAME, which is the guessing this whole file exists to stop.
   * Two of three, not three of three: one genuinely general cue ("breathe out
   * as you finish the rep") is good coaching, three of them is a template.
   */
  const source = new Set(words(`${t.description} ${t.name} ${t.muscles.join(" ")}`));
  const grounded = draft.cues.filter((cue) =>
    words(cue).some((w) => w.length > 3 && source.has(w)));
  if (draft.cues.length === CUES_REQUIRED && grounded.length < 2) {
    problems.push(`${grounded.length} of ${draft.cues.length} cues refer to the description`);
  }

  return problems;
}

export interface Reviewed {
  target: DraftTarget;
  draft: Draft;
  problems: string[];
}

/**
 * Nothing is applied automatically — this only sorts the pile for a reader.
 *
 * Held is "read this one", not "throw this one away", and the checks lean
 * towards holding on purpose. A leg press does train the glutes, so a cue that
 * mentions them will be held even though it is fine, because the description
 * does not name them. That costs somebody five seconds. The other kind of
 * mistake costs an athlete a shoulder.
 */
export function partition(reviewed: Reviewed[]): { clean: Reviewed[]; held: Reviewed[] } {
  return {
    clean: reviewed.filter((r) => r.problems.length === 0),
    held: reviewed.filter((r) => r.problems.length > 0),
  };
}
