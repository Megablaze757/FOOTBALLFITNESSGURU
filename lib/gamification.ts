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
}

export const EMPTY_STATS: ActivityStats = {
  checkIns: 0, streak: 0, trainingSessions: 0, completedSessions: 0,
  completedBlocks: 0, benchmarks: 0, videos: 0, nutritionLogs: 0, checkInsLast7: 0,
  restDaysLogged: 0, longestStreak: 0, weeksActive: 0, perfectDaysLast7: 0,
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
): Pick<ActivityStats, "longestStreak" | "weeksActive" | "perfectDaysLast7"> {
  const days = [...new Set(checkDates)].sort();

  let longestStreak = 0;
  let run = 0;
  let previous: number | null = null;
  for (const d of days) {
    const t = Date.parse(`${d}T00:00:00Z`);
    if (Number.isNaN(t)) continue;
    run = previous !== null && t - previous === DAY_MS ? run + 1 : 1;
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

  return { longestStreak, weeksActive: weeks.size, perfectDaysLast7 };
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
    s.streak * XP.streakDay +
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
  xp: number;
  xpIntoLevel: number;
  xpForNext: number;
  progress: number;   // 0..1 toward next level
}

// Each level costs a bit more than the last: 100, 150, 200, …
function costForLevel(level: number): number {
  return 100 + (level - 1) * 50;
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
  | "Emerald" | "Diamond" | "Champion" | "Legend";

interface TierDef { name: TierName; emoji: string; color: string; span: number }

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
  { name: "Champion", emoji: "🏆", color: "#c084fc", span: 4 },
  { name: "Legend", emoji: "👑", color: "#fb7185", span: Infinity },
];

// Divisions count DOWN as you improve, as in every game that uses them: you
// enter a tier at III and promote out of I.
const DIVISIONS = ["III", "II", "I"];

export interface RankInfo {
  rank: string;      // "Gold II"
  tier: TierName;
  division: string;
  emoji: string;
  color: string;
}

export function rankFor(level: number): RankInfo {
  let remaining = Math.max(1, Math.floor(level)) - 1; // levels above level 1
  for (const t of TIERS) {
    if (remaining < t.span) {
      // Tiers wider than the division list (or the open-ended top) just show the
      // tier name — better a clean "Legend" than an invented "Legend IV".
      const division = t.span <= DIVISIONS.length ? DIVISIONS[remaining] ?? "" : "";
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

export function levelFor(xp: number): LevelInfo {
  let level = 1;
  let acc = 0;
  let need = costForLevel(1);
  while (xp >= acc + need) {
    acc += need;
    level++;
    need = costForLevel(level);
  }
  const { rank, emoji, tier, division, color } = rankFor(level);
  const xpIntoLevel = xp - acc;
  return {
    level, rank, emoji, tier, division, color,
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
