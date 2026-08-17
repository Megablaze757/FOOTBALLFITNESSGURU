// =============================================================================
// Running — zones, run types and week structure.
//
// WHY THIS EXISTS. "Running" was already a sport (lib/sport-profile.ts picked
// the accent and put Progress first; lib/sport-terms.ts stopped asking a runner
// about match minutes). What was missing was the actual sport. A runner opened
// their plan and got shuttle runs, sled pushes and a bike interval — the
// conditioning block a footballer gets — because lib/movements.ts had no notion
// of a run longer than 100 metres. Nothing in the app knew that an easy run and
// a threshold run are different things, so a runner logging 10km on Tuesday and
// 10km on Saturday had the two counted identically.
//
// That is the one distinction the sport is built on. Every training decision a
// runner makes is "how hard, for how long" — and the answer is a ZONE. So zones
// are the primitive here, and every run type is a prescription written in them.
//
// WHAT'S IN HERE
//   * Five zones, defined against heart rate AND pace, because runners have one
//     or the other and rarely both.
//   * Threshold pace derived from any race the athlete has actually run, so the
//     paces are theirs rather than a table's.
//   * Fourteen run types — the whole vocabulary, including the three that are
//     usually left out of apps (strides, shakeout, progression) because they
//     don't fit a "session" shape.
//   * The rules that stop a week from hurting someone: the 80/20 split, a cap
//     on hard days, and how fast weekly volume may grow.
//
// Pure + dependency-free, so it runs in the browser on GitHub Pages and is unit
// tested. No attribution on the run types or the zone bands: these are standard
// coaching property, taught the same way everywhere, and inventing a provenance
// for them would be dishonest.
// =============================================================================

/** Zones are 1–5. Anything faster than 5 is neuromuscular, not aerobic — see `REP_PACE_RANGE`. */
export type ZoneId = 1 | 2 | 3 | 4 | 5;

export interface Zone {
  id: ZoneId;
  /** Short name a runner would actually say. */
  name: string;
  /** What the zone is FOR. Not what it feels like — that's `feel`. */
  purpose: string;
  /** The talk test, which is the only zone tool available to someone with no watch. */
  feel: string;
  /** Percent of maximum heart rate, [low, high]. */
  pctMaxHr: [number, number];
  /** Percent of heart-rate reserve (Karvonen), [low, high]. */
  pctHrReserve: [number, number];
  /**
   * Multiplier on THRESHOLD pace, [fastest, slowest]. Above 1 is slower —
   * pace is time per distance, so a bigger number is a slower run. Ordered
   * fastest-first so it reads the same way round as the HR ranges.
   */
  paceFactor: [number, number];
  /** Rating of perceived exertion out of 10, [low, high]. */
  rpe: [number, number];
  /** Hex colour used by the zone bar and the log chips. */
  colour: string;
}

/**
 * The five zones.
 *
 * The HR percentages are the conventional bands. The pace factors are the
 * important half for a runner without a chest strap, and they are anchored on
 * threshold rather than on race pace because threshold is the one effort that
 * stays stable across distances — a 5k runner and a marathoner with the same
 * threshold train at nearly the same easy pace.
 */
export const ZONES: Record<ZoneId, Zone> = {
  1: {
    id: 1,
    name: "Recovery",
    purpose: "Move blood through tired legs without adding any training stress.",
    feel: "Conversational to the point of feeling silly. You should finish feeling better than you started.",
    pctMaxHr: [50, 60],
    pctHrReserve: [50, 60],
    paceFactor: [1.28, 1.45],
    rpe: [1, 3],
    colour: "#64748b",
  },
  2: {
    id: 2,
    name: "Easy",
    purpose: "Build the aerobic base. This is where most of the week lives.",
    feel: "Full sentences without gasping. If you can't talk, you're in Zone 3 and it's costing you.",
    pctMaxHr: [60, 70],
    pctHrReserve: [60, 70],
    paceFactor: [1.15, 1.28],
    rpe: [3, 5],
    colour: "#38bdf8",
  },
  3: {
    id: 3,
    name: "Steady",
    purpose: "Marathon effort. Useful in its place, and the easiest zone to drift into by accident.",
    feel: "Short sentences. Comfortably hard — you know you're working.",
    pctMaxHr: [70, 80],
    pctHrReserve: [70, 80],
    paceFactor: [1.06, 1.15],
    rpe: [5, 7],
    colour: "#4ade80",
  },
  4: {
    id: 4,
    name: "Threshold",
    purpose: "Raise the pace you can hold before lactate runs away from you.",
    feel: "A few words at a time. Sustainable for about an hour in a race, no longer.",
    pctMaxHr: [80, 90],
    pctHrReserve: [80, 90],
    paceFactor: [0.98, 1.06],
    rpe: [7, 8],
    colour: "#e3b53f",
  },
  5: {
    id: 5,
    name: "VO2 max",
    purpose: "Stretch the ceiling — the most oxygen you can actually use.",
    feel: "No talking. Three to five minutes is all you'd manage in one go.",
    pctMaxHr: [90, 100],
    pctHrReserve: [90, 100],
    paceFactor: [0.90, 0.98],
    rpe: [9, 10],
    colour: "#f0824a",
  },
};

export const ZONE_LIST: Zone[] = [ZONES[1], ZONES[2], ZONES[3], ZONES[4], ZONES[5]];

/**
 * Repetition pace — faster than Zone 5, and deliberately NOT a sixth zone.
 *
 * Zones measure aerobic effort, and rep work isn't aerobic: 200m flat out with
 * three minutes standing recovery trains the nervous system and running economy,
 * and the heart-rate reading from it is meaningless because the rep ends before
 * HR catches up. Calling it "Zone 6" invites people to add up time-in-zone and
 * conclude they did a hard aerobic session when they did not.
 */
export const REP_PACE_RANGE: [number, number] = [0.84, 0.90];

// --- Heart rate --------------------------------------------------------------

/**
 * Age-predicted maximum heart rate.
 *
 * 208 − 0.7 × age, not the 220 − age everyone quotes. The older formula was
 * never derived from a study — it came from a line drawn through a graph in the
 * 1970s — and it underestimates max HR in older athletes by a decade's worth of
 * beats, which pushes every zone too low for exactly the people most likely to
 * be relying on it.
 *
 * Still an estimate. A real maximum from a race finish or a hard hill session
 * beats this every time, which is why `hrZones` takes an override.
 */
export function estimateMaxHr(age: number): number {
  return Math.round(208 - 0.7 * age);
}

export interface HrZoneInput {
  /** Measured max HR. Wins over `age` when both are given. */
  maxHr?: number | null;
  age?: number | null;
  /** Enables the heart-rate-reserve method, which is the more personal of the two. */
  restingHr?: number | null;
}

export interface HrZoneRange {
  zone: ZoneId;
  low: number;
  high: number;
}

