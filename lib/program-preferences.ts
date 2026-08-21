import { effortRangeText, effortText } from "./effort";
import type { PainMap } from "./types";
import type { GoalType, ProgramDrill, ProgramPlan, ProgramSession, TrainingFocus } from "./engine";
import { getExerciseByName, type SportId } from "./exercises";
import { MOVEMENTS, type Movement, type Slot } from "./movements";
import { hasEquipmentFor, isExcluded, type Constraints } from "./constraints";

export type AdaptiveGoalType =
  | GoalType
  | "hypertrophy"
  | "fat_loss"
  | "mobility"
  | "rehab";

export interface GoalPreference {
  type: AdaptiveGoalType;
  priority: 1 | 2 | 3;
}

export const ADAPTIVE_GOALS: { id: AdaptiveGoalType; label: string; blurb: string }[] = [
  { id: "strength", label: "Strength", blurb: "Heavy compounds, lower reps and full recovery" },
  { id: "hypertrophy", label: "Build muscle", blurb: "Moderate loads, more accessories and productive volume" },
  { id: "endurance", label: "Endurance", blurb: "Conditioning, higher reps and shorter rests" },
  { id: "fat_loss", label: "Fat loss", blurb: "Dense compound work and metabolic conditioning" },
  { id: "mobility", label: "Mobility", blurb: "More range-of-motion and controlled movement work" },
  { id: "rehab", label: "Rehab", blurb: "Pain-aware rebuilding and low-impact recovery" },
];

export type ProgramDayType =
  | "push"
  | "pull"
  | "legs"
  | "upper"
  | "lower"
  | "full_body"
  | "cardio"
  | "active_rest";

export const PROGRAM_DAY_TYPES: { id: ProgramDayType; label: string }[] = [
  { id: "push", label: "Push" },
  { id: "pull", label: "Pull" },
  { id: "legs", label: "Legs" },
  { id: "upper", label: "Upper" },
  { id: "lower", label: "Lower" },
  { id: "full_body", label: "Full body" },
  { id: "cardio", label: "Cardio" },
  { id: "active_rest", label: "Active rest" },
];

export interface ScheduleDay {
  day: number;
  type: ProgramDayType;
  durationMinutes?: number | null;
  rpe?: number | null;
  notes?: string | null;
}

export const MUSCLE_PRIORITIES = ["chest", "back", "shoulders", "arms", "quads", "hamstrings", "glutes", "core"] as const;
export type MusclePriority = (typeof MUSCLE_PRIORITIES)[number];

export interface ProgramSettings {
  goals: GoalPreference[];
  schedule?: ScheduleDay[];
  /** Desired working exercises. Null lets the goal/session defaults decide. */
  exerciseTarget?: number | null;
  /** 0 = normal, 1 = emphasise, 2 = strongly emphasise. */
  musclePriorities?: Partial<Record<MusclePriority, number>>;
  /** Movement ids explicitly preferred in the custom builder. */
  mustInclude?: string[];
  /** Editable upper-day preparation list. Empty means the athlete removed it. */
  upperWarmup?: string[];
}

const LABEL = new Map(ADAPTIVE_GOALS.map((g) => [g.id, g.label]));
const DAY_LABEL = new Map(PROGRAM_DAY_TYPES.map((d) => [d.id, d.label]));
const MAIN_SLOTS = new Set<Slot>(["primary", "secondary", "accessory"]);
const LOADED_KIT = /barbell|dumbbell|kettlebell|machine|cable|smith|plate|weight/i;
const MOVEMENT_BY_NAME = new Map(MOVEMENTS.map((m) => [normalise(m.name), m]));

export function sanitiseGoals(input: GoalPreference[] | null | undefined): GoalPreference[] {
  const seen = new Set<string>();
  const clean = (input ?? [])
    .filter((g): g is GoalPreference => !!g && typeof g.type === "string" && !seen.has(g.type) && (seen.add(g.type), true))
    .slice(0, 3)
    .map((g, i) => ({ type: g.type, priority: (i + 1) as 1 | 2 | 3 }));
  return clean;
}

export function goalLabel(type: AdaptiveGoalType): string {
  return LABEL.get(type) ?? type.replace(/_/g, " ");
}

