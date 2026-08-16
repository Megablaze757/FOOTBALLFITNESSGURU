// =============================================================================
// The rehab plan an athlete is actually ON.
//
// WHY THIS EXISTS. The generated plan was a document. It was saved (0061), it
// rendered on the injury page, and nothing else in the app could see it — so
// somebody who told us their hamstring was torn kept getting Nordic curls and
// sprint work in their programme, and Ask Coach could not answer a question
// about the plan it had just written for them.
//
// A plan can only drive anything once you know WHICH STAGE is current, because
// that is what decides both halves of the answer: what to add to a session, and
// what the rest of the session must not contain.
//
// THE STAGE IS THE ATHLETE'S TO ADVANCE. Every stage carries a timeframe and a
// criterion, and it is the criterion that governs. Deriving the stage from the
// date would move somebody into stage-three loading at week three whether or
// not their hamstring had stopped hurting — prescribing sprint work for a
// healing tear because a calendar said so. Time may prompt; it may not decide.
// See migration 0085.
//
// TWO WAYS A PLAN CHANGES A SESSION, and the second matters more:
//
//   ADD the stage's exercises, so the rehab work is in the session rather than
//   on a separate page to remember.
//
//   REMOVE what the stage says to avoid. Adding three band exercises to a
//   session that still opens with heavy squats has not respected the injury; it
//   has just made the session longer.
//
// Pure + tested.
// =============================================================================

export interface RehabExercise {
  name: string;
  dose: string;
  note: string;
}

export interface RehabStage {
  name: string;
  timeframe: string;
  goal: string;
  exercises: RehabExercise[];
  /** Movements or qualities to keep out of training at this stage. */
  avoid: string[];
}

export interface RehabPlanDoc {
  summary: string;
  seeAProfessional: string;
  stages: RehabStage[];
  redFlags: string[];
  progressWhen: string;
}

/** A row of public.rehab_plans, as the app reads it. */
export interface RehabPlanRow {
  id?: string;
  created_at?: string | null;
  description?: string | null;
  area?: string | null;
  weeks?: number | null;
  chronic?: boolean | null;
  active?: boolean | null;
  current_stage?: number | null;
  plan: RehabPlanDoc | null;
}

export interface ActiveStage {
  stage: RehabStage;
  /** 1-based, matching `current_stage`. */
  number: number;
  total: number;
  /** Whole days since the plan was created, or null if unknown. */
  ageDays: number | null;
  /** What it takes to move on. */
  progressWhen: string;
}

/**
 * The stage the athlete is on, or null when there is no usable active plan.
 *
 * Clamped rather than trusted: `current_stage` is a number in a database and a
 * plan can be regenerated with fewer stages than the last one, which would
 * otherwise index past the end and take the whole injury page down.
 */
export function activeStage(row: RehabPlanRow | null | undefined, today?: string): ActiveStage | null {
  if (!row || row.active === false) return null;
  const stages = row.plan?.stages;
  if (!Array.isArray(stages) || stages.length === 0) return null;

  const number = Math.max(1, Math.min(stages.length, Math.round(Number(row.current_stage) || 1)));
  const stage = stages[number - 1];
  if (!stage) return null;

  return {
    stage,
    number,
    total: stages.length,
    ageDays: daysSince(row.created_at, today),
    progressWhen: row.plan?.progressWhen ?? "",
  };
}

/**
 * The rehab work to put into today's session.
 *
 * Empty rather than null when there is no plan, because every caller is
 * concatenating it onto a session and an empty list concatenates cleanly.
 */
export function rehabWork(row: RehabPlanRow | null | undefined, today?: string): RehabExercise[] {
  const s = activeStage(row, today);
  if (!s) return [];
  return (s.stage.exercises ?? []).filter((e) => e && typeof e.name === "string" && e.name.trim());
}

/**
 * What the current stage says to keep out of training, lower-cased.
 *
 * These are phrases a plan author wrote for a human — "sprinting", "heavy
 * hinging", "deep squats" — not exercise ids, so matching against a drill name
 * is necessarily fuzzy. `blockedBy` below is where that fuzziness is contained
 * and where its failure mode is chosen.
 */
