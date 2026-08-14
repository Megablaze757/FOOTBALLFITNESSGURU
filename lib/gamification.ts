import { todayLocal } from "./day";
import type { IconName } from "@/components/Icon";
// =============================================================================
// Gamification engine — XP, levels/ranks, achievements and daily quests, all
// computed from activity the athlete already generates. Pure + tested, so it
// runs in the browser on GitHub Pages with no extra backend.
// =============================================================================

export interface ActivityStats {
  checkIns: number;          // total daily check-ins
  streak: number;            // current consecutive-day streak
  trainingSessions: number;  // total training logs
  completedSessions: number; // program sessions ticked off
  completedBlocks: number;   // finished 4-week blocks (archived programs)
  benchmarks: number;        // strength/speed tests logged
  videos: number;            // clips analysed
  nutritionLogs: number;     // nutrition days logged
  checkInsLast7: number;     // check-ins in the last 7 days
  /**
   * Days you checked in and did NOT train.
   *
   * The reward system had no idea recovery existed — nothing in this file
   * mentioned rest, deloads or backing off, while the rest of the app is built
   * around exactly that. ACWR flags a load spike as an injury risk, readiness
   * tells a Red day to take active recovery, and the engine writes a deload
   * week into every block. Then Rewards paid 12 XP a session, called fifty of
   * them "Machine", and paid nothing at all for the day you were told to rest.
   *
   * That is the app arguing with itself, and for a fifteen-year-old chasing a
   * badge it argues in the direction that gets people hurt.
   */
  restDaysLogged: number;
  /**
   * The longest run of consecutive check-ins, whether or not it is still going.
   *
   * `streak` only ever rewards the run you are ON, so a 40-day streak broken by
   * one holiday is worth exactly as much as never having started. That is the
   * opposite of what this app tells people about consistency everywhere else.
   *
   * BOUNDED BY THE QUERY WINDOW. The pages load 60 days of dates (a streak is
   * broken by the first missing day, so more would be waste), which caps this at
   * 60. No badge may ask for more than that or it can never be earned — there is
   * a test.
   */
  longestStreak: number;
  /** Distinct calendar weeks with at least one check-in, within the window. */
  weeksActive: number;
  /** Days in the last 7 with a check-in, a training log AND food logged. */
  perfectDaysLast7: number;
  /**
   * Complete days across the whole window, not just this one.
   *
   * `perfectDaysLast7` can only ever carry badges up to "three in a week" — it
   * resets every seven days, so there is no ladder above that. This is the same
   * measure without the reset, which is what makes doing the whole loop
   * something you can be marked for repeatedly. Bounded by the 60-day query
   * window like everything else here.
   */
  perfectDays: number;
  /**
   * Times they came back after a week or more away.
   *
   * The streak counter actively punishes this: miss a week of a forty-day run
   * and you are on zero with nothing to show for the forty, which is exactly
   * the moment someone stops opening the app. Nothing in the reward system
   * marked returning, which made the whole ladder a punishment for having a
   * life. This counts the returns.
   */
  comebacks: number;
}

export const EMPTY_STATS: ActivityStats = {
  checkIns: 0, streak: 0, trainingSessions: 0, completedSessions: 0,
  completedBlocks: 0, benchmarks: 0, videos: 0, nutritionLogs: 0, checkInsLast7: 0,
  restDaysLogged: 0, longestStreak: 0, weeksActive: 0, perfectDaysLast7: 0,
  perfectDays: 0, comebacks: 0,
};

/**
 * The stats that come from looking ACROSS the dates rather than counting rows.
 *
 * Shared because two pages build ActivityStats from the same three date lists,
 * and a badge that unlocks on one screen and not the other would be a bug
 * nobody could explain. Costs no query: every list here is already loaded.
 *
 * `DAY_MS` arithmetic on UTC midnights, not `setDate`, so a clock change in the
 * middle of a streak does not silently break it.
 */
const DAY_MS = 86_400_000;