/** Keep the existing engine vocabulary as an anchor while richer goals blend around it. */
export function engineAnchor(goals: GoalPreference[], fallback: GoalType = "strength"): { goal: GoalType; focus?: TrainingFocus } {
  const first = sanitiseGoals(goals)[0]?.type;
  if (first === "hypertrophy") return { goal: "strength", focus: "aesthetics" };
  if (first === "fat_loss") return { goal: "endurance", focus: "fitness" };
  if (first === "mobility" || first === "rehab") return { goal: "injury_recovery", focus: "rehab" };
  if (first && ["speed", "agility", "strength", "endurance", "injury_recovery", "skill"].includes(first)) {
    return { goal: first as GoalType };
  }
  return { goal: fallback };
}

export function goalBlendCopy(goals: GoalPreference[]): string {
  const clean = sanitiseGoals(goals);
  if (!clean.length) return "Your current programme goal drives the prescription.";
  const names = clean.map((g) => goalLabel(g.type));
  const first = clean[0].type;
  const second = clean[1]?.type;
  if (first === "strength" && second === "hypertrophy") {
    return "Strength anchors the main lifts; muscle-building volume fills the accessories.";
  }
  if (first === "endurance" && second === "fat_loss") {
    return "Endurance anchors the week, with denser circuits and shorter rests for fat loss.";
  }
  if (first === "strength" && second === "endurance") {
    return "Strength stays heavy and fully rested; conditioning is added on separate days.";
  }
  return `${names[0]} is the anchor${names.length > 1 ? `, with ${names.slice(1).join(" and ").toLowerCase()} blended around it` : ""}.`;
}

export function goalPreviewCopy(goals: GoalPreference[]): string {
  const types = sanitiseGoals(goals).map((g) => g.type);
  const primary = types[0];
  if (primary === "strength" && types.includes("hypertrophy")) return "Next-week preview: 3–4 × 6–12 with 90–120s rests; the main lift stays the priority.";
  if (primary === "strength") return "Next-week preview: the primary lift gets 4–6 × 3–6 at RPE 8–9 with 3–5 minute rests; other work stays at 2–3 sets.";
  if (primary === "hypertrophy") return "Next-week preview: mostly 3 × 8–15, with more isolation work and 60–90s rests.";
  if (primary === "endurance" || primary === "fat_loss") return "Next-week preview: 2–3 × 15–25, shorter rests and more conditioning.";
  if (primary === "mobility" || primary === "rehab" || primary === "injury_recovery") return "Next-week preview: load gives way to controlled range-of-motion, band work and low-impact recovery.";
  return "Next-week preview: your primary goal anchors the main block; lower-priority goals shape accessories and conditioning.";
}

export function activeRestSuggestion(goals: GoalPreference[]): string {
  const types = new Set(sanitiseGoals(goals).map((g) => g.type));
  if (types.has("rehab") || types.has("mobility") || types.has("injury_recovery")) return "Easy mobility flow, rehab exercises or gentle yoga.";
  if (types.has("endurance")) return "Zone 1 jog, swim or bike — easy enough to hold a conversation.";
  if (types.has("strength") || types.has("hypertrophy")) return "Light walking, mobility and relaxed stretching.";
  return "Easy movement that leaves you fresher than you started.";
}

export function defaultSchedule(days: number, goals: GoalPreference[] = []): ScheduleDay[] {
  const count = clamp(Math.round(days) || 3, 2, 7);
  const goalTypes = new Set(sanitiseGoals(goals).map((g) => g.type));
  const mixedStrengthCardio = goalTypes.has("strength") && (goalTypes.has("endurance") || goalTypes.has("fat_loss"));
  const cardioLed = goalTypes.has("endurance") || goalTypes.has("fat_loss");
  let split: ProgramDayType[];
  if (mixedStrengthCardio) {
    split = count === 2 ? ["upper", "lower"]
      : count === 3 ? ["upper", "cardio", "lower"]
      : count === 4 ? ["upper", "cardio", "lower", "cardio"]
      : ["upper", "cardio", "lower", "cardio", "full_body", ...(count >= 6 ? ["active_rest" as const] : []), ...(count === 7 ? ["active_rest" as const] : [])];
  } else if (cardioLed) {
    split = count === 2 ? ["cardio", "upper"]
      : count === 3 ? ["cardio", "upper", "cardio"]
      : count === 4 ? ["cardio", "upper", "cardio", "lower"]
      : ["cardio", "upper", "cardio", "lower", "cardio", ...(count >= 6 ? ["active_rest" as const] : []), ...(count === 7 ? ["active_rest" as const] : [])];
  } else {
    split = count >= 6
      ? ["push", "pull", "legs", "upper", "lower", "active_rest", ...(count === 7 ? ["active_rest" as const] : [])]
      : count === 5 ? ["upper", "lower", "push", "pull", "active_rest"]
      : count === 4 ? ["upper", "lower", "upper", "lower"]
      : count === 3 ? ["push", "pull", "legs"]
      : ["upper", "lower"];
  }
  return split.slice(0, count).map((type, i) => ({
    day: i + 1,
    type,
    ...(type === "active_rest" ? { durationMinutes: 30, rpe: 3, notes: activeRestSuggestion(goals) } : {}),
  }));
}

