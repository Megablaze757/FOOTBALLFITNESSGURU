/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE DEMO ACCOUNT'S DATA, DECIDED HERE AND POSTED ELSEWHERE.
 *
 * The reel's closing line is "build a week of meals and it prices the whole
 * shop" and the shot behind it was "Add your weight to get your targets" — an
 * empty onboarding prompt, because the demo account had a profile with no
 * height, no age, no sex, no weigh-ins and no meals. The app was working
 * perfectly and had nothing to show.
 *
 * WHY THIS IS A MODULE AND NOT A SQL FILE. A demo that lies is worse than an
 * empty one: a readiness score that never moves proves nothing, a weight that
 * jumps four kilos in a week is visibly fake, and calories that do not match
 * the athlete are the one thing a viewer in this audience WILL check. Those
 * are decisions with wrong answers, so they are tested.
 *
 * DETERMINISTIC. Re-running produces the same numbers, so a reel recorded
 * today and one recorded next week differ only by the dates — and a demo whose
 * numbers change between takes is a demo nobody can check.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** The athlete the demo account is. Chosen to be unremarkable and consistent. */
export const DEMO_PROFILE = {
  height_cm: 180,
  birth_year: 1998,
  sex: "male",
  activity_level: "athlete",
  diet_goal: "maintain",
} as const;

/** Days of history. Two weeks is what the app's own trends read. */
export const DAYS = 14;

/** Weigh-ins go back further, because a weight trend needs longer than a fortnight. */
export const WEIGH_IN_WEEKS = 8;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const back = (from: Date, days: number) => {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
};

/**
 * A fixed wobble, so the numbers look lived-in without being random.
 *
 * A repeating pattern rather than a generator: it can be read, and a reviewer
 * can see at a glance that there is one bad night in it and where.
 */
const SLEEP = [7, 8, 6, 4, 7, 8, 9, 7, 6, 8, 8, 5, 7, 8];
const FATIGUE = [4, 3, 5, 8, 5, 3, 2, 4, 6, 3, 3, 7, 4, 3];
const NUTRITION = [7, 8, 7, 6, 8, 8, 9, 7, 7, 8, 8, 6, 8, 8];
/**
 * Minutes trained, and it has to AGREE WITH THE CHECK-INS.
 *
 * The first version trained 85 minutes on index 3 — the four-hour night with
 * eight-out-of-ten fatigue — which is the demo contradicting the exact claim
 * the readiness reel makes about it. A test caught it. Index 3 is a rest day
 * now, and index 11 (five hours' sleep, fatigue 7) is a short, easy one.
 */
const MINUTES = [75, 60, 0, 0, 70, 55, 90, 75, 60, 0, 80, 45, 0, 85];

export interface CheckIn {
  check_in_date: string;
  sleep_quality: number;
  fatigue_score: number;
  nutrition_quality: number;
  weight_kg: number | null;
}

export interface BodyLog { log_date: string; weight_kg: number; }

export interface NutritionLog {
  log_date: string;
  daily_calorie_target: number;
  /** What was EATEN, not the target. The column names below say so. */
  macros: { protein: number; carbs: number; fats: number };
  calories_eaten: number;
  daily_water_intake_ml: number;
}

export interface TrainingLog {
  log_date: string;
  total_minutes: number;
  session_type: string;
  intensity: number;
  notes: string;
}

/**
 * THE ONE BAD NIGHT IS THE POINT.
 *
 * The readiness reel's whole claim is that the app changes the session when
 * you have slept badly. A fortnight of sevens proves nothing and films as a
 * flat line, so day 4 back is four hours of sleep and eight out of ten fatigue
 * — and the training log for that day is a rest day, which is the app having
 * done the thing the reel says it does.
 */