export function activitySpans(
  checkDates: string[],
  trainDates: string[],
  nutriDates: string[],
  today: string = todayLocal()
): Pick<ActivityStats, "longestStreak" | "weeksActive" | "perfectDaysLast7" | "perfectDays" | "comebacks"> {
  const days = [...new Set(checkDates)].sort();

  let longestStreak = 0;
  let run = 0;
  let previous: number | null = null;
  // A gap of a week or more, closed. Seven days because that is long enough to
  // be a real absence — a missed weekend is not a comeback — and because it is
  // the same window everything else on this page is measured over.
  const COMEBACK_GAP = 7 * DAY_MS;
  let comebacks = 0;
  for (const d of days) {
    const t = Date.parse(`${d}T00:00:00Z`);
    if (Number.isNaN(t)) continue;
    run = previous !== null && t - previous === DAY_MS ? run + 1 : 1;
    if (previous !== null && t - previous >= COMEBACK_GAP) comebacks++;
    previous = t;
    if (run > longestStreak) longestStreak = run;
  }

  // Weeks counted from the epoch so the boundary is the same for everyone and
  // does not depend on which day the athlete's locale calls first.
  const weeks = new Set<number>();
  for (const d of days) {
    const t = Date.parse(`${d}T00:00:00Z`);
    if (!Number.isNaN(t)) weeks.add(Math.floor(t / DAY_MS / 7));
  }

  const trained = new Set(trainDates);
  const fed = new Set(nutriDates);
  const checked = new Set(checkDates);
  const from = Date.parse(`${today}T00:00:00Z`) - 6 * DAY_MS;
  let perfectDaysLast7 = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(from + i * DAY_MS).toISOString().slice(0, 10);
    if (checked.has(d) && trained.has(d) && fed.has(d)) perfectDaysLast7++;
  }
  // The same test over every day in the window. Walks the check-in days rather
  // than the calendar, because a complete day needs a check-in by definition.
  const perfectDays = days.filter((d) => trained.has(d) && fed.has(d)).length;

  return { longestStreak, weeksActive: weeks.size, perfectDaysLast7, perfectDays, comebacks };
}

// XP awarded per unit of activity.
const XP = {
  checkIn: 10,
  trainingSession: 12,
  completedSession: 15,
  completedBlock: 100,
  benchmark: 25,
  video: 20,
  nutritionLog: 8,
  streakDay: 5,
  /**
   * A rest day earns something, and that is the whole point.
   *
   * Training a day was worth 22 (10 for the check-in, 12 for the session) and
   * resting was worth 10 — so the reward curve said train, including on the day
   * readiness said Red and the app itself said stop. At 6 a rest day is worth
   * 16 against 22: still less than training, because training is the thing
   * being built, but no longer a penalty for following the advice.
   */
  restDay: 6,
};

export function computeXp(s: ActivityStats): number {
  return (
    s.checkIns * XP.checkIn +
    s.trainingSessions * XP.trainingSession +
    s.completedSessions * XP.completedSession +
    s.completedBlocks * XP.completedBlock +
    s.benchmarks * XP.benchmark +
    s.videos * XP.video +
    s.nutritionLogs * XP.nutritionLog +
    /**
     * THE BEST STREAK YOU HAVE HAD, NOT THE ONE YOU ARE ON.
     *
     * This read `s.streak`, and it was the only term in the whole sum that
     * could go DOWN — so missing a single day deleted up to 300 XP and could
     * drop you a level. A rank going backwards is the most demotivating event a
     * progression system has, and here it fired on the exact day someone was
     * already most likely to stop: the one they had just broken a run on.
     *
     * XP is a record of what you have done. You did the forty days; nothing
     * that happens afterwards makes them un-happen. `longestStreak` never
     * decreases, so the total is now monotonic — every term only ever adds.
     *
     * Nobody loses XP in the change: longestStreak >= streak by definition, so
     * the worst case is that it is identical.
     */
    s.longestStreak * XP.streakDay +
    s.restDaysLogged * XP.restDay
  );
}

export interface LevelInfo {
  level: number;
  rank: string;       // full label, e.g. "Gold II"
  emoji: string;
  tier: TierName;     // e.g. "Gold"
  division: string;   // "III" | "II" | "I", or "" at the apex
  color: string;      // tier colour for badges/rings
  /** Only the standing tiers carry one: "Top 1% of athletes". */
  note?: string;
  xp: number;
  xpIntoLevel: number;
  xpForNext: number;
  progress: number;   // 0..1 toward next level
}