/**
 * Heart-rate ranges per zone, in bpm.
 *
 * Uses heart-rate reserve (max − resting, the Karvonen method) when a resting
 * HR is known, and plain percent-of-max otherwise. HRR is worth the extra input:
 * two runners with the same max and a 15bpm difference in resting HR do not
 * share an easy pace, and percent-of-max says they do.
 *
 * Returns null when there isn't enough to work with, rather than inventing an
 * age — a wrong zone is worse than no zone, because the runner will believe it.
 */
export function hrZones(input: HrZoneInput): HrZoneRange[] | null {
  const max = input.maxHr ?? (input.age != null && input.age > 0 ? estimateMaxHr(input.age) : null);
  if (!max || max <= 0) return null;

  const rest = input.restingHr ?? null;
  const useReserve = rest != null && rest > 0 && rest < max;
  const reserve = useReserve ? max - rest : 0;

  return ZONE_LIST.map((z) => {
    const [lo, hi] = useReserve ? z.pctHrReserve : z.pctMaxHr;
    const at = (pct: number) => (useReserve ? rest! + (reserve * pct) / 100 : (max * pct) / 100);
    return { zone: z.id, low: Math.round(at(lo)), high: Math.round(at(hi)) };
  });
}

/** Which zone a heart rate falls in. Null when it's below Zone 1. */
export function zoneForHr(bpm: number, ranges: HrZoneRange[]): ZoneId | null {
  // Walk down so the boundary beat (where one zone's high equals the next's low)
  // resolves to the harder zone — the honest reading of a borderline effort.
  for (let i = ranges.length - 1; i >= 0; i--) {
    if (bpm >= ranges[i].low) return ranges[i].zone;
  }
  return null;
}

// --- Pace --------------------------------------------------------------------

/**
 * Race-time equivalence across distances.
 *
 * time2 = time1 × (dist2 / dist1) ^ 1.06. The exponent is the published one and
 * encodes a real fact: doubling the distance costs more than double the time,
 * because you cannot hold the shorter race's pace.
 *
 * Honest about its limits — it drifts for very short (<1500m) and very long
 * (>marathon) extrapolations, and it assumes the athlete has trained for the
 * target distance. A 5k time does not tell you someone's marathon if they've
 * never run beyond 10k.
 */
export const RIEGEL_EXPONENT = 1.06;

export function riegel(knownTimeSec: number, knownKm: number, targetKm: number): number {
  if (knownTimeSec <= 0 || knownKm <= 0 || targetKm <= 0) return 0;
  return knownTimeSec * Math.pow(targetKm / knownKm, RIEGEL_EXPONENT);
}

/**
 * Threshold pace, in seconds per km, from any race the athlete has run.
 *
 * Threshold is defined here as the pace they could hold for a ONE-HOUR race —
 * the standard operational definition, and the one that makes the zone factors
 * above mean anything. So rather than guessing, invert Riegel to find the
 * distance whose predicted time is 3600s:
 *
 *     3600 = t × (D / d) ^ 1.06     →     D = d × (3600 / t) ^ (1 / 1.06)
 *
 * and the threshold pace is 3600 / D.
 */
export function thresholdPaceFromRace(raceTimeSec: number, raceKm: number): number | null {
  if (raceTimeSec <= 0 || raceKm <= 0) return null;
  const hourDistanceKm = raceKm * Math.pow(3600 / raceTimeSec, 1 / RIEGEL_EXPONENT);
  if (!isFinite(hourDistanceKm) || hourDistanceKm <= 0) return null;
  return Math.round(3600 / hourDistanceKm);
}

/** Benchmark keys this module can read a race out of, and their distance in km. */
export const RACE_METRICS: Record<string, number> = {
  run_1500m_min: 1.5,
  run_5k_min: 5,
  run_10k_min: 10,
};

/**
 * Threshold pace from the athlete's logged benchmarks.
 *
 * Prefers the LONGEST race available, because extrapolating up from 1500m to an
 * hour is a bigger leap than from 10k — the further the known race is from an
 * hour, the more of the answer is the formula's opinion rather than the runner's.
 *
 * Benchmark values are stored in MINUTES (see METRIC_CATALOG), hence the ×60.
 */
export function thresholdPaceFromBenchmarks(metrics: Record<string, number> | null | undefined): number | null {
  if (!metrics) return null;
  const candidates = Object.entries(RACE_METRICS)
    .filter(([key]) => typeof metrics[key] === "number" && metrics[key] > 0)
    .sort((a, b) => b[1] - a[1]);
  const best = candidates[0];
  if (!best) return null;
  return thresholdPaceFromRace(metrics[best[0]] * 60, best[1]);
}

export interface PaceZoneRange {
  zone: ZoneId;
  /** Seconds per km. `fast` is the lower number — the harder end of the zone. */
  fastSecPerKm: number;
  slowSecPerKm: number;
}

/** Pace ranges per zone, in seconds per km, from a threshold pace. */
export function paceZones(thresholdSecPerKm: number): PaceZoneRange[] {
  return ZONE_LIST.map((z) => ({
    zone: z.id,
    fastSecPerKm: Math.round(thresholdSecPerKm * z.paceFactor[0]),
    slowSecPerKm: Math.round(thresholdSecPerKm * z.paceFactor[1]),
  }));
}

/** Repetition pace range (faster than Zone 5), seconds per km. */
export function repPace(thresholdSecPerKm: number): { fastSecPerKm: number; slowSecPerKm: number } {
  return {
    fastSecPerKm: Math.round(thresholdSecPerKm * REP_PACE_RANGE[0]),
    slowSecPerKm: Math.round(thresholdSecPerKm * REP_PACE_RANGE[1]),
  };
}

const KM_PER_MILE = 1.609344;