export function rehabAvoid(row: RehabPlanRow | null | undefined, today?: string): string[] {
  const s = activeStage(row, today);
  if (!s) return [];
  return (s.stage.avoid ?? [])
    .map((a) => String(a ?? "").toLowerCase().trim())
    .filter(Boolean);
}

/**
 * Words too common to match a drill name on.
 *
 * "Avoid any exercise that causes pain" would otherwise match every drill
 * containing "exercise", and "no running for now" would strip a footballer's
 * entire session. The avoid list is prose, and prose has connectives in it.
 */
const STOP_WORDS = new Set([
  "any", "all", "the", "and", "or", "for", "now", "yet", "with", "that", "this",
  "avoid", "no", "not", "exercise", "exercises", "movement", "movements", "work",
  "training", "anything", "causes", "pain", "painful", "through", "your", "you",
  "keep", "off", "stop", "until", "while", "during", "into", "high", "load",
]);

/**
 * Which avoid-phrase blocks a given drill, or null if none does.
 *
 * MATCHES ON SIGNIFICANT WORDS, NOT ON THE WHOLE PHRASE. "Avoid explosive
 * hamstring loading" will never appear verbatim in a drill name, so a substring
 * test on the full phrase matches nothing and the filter silently does nothing
 * at all — the worst outcome, because the session then looks injury-aware and
 * is not.
 *
 * The failure mode is chosen deliberately: this over-blocks rather than
 * under-blocks. Dropping a drill an athlete could have done costs them one
 * exercise; keeping one their rehab plan told them to avoid costs them weeks.
 * Everything removed is reported, so nothing disappears silently.
 */
export function blockedBy(drillName: string, avoid: string[]): string | null {
  const name = String(drillName ?? "").toLowerCase();
  if (!name) return null;

  for (const phrase of avoid) {
    const words = phrase.split(/[^a-z]+/).filter((w) => w.length > 3 && !STOP_WORDS.has(w));
    if (!words.length) continue;
    // Stem crudely so "sprinting" matches "sprint" and "squats" matches "squat".
    if (words.some((w) => name.includes(w) || name.includes(stem(w)))) return phrase;
  }
  return null;
}

function stem(word: string): string {
  return word.replace(/(ing|ed|s)$/, "");
}

export interface FilteredSession<T> {
  kept: T[];
  /** What was taken out, and which instruction took it out. */
  removed: { drill: T; because: string }[];
}

/**
 * Take out of a session anything the current rehab stage says to avoid.
 *
 * Returns what was removed as well as what survived, because a session that
 * quietly shrinks is indistinguishable from a bug — and the reason ("your plan
 * says no sprinting until stage 2") is the most useful thing the app can say at
 * that moment.
 */
export function applyRehabAvoid<T extends { name: string }>(
  drills: T[],
  avoid: string[],
): FilteredSession<T> {
  const kept: T[] = [];
  const removed: { drill: T; because: string }[] = [];
  for (const d of drills ?? []) {
    const because = blockedBy(d.name, avoid);
    if (because) removed.push({ drill: d, because });
    else kept.push(d);
  }
  return { kept, removed };
}

/**
 * "5 × 20s" or "3 x 12" into sets and reps, so rehab work can be logged like
 * anything else.
 *
 * The dose is prose written by the plan's author, not a structured field, so
 * this is best-effort by nature. It falls back to 3 × 10 rather than 0 × 0: a
 * drill offered with zero sets cannot be ticked off, and a sensible default the
 * athlete can correct beats a broken row they have to delete.
 */
export function parseDose(dose: string | null | undefined): { sets: number; reps: number } {
  const text = String(dose ?? "");
  const m = /(\d{1,2})\s*[x×]\s*(\d{1,3})/i.exec(text);
  if (!m) {
    // "30 seconds", "hold for 45s" — one set of whatever the number is.
    const single = /(\d{1,3})\s*(s|sec|second|min)/i.exec(text);
    if (single) return { sets: 1, reps: Number(single[1]) };
    return { sets: 3, reps: 10 };
  }
  return { sets: Number(m[1]) || 3, reps: Number(m[2]) || 10 };
}