export interface ApplyPreferencesOptions {
  painMap?: PainMap;
  constraints?: Constraints;
  sport?: SportId;
}

/** Final, deterministic pass shared by AI and local programmes. */
export function applyProgramPreferences(
  plan: ProgramPlan,
  raw: ProgramSettings,
  options: ApplyPreferencesOptions = {},
): ProgramPlan {
  const goals = sanitiseGoals(raw.goals);
  const settings: ProgramSettings = {
    ...raw,
    goals,
    schedule: raw.schedule?.slice(0, 7).map((d, i) => ({ ...d, day: i + 1 })),
    exerciseTarget: raw.exerciseTarget == null ? null : clamp(raw.exerciseTarget, 5, 10),
    upperWarmup: raw.upperWarmup?.map((name) => name.trim()).filter(Boolean).slice(0, 10),
  };
  const schedule = settings.schedule?.length ? settings.schedule : null;

  const weeks = plan.weeks.map((week) => {
    const workouts = week.sessions.filter((s) => s.kind !== "active_rest");
    const source = workouts.length ? workouts : week.sessions;
    let sessions = schedule
      ? schedule.map((day, i) => day.type === "active_rest"
          ? activeRestSession(day, goals)
          : customiseSession(source[i % Math.max(1, source.length)], day, settings, options))
      : week.sessions.map((s) => customiseSession(s, undefined, settings, options));
    sessions = ensurePreferredMovements(sessions, settings, options);
    return { ...week, sessions };
  });

  return {
    ...plan,
    goals,
    settings,
    summary: `${plan.summary} ${goalBlendCopy(goals)}`.trim(),
    weeks,
  };
}

function activeRestSession(day: ScheduleDay, goals: GoalPreference[]): ProgramSession {
  return {
    day: day.day,
    title: `Day ${day.day} · Active rest`,
    focus: "endurance",
    kind: "active_rest",
    durationMinutes: day.durationMinutes ?? 30,
    rpe: day.rpe ?? 3,
    notes: day.notes?.trim() || activeRestSuggestion(goals),
    drills: [],
  };
}

function customiseSession(
  fallback: ProgramSession | undefined,
  schedule: ScheduleDay | undefined,
  settings: ProgramSettings,
  options: ApplyPreferencesOptions,
): ProgramSession {
  const base: ProgramSession = fallback ?? { day: schedule?.day ?? 1, title: "Workout", focus: "strength", drills: [] };
  const type = schedule?.type ?? inferDayType(base.title);
  let drills = strictSlots(base.drills);
  drills = upperWarmup(drills, type, settings.upperWarmup);
  drills = ensureWarmup(drills);
  drills = adaptDose(drills, settings.goals);
  drills = ensureExerciseCount(drills, type, settings, options);
  drills = orderBySlot(drills);
  return {
    ...base,
    day: schedule?.day ?? base.day,
    title: schedule ? `Day ${schedule.day} · ${DAY_LABEL.get(type) ?? "Workout"}` : base.title,
    kind: "workout",
    drills,
  };
}

/** Weighted exercises accidentally labelled as warm-up are moved, never deleted. */
export function strictSlots(drills: ProgramDrill[]): ProgramDrill[] {
  return drills.map((d) => d.slot === "warmup" && isWeighted(d.name)
    ? { ...d, slot: "accessory", reason: `${d.reason} Moved from warm-up because it uses external load.` }
    : d);
}

export function warmupClassificationWarnings(plan: ProgramPlan): string[] {
  const out: string[] = [];
  for (const week of plan.weeks) for (const session of week.sessions) for (const drill of session.drills) {
    if (drill.slot === "warmup" && isWeighted(drill.name)) out.push(`Week ${week.week}, day ${session.day}: ${drill.name}`);
  }
  return out;
}