/**
 * What the next level costs.
 *
 * LINEAR FOR THE FIRST TWENTY, THEN IT BITES. The old curve was
 * `100 + (level - 1) * 50` all the way up, which meant the ladder never really
 * got harder — a committed athlete cleared level 48 inside five years and had
 * spent the last two of them at a rank that could not improve.
 *
 * Measured against a realistic athlete (checks in ~6 days a week, trains four
 * times, logs food half the days), old vs new:
 *
 *   3 months   10 -> 10      unchanged
 *   6 months   15 -> 15      unchanged
 *   1 year     21 -> 21      unchanged
 *   2 years    30 -> 29
 *   3 years    37 -> 33
 *   5 years    48 -> 38
 *
 * THE RAMP STARTS AT 20 ON PURPOSE, and that is the whole reason this is safe
 * to ship. Level is derived from XP on every render — it is not stored — so
 * steepening the curve retroactively re-ranks everyone who already plays.
 * Nobody enjoys opening an app to find they have been demoted, and badges key
 * off level, so it would strip those too. Below level 20 the two curves are
 * identical to the point, which is roughly a year of committed use: no current
 * athlete moves at all, and the change only ever applies to progress not yet
 * made.
 *
 * If this ever needs steepening again, raise RAMP_FROM to above the level your
 * most advanced athlete has reached. Making the early game harder is a
 * different decision, with different consequences, and should be made
 * deliberately rather than as a side effect of this one.
 */
const LEVEL_BASE = 100;
const LEVEL_STEP = 50;
const RAMP_FROM = 20;
const RAMP_WEIGHT = 10;

function costForLevel(level: number): number {
  const linear = LEVEL_BASE + (level - 1) * LEVEL_STEP;
  const beyond = Math.max(0, level - RAMP_FROM);
  return linear + beyond * beyond * RAMP_WEIGHT;
}

// A competitive ladder in the shape people already know from games — tiers with
// divisions inside them. "Rookie → Amateur → Semi-Pro" only moved six times in a
// career, so most weeks showed no visible progress at all. Divisions mean a
// promotion every three levels, which is what actually keeps people climbing.
//
// NOTE: Silver and Gold are also the names of the paid subscription plans. The
// two are unrelated — this is earned, that is bought. If they're ever shown side
// by side, rename the plans (lib/subscription.ts) rather than the ladder; the
// plan names are display copy, while a rank is the thing people screenshot.
export type TierName =
  | "Iron" | "Bronze" | "Silver" | "Gold" | "Platinum"
  | "Emerald" | "Diamond" | "Champion" | "Legend"
  // The two above Legend are STANDINGS, not levels — see STANDING_TIERS.
  | "Elite" | "Apex";

interface TierDef { name: TierName; emoji: string; color: string; span: number; note?: string }

// Ordered lowest first. `span` is how many levels the tier covers; the last
// tier is open-ended.
const TIERS: TierDef[] = [
  { name: "Iron", emoji: "⛓️", color: "#8d9299", span: 3 },
  { name: "Bronze", emoji: "🥉", color: "#c07a44", span: 3 },
  { name: "Silver", emoji: "🥈", color: "#c3ccd8", span: 3 },
  { name: "Gold", emoji: "🥇", color: "#e3b53f", span: 3 },
  { name: "Platinum", emoji: "💠", color: "#5fd3c4", span: 3 },
  { name: "Emerald", emoji: "🟢", color: "#34d399", span: 3 },
  { name: "Diamond", emoji: "💎", color: "#7cc6ff", span: 3 },
  // Span 3, not 4. At 4 it exceeded the division list and rendered a bare
  // "Champion" for four levels — the same dead-end the apex had, in miniature.
  // Shortening it promotes anyone sitting at the old top of Champion into
  // Legend, which is a change nobody minds finding.
  { name: "Champion", emoji: "🏆", color: "#c084fc", span: 3 },
  { name: "Legend", emoji: "👑", color: "#fb7185", span: Infinity },
];

/**
 * THE TWO ABOVE LEGEND ARE EARNED BY STANDING, NOT BY GRINDING.
 *
 * Every tier below is a level you reach and keep. These two are positions you
 * hold: "top 1%" and "best in the world" are claims about everyone else, so
 * they cannot be computed from one person's XP, and they have to be losable.
 * Someone who overtakes you takes the title with them — which is the only way
 * the words on the badge stay true.
 *
 * NOT AWARDED BELOW A HUNDRED ATHLETES. "Top 1%" of twelve people is not a
 * percentile, it is a rounding error, and a badge that says it would be a lie
 * the first person to notice would never trust again. Below the floor the
 * ladder simply ends at Legend, which is a real achievement on its own.
 */
export const LADDER_MIN_ATHLETES = 100;