/** "4:15" from 255 seconds. Pace is always mm:ss — never decimal minutes. */
export function formatPace(secPerKm: number, unit: "km" | "mile" = "km"): string {
  const s = unit === "mile" ? secPerKm * KM_PER_MILE : secPerKm;
  if (!isFinite(s) || s <= 0) return "–";
  const total = Math.round(s);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** "4:15" or "4:15/km" → 255. Null on anything it can't read. */
export function parsePace(text: string): number | null {
  const m = /^\s*(\d{1,3}):([0-5]\d)\s*(?:\/\s*(km|mi|mile))?\s*$/i.exec(text);
  if (!m) return null;
  const sec = Number(m[1]) * 60 + Number(m[2]);
  return /^mi/i.test(m[3] ?? "") ? Math.round(sec / KM_PER_MILE) : sec;
}

/** A zone's pace shown as a range, e.g. "5:34–6:12". */
export function formatPaceRange(r: PaceZoneRange, unit: "km" | "mile" = "km"): string {
  return `${formatPace(r.fastSecPerKm, unit)}–${formatPace(r.slowSecPerKm, unit)}`;
}

// --- Run types ---------------------------------------------------------------

export type RunTypeId =
  | "recovery" | "easy" | "long" | "steady" | "progression"
  | "tempo" | "cruise" | "vo2" | "reps" | "fartlek"
  | "hills" | "strides" | "shakeout" | "timetrial"
  // Not a run, and it belongs here anyway — see the entry in RUN_TYPES.
  | "incline";

export interface RunType {
  id: RunTypeId;
  label: string;
  /** Zones the run actually spends its time in. */
  zones: ZoneId[];
  /** The zone the session is ABOUT — what it's prescribed for. */
  primaryZone: ZoneId;
  /** One line: why it's in the plan. Shown under the name everywhere. */
  purpose: string;
  /** How to actually run it. */
  howTo: string;
  /**
   * Does this count against the week's hard-session budget?
   *
   * Strides and shakeouts are fast but not hard — they're too short to cost
   * anything. Getting this wrong in either direction is how a plan either
   * overcooks someone or never lets them run fast.
   */
  hard: boolean;
  /** Typical session length in minutes, [low, high], warm-up and cool-down included. */
  minutes: [number, number];
  /**
   * Share of the session actually spent at the target intensity.
   *
   * THIS IS THE NUMBER THAT MAKES 80/20 MEAN ANYTHING. A tempo session is an
   * hour long and about 25 minutes of it is at threshold; the rest is the
   * warm-up and cool-down, which are easy running and adapt like easy running.
   * Counting the whole hour as hard said a perfectly ordinary week was 66% easy
   * and told the athlete to back off work they should have been doing.
   *
   * So the split is measured in time at intensity, which is how coaches
   * actually apply the rule, rather than by labelling whole sessions.
   */
  hardFraction: number;
  /** Days of easy running most people need after it before the next hard day. */
  recoveryDays: number;
  /** What to watch for — the failure mode of this specific session. */
  watchFor: string;
  /**
   * The shape of the session, when it HAS a shape.
   *
   * `howTo` already says "6–10 × 45–90 seconds" in English, and English is not
   * something the log form can pre-fill or the load maths can read. This is the
   * same prescription as numbers, so a runner opening the log for a hill session
   * starts from the session they were given rather than an empty box.
   *
   * Null for the runs that genuinely have no reps — an easy run, a long run, a
   * fartlek. Fartlek is the interesting exclusion: it has surges, but the whole
   * point is that they are unplanned, and asking someone to count them turns the
   * one unstructured session in the list into homework.
   */
  interval?: IntervalShape;
}

/**
 * How an interval session is built: how many efforts, how long each one is, and
 * how long the jog between them is.
 *
 * Every field is a [low, high] range because these are prescriptions, not
 * measurements — "6–10 × 45–90 seconds" is the actual coaching instruction, and
 * collapsing it to a single number would invent a precision the session doesn't
 * have.
 */
export interface IntervalShape {
  /** Number of efforts, [low, high]. [1, 1] for a continuous block like a tempo. */
  reps: [number, number];
  /** Length of ONE effort in seconds, [low, high]. */
  seconds: [number, number];
  /**
   * Jog or walk between efforts in seconds, [low, high]. Null where the
   * recovery is untimed by design — you go again when you're ready.
   */
  recovery: [number, number] | null;
}

/**
 * The full vocabulary.
 *
 * Ordered easiest to hardest, then the two that aren't sessions in their own
 * right (strides, shakeout), then the test. A runner scanning this list should
 * be able to find the run they just did without knowing our names for things,
 * which is why the labels use the words people say rather than the physiology.
 */
export const RUN_TYPES: RunType[] = [
  {
    id: "recovery",
    label: "Recovery run",
    zones: [1],
    primaryZone: 1,
    purpose: "Add blood flow, not fitness. The day after something hard.",
    howTo:
      "20–40 minutes at a pace that feels almost embarrassingly slow. Flat route, no watch-chasing. " +
      "If you finish more tired than you started, it was too fast to be a recovery run.",
    hard: false,
    minutes: [20, 40],
    hardFraction: 0,
    recoveryDays: 0,
    watchFor: "Creeping into Zone 2. This is the run people most often ruin by treating it as an easy run.",
  },
  {
    /**
     * A WALK, IN THE RUN LIST, ON PURPOSE.
     *
     * It was only in the exercise catalogue, which meant an athlete who did
     * forty minutes on a 12% incline had to log it as a drill — sets and reps
     * for something that has neither. Everything about it behaves like an easy
     * run and nothing about it behaves like an exercise: it is prescribed in
     * minutes, it is steady Zone 2, it accrues aerobic load, and it is the
     * session people are told to do INSTEAD of an easy run when their joints
     * need a week off. Filing it by whether the feet leave the ground put it in
     * the one place it could not be logged properly.
     *
     * It stays in lib/exercises.ts as well, because the programme engine
     * prescribes it by id and the library is where its how-to lives.
     */
    id: "incline",
    label: "Incline treadmill walk",
    zones: [2],
    primaryZone: 2,
    purpose: "Aerobic work with almost no joint load. The easy run for a week your legs can't take one.",
    howTo:
      "20–40 minutes at 10–15% and a pace you could talk at. Hands off the handrails — holding on " +
      "takes most of the load out and turns a real session into nothing.",
    hard: false,
    minutes: [20, 40],
    hardFraction: 0,
    recoveryDays: 0,
    watchFor: "Gripping the rails, or walking so fast you're braking with every step. Steep and slow beats flat and fast.",
  },
  {
    id: "easy",
    label: "Easy run",
    zones: [2],
    primaryZone: 2,
    purpose: "The bread and butter. Most of your week should be this and nothing cleverer.",
    howTo:
      "30–75 minutes where you could hold a conversation the whole way. Nose-breathing should be " +
      "possible for most of it.",
    hard: false,
    minutes: [30, 75],
    hardFraction: 0,
    recoveryDays: 0,
    watchFor: "Drifting to Zone 3 on hills or at the end. Easy days easy is what makes hard days possible.",
  },
  {
    id: "long",
    label: "Long run",
    zones: [2, 3],
    primaryZone: 2,
    purpose: "Time on feet. Builds the aerobic engine and the durability to use it.",
    howTo:
      "The week's longest run, mostly Zone 2, allowed to drift to Zone 3 late on. Build it by " +
      "time rather than distance if you're new — an hour is an hour whatever pace you run it at.",
    hard: false,
    minutes: [60, 150],
    hardFraction: 0,
    recoveryDays: 1,
    watchFor:
      "Making it more than about a third of weekly volume. That's where long runs stop building and start " +
      "costing the rest of the week.",
  },
  {
    id: "steady",
    label: "Steady run",
    zones: [3],
    primaryZone: 3,
    purpose: "Marathon effort. Rehearses race pace and teaches fuelling.",
    howTo: "30–70 minutes at a comfortably hard, even effort. Short sentences, not silence.",
    hard: true,
    minutes: [40, 80],
    hardFraction: 0.8,
    recoveryDays: 1,
    watchFor:
      "Doing it every week. Zone 3 is the grey zone — hard enough to tire you, easy enough not to " +
      "drive much adaptation, so it earns its place only when a race calls for it.",
  },
  {
    id: "progression",
    label: "Progression run",
    zones: [2, 3, 4],
    primaryZone: 3,
    purpose: "Start easy, finish strong. Trains pacing discipline and a fast finish.",
    howTo:
      "Split it in thirds: Zone 2, then Zone 3, then Zone 4 for the last third. The whole point is " +
      "that the first third feels too slow.",
    hard: true,
    minutes: [40, 75],
    hardFraction: 0.35,
    recoveryDays: 1,
    watchFor: "Starting in Zone 3 so there's nowhere to progress to. If the last third isn't the fastest, it wasn't one.",
  },
  {
    id: "tempo",
    label: "Tempo / threshold",
    zones: [4],
    primaryZone: 4,
    purpose: "Raise the pace you can hold before you start slowing down.",
    howTo:
      "15 min easy, then 20–40 minutes continuous at threshold — the pace you could race for an hour — " +
      "then 10 min easy. Comfortably uncomfortable, and even the whole way.",
    hard: true,
    minutes: [45, 70],
    hardFraction: 0.45,
    recoveryDays: 1,
    watchFor: "Racing it. A tempo run finished at full stretch was an interval session with no rest.",
    // One continuous block, which is exactly what makes it a tempo rather than
    // cruise intervals. Logged the same way as everything else so the hard
    // fraction is measured here too — a "tempo" with 12 minutes at threshold
    // inside an hour is a different session from one with 40, and until this
    // existed both scored as 45%.
    interval: { reps: [1, 1], seconds: [1200, 2400], recovery: null },
  },
  {
    id: "cruise",
    label: "Cruise intervals",
    zones: [4],
    primaryZone: 4,
    purpose: "Threshold work in bites, so you can hold the pace longer than you could in one go.",
    howTo:
      "4–6 × 5–8 minutes at threshold with 60–90 seconds jogging between. The rest is short on purpose — " +
      "it isn't meant to be full recovery.",
    hard: true,
    minutes: [50, 75],
    hardFraction: 0.5,
    recoveryDays: 1,
    watchFor: "Taking long rests and running the reps faster. That turns it into a VO2 session with a different cost.",
    // The short recovery is the session's identity, not an afterthought, which
    // is why it is worth logging: 5 × 6min off 60s and 5 × 6min off 4min are
    // different workouts wearing the same name.
    interval: { reps: [4, 6], seconds: [300, 480], recovery: [60, 90] },
  },
  {
    id: "vo2",
    label: "VO2 max intervals",
    zones: [5],
    primaryZone: 5,
    purpose: "Raise the ceiling — the most oxygen your body can use.",
    howTo:
      "5–6 × 3 minutes hard with equal jogging recovery, or 6–8 × 800m. The rep should be hard from " +
      "about halfway, not from the first stride.",
    hard: true,
    minutes: [50, 75],
    hardFraction: 0.25,
    recoveryDays: 2,
    watchFor:
      "Going too fast early and fading. Every rep should be the same speed — the last one is the one that counts.",
    interval: { reps: [5, 6], seconds: [180, 240], recovery: [120, 180] },
  },
  {
    id: "reps",
    label: "Repetitions / speed",
    zones: [5],
    primaryZone: 5,
    purpose: "Running economy and leg speed. Trains the nervous system, not the engine.",
    howTo:
      "8–12 × 200–400m fast and relaxed, with full recovery — two to three minutes, walked. " +
      "Form should look better at the end of a rep than at the start.",
    hard: true,
    minutes: [40, 60],
    hardFraction: 0.15,
    recoveryDays: 2,
    watchFor:
      "Cutting the recovery to make it 'harder'. Short rest turns speed work into a lactate session and you " +
      "lose the thing you came for.",
    // 200–400m at rep pace is roughly 30–90 seconds, and the recovery is longer
    // than the effort on purpose. Logging it is what lets the app notice when
    // somebody has quietly cut it — see `incompleteRecovery`.
    interval: { reps: [8, 12], seconds: [30, 90], recovery: [120, 180] },
  },
  {
    id: "fartlek",
    label: "Fartlek",
    zones: [2, 3, 4, 5],
    primaryZone: 4,
    purpose: "Unstructured speed play. Hard work without a track or a stopwatch.",
    howTo:
      "Inside an easy run, surge for anything from 30 seconds to 4 minutes, easy in between until you're " +
      "ready to go again. Pick landmarks — the next lamppost, the top of the hill.",
    hard: true,
    minutes: [40, 70],
    hardFraction: 0.3,
    recoveryDays: 1,
    watchFor: "Never actually recovering between surges, which quietly makes it a very long threshold run.",
  },
  {
    id: "hills",
    label: "Hill repeats",
    zones: [4, 5],
    primaryZone: 5,
    purpose: "Strength and power, with much less impact than flat speed work.",
    howTo:
      "6–10 × 45–90 seconds up a moderate hill, hard but controlled, jogging down to recover. " +
      "Short strides, tall posture, drive the arms.",
    hard: true,
    minutes: [40, 60],
    hardFraction: 0.2,
    recoveryDays: 1,
    watchFor:
      "Hammering the descent. Downhill running is where the muscle damage comes from — jog it, or you'll " +
      "pay for it two days later.",
    // The recovery is the jog back down, so it is roughly the length of the
    // climb — which is why it is a range rather than a fixed rest.
    interval: { reps: [6, 10], seconds: [45, 90], recovery: [60, 120] },
  },
  {
    id: "strides",
    label: "Strides",
    zones: [5],
    primaryZone: 5,
    purpose: "Keeps the legs quick without any real cost. Bolted onto an easy day.",
    howTo:
      "4–6 × 15–20 seconds accelerating to about 90% and floating back down, with a full walk-back " +
      "between. At the end of an easy run, or before a session as a primer.",
    hard: false,
    minutes: [5, 10],
    hardFraction: 0,
    recoveryDays: 0,
    watchFor: "Treating them as sprints. They should feel fast and easy, never maximal.",
    interval: { reps: [4, 6], seconds: [15, 20], recovery: [45, 60] },
  },
  {
    id: "shakeout",
    label: "Shakeout",
    zones: [1],
    primaryZone: 1,
    purpose: "The day before a race, or the morning of one. Loosens rather than trains.",
    howTo: "15–25 minutes very easy, optionally with a couple of strides at the end to wake the legs up.",
    hard: false,
    minutes: [15, 25],
    hardFraction: 0,
    recoveryDays: 0,
    watchFor: "Doing more because you feel fresh. Feeling fresh is the point — it's the taper working.",
  },
  {
    id: "timetrial",
    label: "Time trial / race",
    zones: [4, 5],
    primaryZone: 5,
    purpose: "Measures where you actually are, and resets every pace in this list.",
    howTo:
      "Race the distance properly, warmed up and rested. Log the time as a benchmark afterwards so " +
      "your zones move with your fitness.",
    hard: true,
    minutes: [30, 90],
    hardFraction: 0.7,
    recoveryDays: 2,
    watchFor: "Doing one too often. A test you haven't recovered from measures your fatigue, not your fitness.",
  },
];

export function runType(id: RunTypeId): RunType | null {
  return RUN_TYPES.find((r) => r.id === id) ?? null;
}

// --- What an interval session actually cost ----------------------------------
//
// THE PROBLEM THIS SOLVES. Until now an interval session was logged as a
// duration and a 1–10 intensity slider the athlete dragged by feel, and the two
// were multiplied into a session load. Both halves were wrong in the same
// direction:
//
//   * The slider asks "how hard was that session" about a session that had two
//     intensities in it. People answer with how hard the REPS felt, because that
//     is what they remember, so 8 × 90 seconds inside a 50-minute session got
//     rated a 9 — and 50 × 9 says that session cost more than a 90-minute long
//     run. It did not.
//
//   * `hardFraction` on the run type was a constant. Every hill session scored
//     20% at intensity whether it was 6 × 45s or 12 × 90s — a threefold
//     difference in the only part of the session that was actually hard.
//
// Number of efforts and how long each one was is all it takes to replace both
// guesses with arithmetic, and they are two numbers a runner already knows
// without looking anything up.
//
// WHY A TIME-WEIGHTED BLEND. Session RPE means the average intensity of the
// whole session, and an interval session is mostly easy running by the clock.
// Weighting each part of the session by its own minutes is what coaches do on
// paper, and it is the only version that makes an interval session and a steady
// run comparable — which is the entire job of a load number.

/** The middle of a zone's RPE band. */
function midRpe(z: ZoneId): number {
  const [lo, hi] = ZONES[z].rpe;
  return (lo + hi) / 2;
}

/**
 * Absurd inputs to reject outright.
 *
 * A mistyped effort length is the dangerous one: "90" meaning 90 seconds typed
 * into a field read as minutes would report 8 × 90 minutes and hand ACWR a
 * number twenty times the athlete's real week, which is what tells them to rest.
 * Two hours is longer than any interval anybody runs.
 */
const MAX_EFFORT_SECONDS = 7200;
const MAX_INTERVALS = 100;

export interface RunEffort {
  /** Minutes actually spent at the working intensity. */
  workMinutes: number;
  /** Minutes of jog recovery between efforts. Zero when it wasn't logged. */
  recoveryMinutes: number;
  /** The rest of the session — warm-up and cool-down. */
  easyMinutes: number;
  /** Share of the session at the working intensity. MEASURED, not the type's estimate. */
  hardFraction: number;
  /** Session RPE, 1–10. This is what `sessionLoad` multiplies the minutes by. */
  intensity: number;
  /** Rests shorter than the efforts — deliberate in cruise intervals, a mistake in rep work. */
  incompleteRecovery: boolean;
  /** One line for the athlete, so the number isn't unexplained. */
  note: string;
}

export interface RunEffortInput {
  intervals?: number | null;
  /** Length of ONE effort, in seconds. */
  effortSeconds?: number | null;
  /** Jog between efforts, in seconds. Optional — the maths works without it. */
  recoverySeconds?: number | null;
  /** Whole session including warm-up and cool-down. */
  totalMinutes?: number | null;
  /** The zone the efforts were run at. Falls back to the one the type prescribes. */
  zone?: ZoneId | null;
  type?: RunTypeId | null;
}

/**
 * Intensity and hard-time from the shape of the session.
 *
 * Returns null when there is no usable interval data, which is the common case —
 * every caller has to keep its existing behaviour for an ordinary run, and
 * "absent" must not collapse to "zero intervals".
 */
export function intervalEffort(input: RunEffortInput): RunEffort | null {
  const reps = Math.floor(Number(input.intervals) || 0);
  const effort = Number(input.effortSeconds) || 0;
  if (reps <= 0 || effort <= 0) return null;
  if (reps > MAX_INTERVALS || effort > MAX_EFFORT_SECONDS) return null;

  const workMinutes = (reps * effort) / 60;

  // reps − 1, not reps. There is no recovery after the last effort — that is
  // the cool-down — and counting one extra inflates every session by a rest.
  const rest = Number(input.recoverySeconds) || 0;
  const recoveryMinutes = reps > 1 && rest > 0 ? ((reps - 1) * rest) / 60 : 0;

  const zone = input.zone ?? (input.type ? runType(input.type)?.primaryZone : null) ?? 4;

  /**
   * A logged duration shorter than the work it contains is contradictory, and
   * the work is the half we trust: somebody who typed 8 × 3 min and then "20
   * minutes" has mistyped the duration, not run 24 minutes of efforts inside
   * 20. Raising the total keeps `hardFraction` inside 0–1 without discarding
   * either number.
   */
  const logged = Number(input.totalMinutes) || 0;
  const total = Math.max(logged, workMinutes + recoveryMinutes);

  /**
   * Short rests keep the heart rate up, so the jog between cruise intervals is
   * not easy running and should not be scored as it. Shorter recovery than
   * effort is the standard line between complete and incomplete recovery, and
   * it is the difference between a threshold session and a VO2 one.
   */
  const incompleteRecovery = rest > 0 && rest < effort;
  const restRpe = midRpe(incompleteRecovery ? 3 : 2);

  const easyMinutes = Math.max(0, total - workMinutes - recoveryMinutes);
  const blended =
    (workMinutes * midRpe(zone) + recoveryMinutes * restRpe + easyMinutes * midRpe(2)) / total;

  const hardFraction = workMinutes / total;
  const intensity = Math.max(1, Math.min(10, Math.round(blended)));

  return {
    workMinutes: round1(workMinutes),
    recoveryMinutes: round1(recoveryMinutes),
    easyMinutes: round1(easyMinutes),
    hardFraction: +hardFraction.toFixed(3),
    intensity,
    incompleteRecovery,
    note:
      `${reps} × ${formatEffort(effort)} at Zone ${zone} — ` +
      `${round1(workMinutes)} of ${round1(total)} minutes at intensity (${Math.round(hardFraction * 100)}%).`,
  };
}

/**
 * "8–10 × 45–90s off 60–120s" — a prescription in the words a runner uses.
 *
 * A single rep collapses to the block it is: "20:00–40:00 continuous", because
 * "1 × 20:00" is how a spreadsheet writes a tempo run and not how anyone says it.
 */
export function describeShape(shape: IntervalShape): string {
  const effort = timeRange(shape.seconds);
  if (shape.reps[0] === 1 && shape.reps[1] === 1) return `${effort} continuous`;

  const reps = shape.reps[0] === shape.reps[1] ? String(shape.reps[0]) : `${shape.reps[0]}–${shape.reps[1]}`;
  const rest = shape.recovery ? ` off ${timeRange(shape.recovery)}` : "";
  return `${reps} × ${effort}${rest}`;
}

/**
 * "45–90s", not "45s–90s".
 *
 * When both ends of a range are in the same unit the unit belongs once, at the
 * end — which is how the range is said out loud. Mixed units ("60s–2:00") have
 * to carry both, because dropping one would read as a single number.
 */
function timeRange([lo, hi]: [number, number]): string {
  if (lo === hi) return formatEffort(lo);
  // Inclusive of 120: "60–120s" is the way that range is said, even though a
  // lone 120 reads better as "2:00".
  if (hi <= 120) return `${Math.round(lo)}–${Math.round(hi)}s`;
  return `${formatEffort(lo)}–${formatEffort(hi)}`;
}

/** The middle of a prescription, for pre-filling a log. */
export function shapeMidpoint(shape: IntervalShape): { intervals: number; effortSeconds: number; recoverySeconds: number | null } {
  const mid = (r: [number, number]) => Math.round((r[0] + r[1]) / 2);
  return {
    intervals: mid(shape.reps),
    effortSeconds: mid(shape.seconds),
    recoverySeconds: shape.recovery ? mid(shape.recovery) : null,
  };
}

/** "90s" or "6:00" — seconds under two minutes, mm:ss above. */
export function formatEffort(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return "–";
  const s = Math.round(seconds);
  if (s < 120) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Run types that count against the week's hard-day budget. */
export const HARD_RUN_TYPES: RunTypeId[] = RUN_TYPES.filter((r) => r.hard).map((r) => r.id);

export function isHardRun(id: RunTypeId): boolean {
  return runType(id)?.hard ?? false;
}

// --- Week structure ----------------------------------------------------------

/**
 * The share of weekly running that should be easy (Zones 1–2).
 *
 * The 80/20 split is the most consistently supported finding in distance-running
 * training, and it is also the one recreational runners break most often — not
 * by doing too much hard work, but by running their easy days slightly too fast
 * and ending up with a week that is 60% Zone 3. That week feels productive and
 * adapts poorly.
 */
export const EASY_SHARE_TARGET = 0.8;

/**
 * Hard sessions per week, by how long someone has been running.
 *
 * The limit is recovery, not willpower. Three is the ceiling for almost everyone
 * and two is right for most, because the adaptation happens between the hard
 * days rather than during them.
 */
export const MAX_HARD_SESSIONS: Record<RunnerLevel, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

export type RunnerLevel = "beginner" | "intermediate" | "advanced";

/**
 * How much weekly volume may grow — the "10% rule".
 *
 * Blunt, widely taught, and roughly right. It is a ceiling rather than a target:
 * holding volume flat for a week costs nothing, and stepping up 25% because you
 * felt good is the single most common way a runner buys an injury. Every fourth
 * week comes down, because adaptation needs a trough.
 */
export const MAX_WEEKLY_GROWTH = 0.1;
export const DELOAD_FACTOR = 0.7;

export interface WeeklyVolumePlan {
  week: number;
  targetKm: number;
  deload: boolean;
  note: string;
}

/**
 * Four weeks of mileage from where the runner is now.
 *
 * Weeks 1–3 step up by at most 10%; week 4 drops to 70% so the work can land.
 * Mirrors the Base/Build/Peak/Deload shape the strength engine uses, so a
 * runner's block and a lifter's block are the same object with different insides.
 */
export function weeklyVolumePlan(currentWeeklyKm: number, weeks = 4): WeeklyVolumePlan[] {
  const start = Math.max(0, currentWeeklyKm);
  const out: WeeklyVolumePlan[] = [];
  let running = start;
  for (let w = 1; w <= weeks; w++) {
    const deload = w % 4 === 0;
    if (deload) {
      out.push({
        week: w,
        targetKm: +(running * DELOAD_FACTOR).toFixed(1),
        deload: true,
        note: "Down week. One quality session and less of everything else — this is where the last three weeks turn into fitness.",
      });
      continue;
    }
    if (w > 1) running = running * (1 + MAX_WEEKLY_GROWTH);
    out.push({
      week: w,
      targetKm: +running.toFixed(1),
      deload: false,
      note: w === 1 ? "Hold where you are and get the mix right first." : "Up to 10% on last week, no more.",
    });
  }
  return out;
}

export interface RunSession {
  /** "w1d3" — matches the strength engine's session ids so program code is shared. */
  id: string;
  day: number;
  type: RunTypeId;
  label: string;
  zone: ZoneId;
  /** Planned distance in km. Null for sessions prescribed by time. */
  km: number | null;
  minutes: number;
  /** The prescription in words — what the athlete reads. */
  detail: string;
  hard: boolean;
}

/**
 * A week of running.
 *
 * The rules, in the order they're applied:
 *   1. Never more hard sessions than the level allows.
 *   2. Hard days never adjacent — the easy day between them is what makes the
 *      hard day work.
 *   3. The long run is the last day of the week and about 30% of volume.
 *   4. Everything left over is easy, and the easy share must clear 80%.
 *
 * Deterministic: the same inputs give the same week, because programs are
 * regenerated from saved inputs and must come back identical.
 */
export function buildRunWeek(opts: {
  weeklyKm: number;
  daysPerWeek: number;
  level: RunnerLevel;
  /** Which hard sessions to draw from, in priority order. Defaults suit general fitness. */
  focus?: RunTypeId[];
  week?: number;
  /** Zone 1 instead of Zone 2 on the filler days when the athlete is beaten up. */
  recoveryBias?: boolean;
  /**
   * Hard-session ceiling for this week specifically, on top of the level cap.
   * Used by the down week, which keeps one quality session rather than none —
   * a week with no intensity at all leaves people flat rather than fresh.
   */
  hardCap?: number;
}): RunSession[] {
  const { weeklyKm, level } = opts;
  const days = Math.max(1, Math.min(7, opts.daysPerWeek));
  const week = opts.week ?? 1;
  const focus = opts.focus?.length ? opts.focus : (["tempo", "vo2", "hills"] as RunTypeId[]);

  // One hard day needs a day either side, so a 3-day week can't hold three.
  const hardBudget = Math.min(
    MAX_HARD_SESSIONS[level],
    Math.floor(days / 2),
    focus.length,
    opts.hardCap ?? Infinity,
  );

  // Long run first: it's the anchor and the biggest single slice.
  const longKm = +(weeklyKm * (days >= 4 ? 0.3 : 0.35)).toFixed(1);
  const remaining = Math.max(0, weeklyKm - longKm);

  // Hard sessions are prescribed by time, so their distance is an estimate used
  // only to keep the week's total honest.
  const hardKm = hardBudget > 0 ? +(remaining * 0.3 / hardBudget).toFixed(1) : 0;
  const easyDays = days - 1 - hardBudget;
  const easyKm = easyDays > 0 ? +((remaining - hardKm * hardBudget) / easyDays).toFixed(1) : 0;

  // Spread hard days as far apart as possible across the non-long days.
  //
  // Spacing them by `slots / budget` from index 0 is the obvious version and it
  // is wrong: five slots and three hard days gives steps of 1.67, which floors
  // to 0, 1, 3 — the first two adjacent. Anchoring the LAST one at the final
  // slot and dividing the gap evenly gives 0, 2, 4, which is what "as far apart
  // as possible" actually means. The budget cap above guarantees there is room
  // (a non-adjacent placement needs slots >= 2 × budget − 1).
  const slotCount = days - 1;
  const hardSlots = new Set<number>();
  if (hardBudget === 1) {
    // One hard day goes in the middle, not on day 1 — a week that opens with
    // the hardest session tends to lose the rest of itself.
    hardSlots.add(Math.floor((slotCount - 1) / 2));
  } else if (hardBudget > 1) {
    const gap = (slotCount - 1) / (hardBudget - 1);
    for (let i = 0; i < hardBudget; i++) hardSlots.add(Math.round(i * gap));
  }

  const sessions: RunSession[] = [];
  let hardIndex = 0;

  for (let d = 0; d < days - 1; d++) {
    if (hardSlots.has(d)) {
      // Rotate the focus list by week so a 4-week block isn't the same session
      // four times — the same anti-repetition rule the strength engine follows.
      const id = focus[(hardIndex + week - 1) % focus.length];
      const t = runType(id)!;
      sessions.push({
        id: `w${week}d${d + 1}`,
        day: d + 1,
        type: id,
        label: t.label,
        zone: t.primaryZone,
        km: hardKm || null,
        minutes: Math.round((t.minutes[0] + t.minutes[1]) / 2),
        detail: t.howTo,
        hard: true,
      });
      hardIndex++;
      continue;
    }
    const id: RunTypeId = opts.recoveryBias ? "recovery" : "easy";
    const t = runType(id)!;
    sessions.push({
      id: `w${week}d${d + 1}`,
      day: d + 1,
      type: id,
      label: t.label,
      zone: t.primaryZone,
      km: easyKm || null,
      minutes: Math.round(easyKm * 6) || t.minutes[0],
      detail: t.howTo,
      hard: false,
    });
  }

  const long = runType("long")!;
  sessions.push({
    id: `w${week}d${days}`,
    day: days,
    type: "long",
    label: long.label,
    zone: long.primaryZone,
    km: longKm || null,
    minutes: Math.round(longKm * 6) || long.minutes[0],
    detail: long.howTo,
    hard: false,
  });

  return sessions;
}

/**
 * What share of a week's running was easy, and whether that clears 80/20.
 *
 * Takes logged runs rather than planned ones — the plan is always 80/20 and the
 * week rarely is, and the gap between them is the single most useful thing this
 * module can tell someone.
 */
// --- The 4-week block --------------------------------------------------------

/**
 * Race distances a runner can point a block at, and what the block emphasises.
 *
 * The focus order is the priority order `buildRunWeek` draws hard sessions from,
 * so a 5k block leads with VO2 work and a marathon block leads with threshold —
 * which is the actual difference between training for the two.
 */
export const RACE_GOALS: { id: string; label: string; km: number | null; focus: RunTypeId[]; note: string }[] = [
  { id: "5k", label: "5k", km: 5, focus: ["vo2", "cruise", "hills"], note: "Sharp end: VO2 work leads, threshold supports it." },
  { id: "10k", label: "10k", km: 10, focus: ["cruise", "vo2", "tempo"], note: "Threshold and VO2 in roughly equal measure." },
  { id: "half", label: "Half marathon", km: 21.0975, focus: ["tempo", "cruise", "steady"], note: "Threshold is the engine of a half." },
  { id: "marathon", label: "Marathon", km: 42.195, focus: ["steady", "tempo", "cruise"], note: "Marathon-effort work, with threshold to hold it up." },
  { id: "general", label: "General fitness", km: null, focus: ["tempo", "vo2", "hills"], note: "A bit of everything, none of it excessive." },
];

export function raceGoal(id: string) {
  return RACE_GOALS.find((g) => g.id === id) ?? RACE_GOALS[RACE_GOALS.length - 1];
}

/** Same four-week arc the strength engine uses, so both blocks read alike. */
const WEEK_THEMES = ["Base", "Build", "Peak", "Deload"];
const WEEK_INTENSITY = ["Moderate", "Higher", "Peak", "Deload"];

/**
 * The two goals from the shared GoalType that mean "running".
 *
 * A runner picking "Runner's strength" or injury recovery gets the ordinary
 * engine — gym work and rehab progressions are a real part of a runner's week,
 * and hijacking them into a run plan would be worse than not having one.
 */
export type RunGoal = "endurance" | "speed";

export interface RunProgramInput {
  weeklyKm: number;
  daysPerWeek: number;
  level: RunnerLevel;
  /** What the athlete asked for, so the saved plan doesn't relabel it. */
  goal?: RunGoal;
  /** A RACE_GOALS id. */
  goalId?: string;
  /** 1-based. Each block starts from where the last one finished. */
  block?: number;
  /** Threshold pace in sec/km, if known — turns the prescriptions into real paces. */
  thresholdSecPerKm?: number | null;
  /** Sore athlete: filler days become recovery runs rather than easy runs. */
  recoveryBias?: boolean;
}

/**
 * A four-week running block, in the same `ProgramPlan` shape the strength and
 * hypertrophy engines emit — so the calendar, the workout player and session
 * ticking all work unchanged, and a runner's program is a program rather than a
 * special case the rest of the app has to know about.
 *
 * Each run becomes a single `ProgramDrill` prescribed by `prescription` rather
 * than sets and reps, which is the field the UI already uses for anything that
 * isn't a lift.
 */
export function buildRunProgram(input: RunProgramInput): RunProgramPlan {
  const block = Math.max(1, input.block ?? 1);
  const goalType: RunGoal = input.goal ?? "endurance";
  const goal = raceGoal(input.goalId ?? "general");
  // Each block picks up ~8% above the last, matching the strength engine's
  // block-on-block progression rather than restarting from the same mileage.
  const startKm = Math.max(0, input.weeklyKm) * (1 + (block - 1) * 0.08);
  const volume = weeklyVolumePlan(startKm, 4);
  const zonePaces = input.thresholdSecPerKm ? paceZones(input.thresholdSecPerKm) : null;

  const weeks = volume.map((v, wi) => {
    const sessions = buildRunWeek({
      weeklyKm: v.targetKm,
      daysPerWeek: input.daysPerWeek,
      level: input.level,
      focus: goal.focus,
      week: wi + 1,
      recoveryBias: input.recoveryBias,
      // The down week keeps ONE quality session rather than none. Stripping all
      // intensity for a week leaves people flat instead of fresh — the volume
      // drop is what does the recovering, and the single session is what stops
      // them coming back sluggish.
      hardCap: v.deload ? 1 : undefined,
    }).map((s) => ({
      day: s.day,
      title: `Day ${s.day} · ${s.label}`,
      focus: goalType,
      drills: [runDrill(s, zonePaces)],
    }));

    return {
      week: wi + 1,
      theme: WEEK_THEMES[wi] ?? `Week ${wi + 1}`,
      intensity: WEEK_INTENSITY[wi] ?? "Moderate",
      focusNote: `${v.targetKm}km target. ${v.note}`,
      sessions,
    };
  });

  return {
    goal: goalType,
    weeks,
    summary:
      `A four-week ${goal.label.toLowerCase()} block at ${Math.round(volume[0].targetKm)}–${Math.round(volume[2].targetKm)}km a week, ` +
      `${input.daysPerWeek} days out. ${goal.note} Volume rises by no more than 10% a week and week 4 comes down so it lands.`,
    constraints: [
      `At most ${MAX_HARD_SESSIONS[input.level]} hard session${MAX_HARD_SESSIONS[input.level] === 1 ? "" : "s"} a week, never on back-to-back days.`,
      zonePaces
        ? `Paces are from your own threshold (${formatPace(input.thresholdSecPerKm!)}/km) — log a race to keep them current.`
        : "Zones are shown as effort. Log a 5k or 10k time and every session gets a real pace instead.",
      "Roughly 80% of the running is easy. That is the plan working, not the plan being soft.",
    ],
    block,
  };
}

/**
 * Structurally the same as ./engine's ProgramPlan, declared here rather than
 * imported so this module keeps no dependency on the strength engine. The two
 * are checked against each other in the tests — if ProgramPlan gains a required
 * field, that test fails rather than the /coach page rendering a hole.
 */
export interface RunProgramDrill {
  name: string;
  sets: number;
  reps: number;
  cue: string;
  reason: string;
  prescription?: string;
  intensity?: string;
  progression?: string;
}

export interface RunProgramSession {
  day: number;
  title: string;
  focus: RunGoal;
  drills: RunProgramDrill[];
}

export interface RunProgramWeek {
  week: number;
  theme: string;
  intensity: string;
  focusNote: string;
  sessions: RunProgramSession[];
}

export interface RunProgramPlan {
  goal: RunGoal;
  summary: string;
  constraints: string[];
  weeks: RunProgramWeek[];
  block: number;
}

function runDrill(s: RunSession, zonePaces: PaceZoneRange[] | null): RunProgramDrill {
  const t = runType(s.type)!;
  const z = ZONES[s.zone];
  const pace = zonePaces?.find((p) => p.zone === s.zone);
  // Distance where we have one, minutes otherwise — a tempo session is
  // prescribed by time and turning that into a distance would be inventing it.
  //
  // Except for the sessions that have a SHAPE. "50 min · Zone 5" is not a hill
  // session, it's a duration; the athlete still has to read the how-to to find
  // out it means 6–10 × 45–90 seconds. Leading with the reps puts the actual
  // prescription where the eye lands, and it is the same structure the log now
  // asks for back, so the plan and the record finally speak in one unit.
  const amount = t.interval
    ? `${describeShape(t.interval)} · ${s.minutes} min total`
    : s.hard ? `${s.minutes} min` : s.km ? `${s.km}km · ${s.minutes} min` : `${s.minutes} min`;

  return {
    name: t.label,
    sets: 1,
    reps: 1,
    cue: t.howTo,
    reason: t.purpose,
    prescription: `${amount} · Zone ${z.id} (${z.name})${pace ? ` · ${formatPaceRange(pace)}/km` : ""}`,
    intensity: `RPE ${z.rpe[0]}–${z.rpe[1]}`,
    progression: t.watchFor,
  };
}

export function easyShare(runs: {
  type: RunTypeId;
  km?: number | null;
  minutes?: number | null;
  /** Logged interval structure, when there was one. Beats the type's estimate. */
  intervals?: number | null;
  effortSeconds?: number | null;
  recoverySeconds?: number | null;
  zone?: ZoneId | null;
}[]): {
  easyPct: number;
  hardPct: number;
  meetsTarget: boolean;
  note: string;
} | null {
  // Weight by minutes where present, distance otherwise — a threshold session
  // and an easy run of the same distance are not the same amount of training.
  const weight = (r: { km?: number | null; minutes?: number | null }) => r.minutes ?? (r.km != null ? r.km * 6 : 0);
  const total = runs.reduce((s, r) => s + weight(r), 0);
  if (total <= 0) return null;

  // Only the hard PART of a hard session counts as hard — see `hardFraction`.
  // An hour-long tempo run is roughly 25 minutes at threshold wrapped in 35
  // minutes of easy running, and calling the whole hour hard reported an
  // ordinary week as 66% easy and told the athlete to do less.
  //
  // The type's `hardFraction` is an ESTIMATE of that split. Where the athlete
  // logged the actual intervals, the split is a measurement instead, and a
  // measurement of the specific session beats an average of the kind: 6 × 45s
  // and 12 × 90s are both "hill repeats" and one is four times the work.
  const hardMinutes = runs.reduce((s, r) => {
    const t = runType(r.type);
    if (!t) return s;
    const measured = intervalEffort({
      intervals: r.intervals,
      effortSeconds: r.effortSeconds,
      recoverySeconds: r.recoverySeconds,
      totalMinutes: r.minutes,
      zone: r.zone,
      type: r.type,
    });
    return s + weight(r) * (measured?.hardFraction ?? t.hardFraction);
  }, 0);
  const easyPct = Math.round(((total - hardMinutes) / total) * 100);
  const hardPct = 100 - easyPct;
  const meetsTarget = easyPct >= EASY_SHARE_TARGET * 100;

  return {
    easyPct,
    hardPct,
    meetsTarget,
    note: meetsTarget
      ? "Your easy days are genuinely easy — that's what makes the hard ones work."
      : `${hardPct}% of your week was hard running. Aim for 20%: the fix is slowing the easy days down, not cutting the sessions.`,
  };
}

// --- Naming a run inside somebody else's programme ---------------------------

/**
 * The library exercise ids that ARE runs, joined to the run type they are.
 *
 * lib/movements.ts carries a run's slot, its joint cost and its dose; it has no
 * idea what a zone is, because it describes squats and sled pushes too. This is
 * the join, and it is what lets the general engine — the one building a
 * footballer's strength block — print "Zone 2 (Easy)" beside a run it selected
 * for entirely unrelated reasons.
 *
 * Keyed by exercise id so a rename of the display name can't quietly unhook it.
 */
export const RUN_MOVEMENTS: Record<string, RunTypeId> = {
  recovery_run: "recovery",
  easy_run: "easy",
  long_run: "long",
  threshold_run: "tempo",
  vo2_intervals: "vo2",
  fartlek_run: "fartlek",
  progression_run: "progression",
  hill_repeats: "hills",
  strides: "strides",
};

/**
 * "Zone 2 (Easy)" for a run, null for anything that isn't one.
 *
 * The zone is the instruction. A run prescribed as "40 min" and nothing else
 * is the single most common way an easy day gets run too hard — and every
 * other surface in the app already speaks in zones, so a programme that didn't
 * was the odd one out.
 */
export function runZoneLabel(movementId: string): string | null {
  const t = RUN_MOVEMENTS[movementId];
  if (!t) return null;
  const z = ZONES[runType(t)!.primaryZone];
  return `Zone ${z.id} (${z.name})`;
}

/** The talk-test line for a run, so the zone isn't just a number. */
export function runZoneFeel(movementId: string): string | null {
  const t = RUN_MOVEMENTS[movementId];
  return t ? ZONES[runType(t)!.primaryZone].feel : null;
}