export interface RehabbedSession<T> {
  drills: T[];
  /** Rehab work that was added, so the UI can mark it as rehab rather than training. */
  added: RehabExercise[];
  /** What the plan took out, and which instruction took it. */
  removed: { drill: T; because: string }[];
  /** One sentence for the athlete, or null when the plan changed nothing. */
  note: string | null;
}

/**
 * Today's session, with the rehab plan applied to it.
 *
 * REHAB WORK GOES FIRST. It is the part of the session with a deadline on it —
 * an athlete who runs out of time should lose the third accessory movement, not
 * the isometrics that are the reason they can train at all. Everything the
 * stage forbids comes out before anything is added, so the two halves cannot
 * fight over the same drill.
 *
 * `makeDrill` is passed in because the caller owns the drill shape: the Journal
 * wants a TrainingDrill with a null load, the Coach page wants a ProgramDrill
 * with a cue. Both want the same decision made the same way.
 */
export function applyRehabToSession<T extends { name: string }>(
  drills: T[],
  row: RehabPlanRow | null | undefined,
  makeDrill: (e: RehabExercise) => T,
  today?: string,
): RehabbedSession<T> {
  const stage = activeStage(row, today);
  if (!stage) return { drills: drills ?? [], added: [], removed: [], note: null };

  const { kept, removed } = applyRehabAvoid(drills ?? [], rehabAvoid(row, today));
  const added = rehabWork(row, today);

  const parts: string[] = [];
  if (added.length) {
    parts.push(`${added.length} rehab exercise${added.length === 1 ? "" : "s"} from stage ${stage.number} of your ${row?.area ?? "injury"} plan added.`);
  }
  if (removed.length) {
    // Named, not counted. "2 exercises removed" is a shrug; naming them lets
    // the athlete disagree, which they sometimes should.
    parts.push(`Taken out for now: ${removed.map((r) => r.drill.name).join(", ")} — your plan says to avoid ${removed[0].because.toLowerCase()}.`);
  }

  return {
    drills: [...added.map(makeDrill), ...kept],
    added,
    removed,
    note: parts.length ? parts.join(" ") : null,
  };
}

/** One line for the coach briefing, or null when there is no active plan. */
export function describeRehab(row: RehabPlanRow | null | undefined, today?: string): string | null {
  const s = activeStage(row, today);
  if (!s) return null;

  const parts = [
    `Following a rehab plan for ${row?.area ?? "an injury"}${row?.description ? ` (${row.description})` : ""}.`,
    `On stage ${s.number} of ${s.total}: ${s.stage.name} — ${s.stage.goal}`,
  ];
  if (s.ageDays != null) parts.push(`Started ${s.ageDays} day${s.ageDays === 1 ? "" : "s"} ago.`);
  if (s.stage.exercises?.length) {
    parts.push(`This stage's work: ${s.stage.exercises.map((e) => `${e.name} (${e.dose})`).join(", ")}.`);
  }
  if (s.stage.avoid?.length) parts.push(`Avoiding at this stage: ${s.stage.avoid.join("; ")}.`);
  if (s.progressWhen) parts.push(`Moves to the next stage when: ${s.progressWhen}`);
  return parts.join(" ");
}

/**
 * CALENDAR DAYS, not elapsed 24-hour periods.
 *
 * "Started 4 days ago" is what somebody means when they made the plan on the
 * 1st and it is now the 5th. Counting elapsed time says 3 for a plan created at
 * 9am and 4 for the same plan created at 1am, which makes the age of a rehab
 * plan depend on what time of night the athlete filled the form in.
 */
function daysSince(from: string | null | undefined, today?: string): number | null {
  if (!from) return null;
  const a = Date.parse(`${String(from).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${(today ?? new Date().toISOString()).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