const STANDING_TIERS: TierDef[] = [
  { name: "Elite", emoji: "🌟", color: "#dcd3ff", span: 0, note: "Top 1% of athletes" },
  { name: "Apex", emoji: "☀️", color: "#ffe9a8", span: 0, note: "No. 1 in the world" },
];

/** Where an athlete sits against everybody else. */
export interface Standing {
  /** How many athletes are on the ladder at all. */
  athletes: number;
  /** This athlete's position by XP. 1 is the highest. */
  position: number;
}

/**
 * The rank a standing earns, or null if it earns none.
 *
 * Exported so the ladder view can explain the top two rungs without having to
 * fake a standing to discover them.
 */
export function standingRank(standing?: Standing | null): RankInfo | null {
  if (!standing) return null;
  const { athletes, position } = standing;
  if (!Number.isFinite(athletes) || !Number.isFinite(position)) return null;
  if (athletes < LADDER_MIN_ATHLETES || position < 1 || position > athletes) return null;

  // Ceil, so the top 1% of exactly 100 athletes is one person rather than none.
  const onePercent = Math.max(1, Math.ceil(athletes * 0.01));
  const def = position === 1 ? STANDING_TIERS[1]
            : position <= onePercent ? STANDING_TIERS[0]
            : null;
  if (!def) return null;
  return { rank: def.name, tier: def.name, division: "", emoji: def.emoji, color: def.color, note: def.note };
}

// Divisions count DOWN as you improve, as in every game that uses them: you
// enter a tier at III and promote out of I.
const DIVISIONS = ["III", "II", "I"];

export interface RankInfo {
  rank: string;      // "Gold II"
  tier: TierName;
  division: string;
  emoji: string;
  color: string;
  /** Only the standing tiers carry one: "Top 1% of athletes". */
  note?: string;
}

/** How many levels of the apex tier make one division. */
const APEX_DIVISION_SPAN = 3;

/**
 * THE TOP OF THE LADDER WAS A DEAD END, and it is the biggest engagement
 * problem in this file.
 *
 * Every other tier promotes you every three levels. Legend has `span:
 * Infinity`, so it took the "wider than the division list" branch and rendered
 * a bare "Legend" — from the moment you arrived until forever. Measured against
 * a realistic athlete that is roughly twenty-two months in, after which the
 * rank badge on Home never changes again. The one screen whose whole job is to
 * show progress stops showing any, permanently, to precisely the people who
 * have used the app the longest.
 *
 * So the apex keeps counting. Every three levels is another Legend division,
 * with no ceiling — there is always a next one.
 *
 * COUNTING UP, NOT DOWN, and that is a deliberate break from the convention
 * three lines above. Divisions descend (III → II → I) because a tier has a
 * known top to promote OUT of. Legend has no top: nothing to count down toward,
 * and III → II → I → ...what? Ascending is the only shape that works for an
 * open-ended tier, and it is what games with an unbounded apex do.
 */
function apexDivision(levelsIn: number): string {
  const n = Math.floor(levelsIn / APEX_DIVISION_SPAN) + 1;
  return romanNumeral(n);
}

/**
 * Roman numerals, because the other divisions are and a "Legend 7" beside a
 * "Diamond III" would look like two different systems.
 *
 * Falls back to the plain number past 3,999, which no ladder will reach — but
 * returning an empty string there would silently collapse two ranks into one.
 */
function romanNumeral(n: number): string {
  if (n < 1 || n > 3999) return String(n);
  const table: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  let left = n;
  for (const [value, glyph] of table) {
    while (left >= value) { out += glyph; left -= value; }
  }
  return out;
}

export function rankFor(level: number, standing?: Standing | null): RankInfo {
  // A standing outranks anything the level ladder can award, because the two
  // above Legend sit above every level. Checked first so the walk below is not
  // wasted, and so a missing standing behaves exactly as it did before these
  // tiers existed — every existing caller keeps working untouched.
  const earned = standingRank(standing);
  if (earned) return earned;

  let remaining = Math.max(1, Math.floor(level)) - 1; // levels above level 1
  for (const t of TIERS) {
    if (remaining < t.span) {
      const division = Number.isFinite(t.span)
        ? (t.span <= DIVISIONS.length ? DIVISIONS[remaining] ?? "" : "")
        : apexDivision(remaining);
      return {
        rank: division ? `${t.name} ${division}` : t.name,
        tier: t.name, division, emoji: t.emoji, color: t.color,
      };
    }
    remaining -= t.span;
  }
  const top = TIERS[TIERS.length - 1];
  return { rank: top.name, tier: top.name, division: "", emoji: top.emoji, color: top.color };
}