export function checkIns(today: Date): CheckIn[] {
  return Array.from({ length: DAYS }, (_, i) => {
    const day = back(today, DAYS - 1 - i);
    return {
      check_in_date: iso(day),
      sleep_quality: SLEEP[i % SLEEP.length],
      fatigue_score: FATIGUE[i % FATIGUE.length],
      nutrition_quality: NUTRITION[i % NUTRITION.length],
      weight_kg: null,
    };
  });
}

/**
 * A gentle trend, weekly.
 *
 * 87.4kg to 88.1kg over eight weeks — the sort of drift a maintaining lifter
 * actually has. Anything faster reads as invented, and this audience knows
 * what a real weight graph looks like.
 */
export function bodyLogs(today: Date): BodyLog[] {
  const start = 87.4;
  return Array.from({ length: WEIGH_IN_WEEKS }, (_, i) => {
    const weeksAgo = WEIGH_IN_WEEKS - 1 - i;
    // A small non-monotonic wobble, because a real weight does not only rise.
    const wobble = [0, 0.3, -0.2, 0.4, 0.1, 0.5, 0.2, 0.7][i];
    return {
      log_date: iso(back(today, weeksAgo * 7)),
      weight_kg: Math.round((start + wobble) * 10) / 10,
    };
  });
}

/**
 * Targets consistent with the athlete above, and intake that lands near them
 * without hitting them exactly — nobody eats their macros to the gram, and a
 * demo that does is the one detail that gives it away.
 */
export function nutritionLogs(today: Date, days = 7): NutritionLog[] {
  const TARGET = 3100;
  return Array.from({ length: days }, (_, i) => {
    const ago = days - 1 - i;

    /**
     * TODAY IS A PARTIAL DAY, and the days before it are whole ones.
     *
     * The first version logged a complete day's food for today as well, so a
     * reel filmed at lunchtime showed somebody who had already eaten three
     * thousand calories. A day in progress is both more honest and a better
     * shot: the ring is part-filled, which is what the ring is for.
     */
    const share = ago === 0 ? 0.58 : 1;
    const swing = [0, -120, 80, -60, 140, -40, 20][i % 7];

    const macros = {
      protein: Math.round((175 + (i % 3) * 5) * share),
      carbs: Math.round((355 + swing / 4) * share),
      fats: Math.round((92 + (i % 2) * 4) * share),
    };

    return {
      log_date: iso(back(today, ago)),
      daily_calorie_target: TARGET,
      macros,
      /**
       * DERIVED FROM THE MACROS, not chosen separately.
       *
       * These are two columns the app shows side by side, and the first seed
       * set the macros and left calories_eaten null — so the card read "0 kcal"
       * next to "175g protein" on the same day. Anybody who tracks food would
       * spot that in the first second of the shot.
       */
      calories_eaten: Math.round(macros.protein * 4 + macros.carbs * 4 + macros.fats * 9),
      daily_water_intake_ml: Math.round((2600 + (i % 4) * 200) * (ago === 0 ? 0.85 : 1)),
    };
  });
}

/**
 * Sessions, with rest days where the check-ins say the athlete was wrecked.
 *
 * The existing demo row was 90km in 60 minutes at a 40-second kilometre. That
 * is not a session, it is a test fixture, and it was the only training data
 * the account had.
 */
export function trainingLogs(today: Date): TrainingLog[] {
  const names = [
    "Squat — top set and back-offs", "Bench — volume", "Deadlift — heavy single",
    "Squat — pause work", "Bench — close grip", "Accessories and carries",
    "Deadlift — speed work",
  ];
  return Array.from({ length: DAYS }, (_, i) => {
    const minutes = MINUTES[i % MINUTES.length];
    if (minutes === 0) return null;
    return {
      log_date: iso(back(today, DAYS - 1 - i)),
      total_minutes: minutes,
      session_type: "workout",
      // Eased off on the day after the bad night, which is the whole demo.
      intensity: FATIGUE[i % FATIGUE.length] >= 7 ? 4 : 7,
      notes: names[i % names.length],
    };
  }).filter((r): r is TrainingLog => r !== null);
}