export function isWeighted(name: string): boolean {
  const movement = MOVEMENT_BY_NAME.get(normalise(name));
  if (movement) return movement.slot !== "warmup" && movement.slot !== "cooldown" && !["none", "band"].includes(movement.kit);
  const ex = getExerciseByName(name);
  return !!ex && LOADED_KIT.test(ex.equipment) && !/bodyweight|band|none/i.test(ex.equipment);
}

const UPPER_WARMUP: ProgramDrill[] = [
  prep("Band pull-aparts", 3, 10),
  prep("Band face pulls", 3, 12),
  prep("Shoulder dislocates", 2, 10),
  prep("Arm circles", 2, 15, "2 × 15s each direction"),
  prep("Cat cow", 1, 30, "1 × 30s"),
];

export const UPPER_WARMUP_DEFAULTS = UPPER_WARMUP.map((d) => d.name);

function prep(name: string, sets: number, reps: number, prescription?: string): ProgramDrill {
  return {
    name, sets, reps, prescription, slot: "warmup", rest: 15,
    completionOnly: true,
    cue: "Move smoothly through a comfortable range.",
    reason: "Prepares the shoulders and upper back for pressing and pulling.",
  };
}

function upperWarmup(drills: ProgramDrill[], type: ProgramDayType, chosen?: string[]): ProgramDrill[] {
  if (!["upper", "push"].includes(type)) return drills;
  const names = new Set(drills.map((d) => normalise(d.name)));
  const requested = chosen === undefined ? UPPER_WARMUP_DEFAULTS : chosen;
  const additions = requested
    .map((name) => UPPER_WARMUP.find((d) => normalise(d.name) === normalise(name)) ?? prep(name, 1, 10))
    .filter((d) => !names.has(normalise(d.name)));
  return [...additions, ...drills];
}

function ensureWarmup(drills: ProgramDrill[]): ProgramDrill[] {
  if (drills.some((d) => d.slot === "warmup")) return drills;
  const donor = MOVEMENTS.find((m) => m.slot === "warmup" && !isWeighted(m.name));
  if (!donor) return drills;
  return [
    {
      name: donor.name, sets: donor.dose.sets, reps: donor.dose.reps,
      prescription: donor.dose.unit === "reps" ? undefined : `${donor.dose.sets} × ${donor.dose.reps} ${donor.dose.unit}`,
      slot: "warmup", rest: donor.dose.rest, cue: donor.cue,
      reason: "Added because weighted work cannot serve as the session warm-up.",
    },
    ...drills,
  ];
}

function adaptDose(drills: ProgramDrill[], goals: GoalPreference[]): ProgramDrill[] {
  const types = sanitiseGoals(goals).map((g) => g.type);
  const primary = types[0];
  const mixedStrengthMuscle = primary === "strength" && types.includes("hypertrophy");
  return drills.map((d) => {
    if (!d.slot || !MAIN_SLOTS.has(d.slot)) return d;
    const compound = d.slot === "primary" || d.slot === "secondary";
    const primaryLift = d.slot === "primary";
    // Four-plus sets are reserved for the one lift the strength session is
    // built around. Applying 4–6 to every secondary and accessory turned a
    // sensible range into 25–35 working sets in one day.
    if (mixedStrengthMuscle) return {
      ...d,
      sets: primaryLift ? clamp(d.sets, 3, 4) : clamp(d.sets, 2, 3),
      reps: clamp(d.reps, 6, 12),
      rest: clamp(d.rest ?? 105, 90, 120),
      intensity: effortRangeText(7, 9),
    };
    if (primary === "strength") return {
      ...d,
      sets: primaryLift ? clamp(d.sets, 4, 6) : clamp(d.sets, 2, 3),
      reps: clamp(d.reps, 3, 6),
      rest: clamp(d.rest ?? 180, 180, 300),
      intensity: effortRangeText(8, 9),
    };
    if (primary === "hypertrophy") return {
      ...d,
      sets: 3,
      reps: clamp(d.reps, compound ? 8 : 10, 15),
      rest: clamp(d.rest ?? 75, 60, 90),
      intensity: effortRangeText(7, 9),
    };
    if (primary === "endurance" || primary === "fat_loss") return {
      ...d,
      sets: clamp(d.sets, 2, 3),
      reps: clamp(d.reps, 15, 25),
      rest: clamp(d.rest ?? 45, 30, 60),
      intensity: effortRangeText(5, 7),
    };
    return d;
  });
}