/** The whole ladder, for a "how do I climb?" view. */
export function rankLadder(): { tier: TierName; emoji: string; color: string; fromLevel: number }[] {
  let level = 1;
  return TIERS.map((t) => {
    const entry = { tier: t.name, emoji: t.emoji, color: t.color, fromLevel: level };
    level += Number.isFinite(t.span) ? t.span : 0;
    return entry;
  });
}

export function levelFor(xp: number, standing?: Standing | null): LevelInfo {
  let level = 1;
  let acc = 0;
  let need = costForLevel(1);
  while (xp >= acc + need) {
    acc += need;
    level++;
    need = costForLevel(level);
  }
  const { rank, emoji, tier, division, color, note } = rankFor(level, standing);
  const xpIntoLevel = xp - acc;
  return {
    level, rank, emoji, tier, division, color, note,
    xp, xpIntoLevel, xpForNext: need, progress: need ? xpIntoLevel / need : 0,
  };
}

// --- Achievements -----------------------------------------------------------

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: IconName;
  test: (s: ActivityStats, level: number) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_checkin", name: "First step", desc: "Log your first check-in", icon: "foot", test: (s) => s.checkIns >= 1 },
  { id: "streak_7", name: "Week warrior", desc: "7-day check-in streak", icon: "flame", test: (s) => s.streak >= 7 },
  { id: "streak_30", name: "Unstoppable", desc: "30-day check-in streak", icon: "bolt", test: (s) => s.streak >= 30 },
  { id: "perfect_week", name: "Perfect week", desc: "Check in all 7 days", icon: "calendar", test: (s) => s.checkInsLast7 >= 7 },
  /**
   * WAS "Grinder" AND "Machine", and the names were the problem.
   *
   * This page's own subtitle reads "XP builds up from things you were doing
   * anyway. Nothing here needs chasing." It then handed a fifteen-year-old a
   * badge for grinding and a bigger one for being a machine about it — in an
   * app whose load engine flags accumulating volume as an injury risk and whose
   * readiness engine tells you to stop.
   *
   * The milestones stay, because logging your training IS worth marking. The
   * exhortation goes. A name that instructs is not the same as a name that
   * records, and this app should only ever be doing the second.
   */
  { id: "sessions_10", name: "Ten logged", desc: "Log 10 training sessions", icon: "barbell", test: (s) => s.trainingSessions >= 10 },
  { id: "sessions_50", name: "Fifty logged", desc: "Log 50 training sessions", icon: "dumbbell", test: (s) => s.trainingSessions >= 50 },
  /**
   * The recovery side of the ledger, which did not exist at all.
   *
   * Every other system in the app treats backing off as a skill: ACWR, the
   * readiness verdict, the deload week the engine writes into every block. The
   * reward system was the one place that treated it as nothing. An athlete who
   * did exactly what they were told on a Red day earned less than one who
   * ignored it, which is a strange thing for an injury-risk product to pay for.
   */
  { id: "rest_10", name: "Rest is training", desc: "Check in on 10 days you didn't train", icon: "sleep", test: (s) => s.restDaysLogged >= 10 },
  { id: "rest_30", name: "Knows when to stop", desc: "30 rest days logged", icon: "shield", test: (s) => s.restDaysLogged >= 30 },
  { id: "first_program", name: "Got a plan", desc: "Generate your first program", icon: "target", test: (s) => s.completedSessions >= 1 || s.completedBlocks >= 1 },
  { id: "block_cleared", name: "Block cleared", desc: "Finish a full 4-week block", icon: "check", test: (s) => s.completedBlocks >= 1 },
  { id: "first_video", name: "On camera", desc: "Analyse your first clip", icon: "video", test: (s) => s.videos >= 1 },
  { id: "tested", name: "Benchmarked", desc: "Log a strength/speed test", icon: "ruler", test: (s) => s.benchmarks >= 1 },
  { id: "fuelled", name: "Fuelled", desc: "Log your nutrition", icon: "plate", test: (s) => s.nutritionLogs >= 1 },
  { id: "level_10", name: "Double digits", desc: "Reach level 10", icon: "medal", test: (_s, level) => level >= 10 },

  /**
   * A SECOND BATCH, and mostly not more of the same counting.
   *
   * The first fifteen marked one milestone each and then stopped: log ten
   * sessions, log fifty, and after that the ladder ended — so anyone past a
   * couple of months had collected everything there was and the page had
   * nothing left to say to them. Worse, thirteen of the fifteen counted rows in
   * two tables, so "achievements" meant "how long have you had the app".
   *
   * What these add is (a) the far end of the ladders that already existed, so
   * there is something above where a committed athlete already is, and (b) the
   * things the app cares about that nothing was marking: keeping several habits
   * on the same day, coming back, and testing yourself more than once.
   */

  // --- The far end of the existing ladders ---------------------------------
  { id: "streak_14", name: "Fortnight", desc: "14-day check-in streak", icon: "calendar", test: (s) => s.streak >= 14 },
  {
    id: "streak_60", name: "Two months unbroken", desc: "60-day check-in streak", icon: "trophy",
    // 60 is the ceiling: the pages load 60 days of dates, so a longer streak
    // cannot be measured. Asking for 90 would be a badge nobody could earn.
    test: (s) => s.streak >= 60,
  },
  { id: "checkins_100", name: "A hundred mornings", desc: "Check in 100 times", icon: "calendar", test: (s) => s.checkIns >= 100 },
  { id: "checkins_365", name: "A year of it", desc: "Check in 365 times", icon: "trophy", test: (s) => s.checkIns >= 365 },
  { id: "sessions_100", name: "A hundred logged", desc: "Log 100 training sessions", icon: "muscle", test: (s) => s.trainingSessions >= 100 },
  { id: "sessions_250", name: "Two-fifty", desc: "Log 250 training sessions", icon: "trophy", test: (s) => s.trainingSessions >= 250 },
  { id: "rest_60", name: "Recovery is a skill", desc: "60 rest days logged", icon: "sleep", test: (s) => s.restDaysLogged >= 60 },
  { id: "blocks_3", name: "Three blocks deep", desc: "Finish three 4-week blocks", icon: "clipboard", test: (s) => s.completedBlocks >= 3 },
  { id: "sessions_done_50", name: "Fifty off the plan", desc: "Tick off 50 programmed sessions", icon: "check", test: (s) => s.completedSessions >= 50 },
  { id: "nutrition_30", name: "A month of meals", desc: "Log your food on 30 days", icon: "plate", test: (s) => s.nutritionLogs >= 30 },
  { id: "videos_10", name: "Ten on tape", desc: "Analyse 10 clips", icon: "camera", test: (s) => s.videos >= 10 },
  { id: "level_25", name: "Quarter century", desc: "Reach level 25", icon: "medal", test: (_s, level) => level >= 25 },

  // --- Things nothing was marking ------------------------------------------
  /**
   * Testing yourself ONCE is a number; testing yourself repeatedly is the only
   * way to know whether any of this worked. "Benchmarked" paid for the first
   * and nothing paid for the habit.
   */
  { id: "tested_5", name: "Retested", desc: "Log 5 strength or speed tests", icon: "ruler", test: (s) => s.benchmarks >= 5 },
  /**
   * All three in a day: checked in, trained, ate for it. This is the loop the
   * whole app is built around and nothing rewarded doing the whole of it —
   * every badge counted one habit in isolation.
   */
  { id: "full_house", name: "Full house", desc: "Check in, train and log your food on the same day", icon: "confetti", test: (s) => s.perfectDaysLast7 >= 1 },
  { id: "full_house_3", name: "Three in a week", desc: "Three complete days in one week", icon: "flame", test: (s) => s.perfectDaysLast7 >= 3 },
  /**
   * COMING BACK IS THE HARD PART, and the streak counter actively punishes it:
   * miss one day of a forty-day run and you are on zero, with nothing to show
   * for the forty. This marks the run you HAD. It is the badge most likely to
   * matter to someone deciding whether to open the app again after a week off.
   */
  { id: "best_streak_21", name: "Twenty-one straight", desc: "Reach a 21-day streak — it counts even after it ends", icon: "shield", test: (s) => s.longestStreak >= 21 },
  /**
   * Weeks with something in them, not consecutive days. Rewards showing up
   * roughly rather than perfectly, which is what most people actually manage
   * and what the app should be encouraging over an unbroken chain.
   */
  { id: "weeks_8", name: "Two months in", desc: "Check in during 8 different weeks", icon: "chart", test: (s) => s.weeksActive >= 8 },

  /**
   * A THIRD BATCH. Two things drove it.
   *
   * The first is that the ladders still ended too early for anyone who sticks
   * around: "Two-fifty" was the top of the training rung, level 25 the top of
   * the level rung, and an athlete two years in had nothing above them. The XP
   * curve now ramps past level 20, so the level badges have to reach further
   * than they used to or the ramp leads nowhere.
   *
   * The second is that thirteen of the original fifteen counted rows in two
   * tables, and adding more thresholds to the same two counters would just make
   * that worse. So the new counters — complete days across the window, and
   * coming back after time away — carry most of what is new here.
   *
   * THE CEILING RULE APPLIES TO ALL OF IT: anything derived from the loaded
   * dates is bounded by the 60-day query window, so no badge may ask for more
   * than 60 of them. There is a test.
   */

  // --- Further up the ladders that already existed --------------------------
  { id: "checkins_200", name: "Two hundred mornings", desc: "Check in 200 times", icon: "calendar", test: (s) => s.checkIns >= 200 },
  { id: "sessions_500", name: "Five hundred", desc: "Log 500 training sessions", icon: "trophy", test: (s) => s.trainingSessions >= 500 },
  { id: "sessions_done_100", name: "A hundred off the plan", desc: "Tick off 100 programmed sessions", icon: "check", test: (s) => s.completedSessions >= 100 },
  { id: "sessions_done_250", name: "Programme regular", desc: "Tick off 250 programmed sessions", icon: "clipboard", test: (s) => s.completedSessions >= 250 },
  { id: "blocks_6", name: "Six blocks", desc: "Finish six 4-week blocks", icon: "clipboard", test: (s) => s.completedBlocks >= 6 },
  { id: "blocks_12", name: "A year of blocks", desc: "Finish twelve 4-week blocks", icon: "trophy", test: (s) => s.completedBlocks >= 12 },
  { id: "nutrition_100", name: "A hundred days fed", desc: "Log your food on 100 days", icon: "bowl", test: (s) => s.nutritionLogs >= 100 },
  { id: "nutrition_365", name: "A year of meals", desc: "Log your food on 365 days", icon: "trophy", test: (s) => s.nutritionLogs >= 365 },
  { id: "videos_25", name: "Twenty-five clips", desc: "Analyse 25 clips", icon: "camera", test: (s) => s.videos >= 25 },
  { id: "tested_10", name: "Ten tests deep", desc: "Log 10 strength or speed tests", icon: "ruler", test: (s) => s.benchmarks >= 10 },
  { id: "tested_25", name: "Measured", desc: "Log 25 strength or speed tests", icon: "chart", test: (s) => s.benchmarks >= 25 },
  { id: "rest_100", name: "A hundred days off", desc: "100 rest days logged", icon: "sleep", test: (s) => s.restDaysLogged >= 100 },
  // No rung above "Two months in" for weeksActive: the pages load 60 days of
  // dates, so the counter cannot exceed 8 and a badge asking for 26 would sit
  // greyed out forever. The ceiling test caught exactly that when it was tried.

  /**
   * The level rungs, spread to match the curve rather than the old flat one.
   * Levels cost more the higher you go now, so 40 is a long way past 25 and 75
   * is a long way past 50 — these are further apart on purpose.
   */
  { id: "level_5", name: "Getting going", desc: "Reach level 5", icon: "signal", test: (_s, level) => level >= 5 },
  { id: "level_40", name: "Forty", desc: "Reach level 40", icon: "medal", test: (_s, level) => level >= 40 },
  { id: "level_50", name: "Halfway to a hundred", desc: "Reach level 50", icon: "trophy", test: (_s, level) => level >= 50 },
  { id: "level_75", name: "Seventy-five", desc: "Reach level 75", icon: "trophy", test: (_s, level) => level >= 75 },
  { id: "level_100", name: "Century", desc: "Reach level 100", icon: "confetti", test: (_s, level) => level >= 100 },

  // --- Doing the whole loop, repeatedly -------------------------------------
  /**
   * "Full house" paid for one complete day and "Three in a week" for three, and
   * then it stopped, because `perfectDaysLast7` resets every seven days. These
   * run off the unresetting count, so the hardest habit in the app — all three
   * on the same day — has a ladder like everything else.
   */
  { id: "perfect_5", name: "Five complete days", desc: "Check in, train and eat for it — five days", icon: "target", test: (s) => s.perfectDays >= 5 },
  { id: "perfect_10", name: "Ten complete days", desc: "Ten days with all three done", icon: "flame", test: (s) => s.perfectDays >= 10 },
  { id: "perfect_25", name: "Twenty-five complete", desc: "Twenty-five days with all three done", icon: "medal", test: (s) => s.perfectDays >= 25 },
  { id: "perfect_50", name: "Fifty complete", desc: "Fifty days with the whole loop closed", icon: "trophy", test: (s) => s.perfectDays >= 50 },
  { id: "perfect_week_full", name: "A perfect week", desc: "All three, every day, for seven days", icon: "confetti", test: (s) => s.perfectDaysLast7 >= 7 },

  // --- Coming back ----------------------------------------------------------
  /**
   * The badges most likely to matter to someone deciding whether to open the
   * app again after a fortnight off, and the ones the streak counter can never
   * give them. Nothing else in here rewards an interrupted history.
   */
  { id: "comeback_1", name: "Back at it", desc: "Return after a week or more away", icon: "run", test: (s) => s.comebacks >= 1 },
  { id: "comeback_3", name: "Keeps coming back", desc: "Return from three separate breaks", icon: "shield", test: (s) => s.comebacks >= 3 },
  { id: "comeback_5", name: "Hard to shake", desc: "Return from five separate breaks", icon: "battery", test: (s) => s.comebacks >= 5 },
  { id: "best_streak_10", name: "Ten straight", desc: "Reach a 10-day streak — it counts even after it ends", icon: "flame", test: (s) => s.longestStreak >= 10 },
  { id: "best_streak_45", name: "Forty-five straight", desc: "Reach a 45-day streak — it counts even after it ends", icon: "trophy", test: (s) => s.longestStreak >= 45 },

  // --- Balance, rather than accumulation ------------------------------------
  /**
   * These pay for the SHAPE of a history, not its size, and they are the only
   * badges here that a bigger number cannot buy. An athlete who trains hard and
   * never rests fails the first one however many sessions they log — which is
   * the point, in an app whose load engine treats that pattern as an injury
   * risk.
   */
  {
    id: "balanced", name: "Balanced", desc: "Log at least one rest day for every four sessions", icon: "scales",
    test: (s) => s.trainingSessions >= 20 && s.restDaysLogged * 4 >= s.trainingSessions,
  },
  {
    id: "all_rounder", name: "All-rounder", desc: "Use every part of the app: check in, train, eat, test and film",
    icon: "confetti",
    test: (s) => s.checkIns >= 1 && s.trainingSessions >= 1 && s.nutritionLogs >= 1 && s.benchmarks >= 1 && s.videos >= 1,
  },
  {
    id: "planned", name: "Runs the plan", desc: "Tick off more programmed sessions than you log loose ones",
    icon: "clipboard",
    test: (s) => s.completedSessions >= 20 && s.completedSessions >= s.trainingSessions - s.completedSessions,
  },
  {
    id: "fuelled_properly", name: "Eats like an athlete", desc: "Log food on more days than you train",
    icon: "plate",
    test: (s) => s.trainingSessions >= 20 && s.nutritionLogs >= s.trainingSessions,
  },
];

export function evaluateAchievements(s: ActivityStats, level: number): { unlocked: Achievement[]; locked: Achievement[] } {
  const unlocked: Achievement[] = [];
  const locked: Achievement[] = [];
  for (const a of ACHIEVEMENTS) (a.test(s, level) ? unlocked : locked).push(a);
  return { unlocked, locked };
}

// --- Daily quests -----------------------------------------------------------

export interface DailyState {
  checkedInToday: boolean;
  trainedToday: boolean;
  nutritionToday: boolean;
}

export interface Quest {
  id: string;
  label: string;
  xp: number;
  done: boolean;
  href: string;
}

export function dailyQuests(d: DailyState): Quest[] {
  return [
    { id: "checkin", label: "Log today's check-in", xp: XP.checkIn, done: d.checkedInToday, href: "/journal" },
    { id: "train", label: "Complete a training session", xp: XP.completedSession, done: d.trainedToday, href: "/coach" },
    { id: "nutrition", label: "Log your nutrition", xp: XP.nutritionLog, done: d.nutritionToday, href: "/nutrition" },
  ];
}
