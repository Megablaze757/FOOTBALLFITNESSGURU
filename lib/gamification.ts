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
}

export const EMPTY_STATS: ActivityStats = {
  checkIns: 0, streak: 0, trainingSessions: 0, completedSessions: 0,
  completedBlocks: 0, benchmarks: 0, videos: 0, nutritionLogs: 0, checkInsLast7: 0,
  restDaysLogged: 0,
};

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