export function sessionExerciseCount(session: ProgramSession): number {
  return session.drills.filter((d) => d.slot ? MAIN_SLOTS.has(d.slot) : isWeighted(d.name)).length;
}

export function minimumExercises(type: ProgramDayType, goals: GoalPreference[], target?: number | null): number {
  if (type === "active_rest") return 0;
  if (target != null) return clamp(target, 5, 10);
  const primary = sanitiseGoals(goals)[0]?.type;
  if (primary === "strength") return 5;
  if (primary === "hypertrophy") return 7;
  if (primary === "endurance" || primary === "fat_loss") return 8;
  return ({ push: 6, pull: 6, legs: 5, upper: 7, lower: 5, full_body: 6, cardio: 8, active_rest: 0 } satisfies Record<ProgramDayType, number>)[type];
}

function ensureExerciseCount(
  drills: ProgramDrill[],
  type: ProgramDayType,
  settings: ProgramSettings,
  options: ApplyPreferencesOptions,
): ProgramDrill[] {
  const primary = sanitiseGoals(settings.goals)[0]?.type;
  // Sport-skill and rehab sessions are not gym sessions. The audit's 5–10
  // floor applies to lifting/circuit blocks, not a sprint or ball-work day.
  if (!settings.exerciseTarget && !["strength", "hypertrophy", "endurance", "fat_loss"].includes(primary ?? "")) return drills;
  // A real run is already a complete cardio session; it is not an eight-exercise circuit.
  if (type === "cardio" && drills.some((d) => d.slot === "conditioning") && settings.exerciseTarget == null) return drills;
  const wanted = minimumExercises(type, settings.goals, settings.exerciseTarget);
  const current = drills.filter((d) => d.slot ? MAIN_SLOTS.has(d.slot) : isWeighted(d.name));
  if (current.length >= wanted) return drills;
  const names = new Set(drills.map((d) => normalise(d.name)));
  const pool = candidatePool(type, settings.musclePriorities, options.sport)
    .filter((m) => !names.has(normalise(m.name)))
    .filter((m) => safeForPain(m, options.painMap))
    .filter((m) => !options.constraints || (
      !isExcluded(options.constraints, m.region, m.name)
      && hasEquipmentFor(options.constraints, m.kit)
    ));
  const additions = pool.slice(0, wanted - current.length).map(toAccessory);
  const at = drills.findIndex((d) => d.slot === "conditioning" || d.slot === "cooldown");
  return at < 0 ? [...drills, ...additions] : [...drills.slice(0, at), ...additions, ...drills.slice(at)];
}

function candidatePool(type: ProgramDayType, priorities: ProgramSettings["musclePriorities"], sport?: SportId): Movement[] {
  const score = (m: Movement): number => {
    const hay = `${m.name} ${m.region ?? ""}`.toLowerCase();
    return Object.entries(priorities ?? {}).reduce((n, [muscle, value]) => n + (hay.includes(muscle) ? Number(value) || 0 : 0), 0);
  };
  return MOVEMENTS
    .filter((movement) => !sport || !movement.sports?.length || movement.sports.includes(sport))
    .filter((movement) => movementMatchesDay(movement, type))
    .sort((a, b) => score(b) - score(a) || slotRank(a.slot) - slotRank(b.slot));
}

function movementMatchesDay(m: Movement, type: ProgramDayType): boolean {
  if (!MAIN_SLOTS.has(m.slot) && m.slot !== "conditioning") return false;
  const r = m.region ?? "";
  const p = m.pattern;
  if (type === "push") return ["chest", "shoulders", "arms"].includes(r) || p.startsWith("push");
  if (type === "pull") return ["back", "arms"].includes(r) || p.startsWith("pull");
  if (type === "legs" || type === "lower") return r === "legs" || ["squat", "hinge", "lunge"].includes(p);
  if (type === "upper") return r !== "legs" && r !== "running" && r !== "conditioning";
  if (type === "cardio") return m.slot === "conditioning" || m.targets.includes("endurance");
  return true;
}

/**
 * Make explicit exercise picks survive the AI route too.
 *
 * The local engine scores `mustInclude`; the production model never receives
 * those ids. This final pass sees both outputs, places each safe pick on the
 * best matching day once per week, and marks it so the time-fit optimiser knows
 * it came from the athlete rather than from a generic candidate pool.
 */
function ensurePreferredMovements(
  input: ProgramSession[],
  settings: ProgramSettings,
  options: ApplyPreferencesOptions,
): ProgramSession[] {
  const requested = (settings.mustInclude ?? [])
    .map((id) => MOVEMENTS.find((movement) => movement.id === id))
    .filter((movement): movement is Movement => !!movement)
    .filter((movement) => !options.sport || !movement.sports?.length || movement.sports.includes(options.sport))
    .filter((movement) => safeForPain(movement, options.painMap))
    .filter((movement) => !options.constraints || (
      !isExcluded(options.constraints, movement.region, movement.name)
      && hasEquipmentFor(options.constraints, movement.kit)
    ));
  if (!requested.length) return input;

  let sessions = input.map((session) => ({ ...session, drills: session.drills.map((drill) => ({ ...drill })) }));
  for (const movement of requested) {
    const existing = sessions.findIndex((session) => session.drills.some((drill) => normalise(drill.name) === normalise(movement.name)));
    if (existing >= 0) {
      sessions[existing] = {
        ...sessions[existing],
        drills: sessions[existing].drills.map((drill) => normalise(drill.name) === normalise(movement.name)
          ? { ...drill, preferred: true }
          : drill),
      };
      continue;
    }

    const candidates = sessions
      .map((session, index) => ({ session, index, type: inferDayType(session.title) }))
      .filter(({ session, type }) => session.kind !== "active_rest" && movementMatchesDay(movement, type))
      .sort((a, b) => {
        const count = (entry: typeof a) => entry.session.drills.filter((drill) => drill.slot === movement.slot).length;
        return count(a) - count(b) || a.session.day - b.session.day;
      });
    const target = candidates[0] ?? sessions.map((session, index) => ({ session, index, type: inferDayType(session.title) }))
      .find(({ session }) => session.kind !== "active_rest");
    if (!target) continue;

    const added: ProgramDrill = {
      name: movement.name, sets: movement.dose.sets, reps: movement.dose.reps,
      prescription: movement.dose.unit === "reps" ? undefined : `${movement.dose.sets} × ${movement.dose.reps} ${movement.dose.unit}`,
      slot: movement.slot, rest: movement.dose.rest,
      intensity: effortText(movement.dose.rpe),
      tempo: movement.dose.tempo, cue: movement.cue,
      reason: "Chosen in your programme builder and placed on the best-fitting day.",
      preferred: true,
    };
    sessions[target.index] = {
      ...target.session,
      drills: orderBySlot([...target.session.drills, added]),
    };
  }
  return sessions;
}

function safeForPain(m: Movement, pain: PainMap | undefined): boolean {
  if (!pain) return true;
  for (const [raw, value] of Object.entries(pain)) {
    const area = raw.replace(/_(left|right)$/i, "") as keyof typeof m.load;
    if (Number(value) >= 7 && Number(m.load[area] ?? 0) >= 2) return false;
  }
  return true;
}

function toAccessory(m: Movement): ProgramDrill {
  return {
    name: m.name,
    sets: m.dose.sets,
    reps: m.dose.reps,
    slot: m.slot === "primary" ? "secondary" : m.slot,
    rest: m.dose.rest,
    intensity: effortText(m.dose.rpe),
    tempo: m.dose.tempo,
    cue: m.cue,
    reason: "Added to give this session a balanced, complete main block.",
  };
}

function orderBySlot(drills: ProgramDrill[]): ProgramDrill[] {
  const order: (Slot | undefined)[] = ["warmup", "primary", "secondary", "accessory", "skill", "conditioning", "cooldown", undefined];
  return drills.map((d, i) => ({ d, i })).sort((a, b) => order.indexOf(a.d.slot) - order.indexOf(b.d.slot) || a.i - b.i).map((x) => x.d);
}

function inferDayType(title: string): ProgramDayType {
  const t = title.toLowerCase();
  if (/active rest|recovery/.test(t)) return "active_rest";
  if (/push|chest|shoulder|triceps/.test(t)) return "push";
  if (/pull|back|biceps/.test(t)) return "pull";
  if (/upper/.test(t)) return "upper";
  if (/lower/.test(t)) return "lower";
  if (/leg/.test(t)) return "legs";
  if (/condition|cardio|run/.test(t)) return "cardio";
  return "full_body";
}

function slotRank(slot: Slot): number {
  return ({ primary: 0, secondary: 1, accessory: 2, conditioning: 3, skill: 4, warmup: 5, cooldown: 6 } satisfies Record<Slot, number>)[slot];
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
