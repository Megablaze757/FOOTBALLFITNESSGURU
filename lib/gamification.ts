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
}

export const EMPTY_STATS: ActivityStats = {
  checkIns: 0, streak: 0, trainingSessions: 0, completedSessions: 0,
  completedBlocks: 0, benchmarks: 0, videos: 0, nutritionLogs: 0, checkInsLast7: 0,
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
    s.streak * XP.streakDay
  );
}

export interface LevelInfo {
  level: number;
  rank: string;
  emoji: string;
  xp: number;
  xpIntoLevel: number;
  xpForNext: number;
  progress: number; // 0..1 toward next level
}

// Each level costs a bit more than the last: 100, 150, 200, …
function costForLevel(level: number): number {
  return 100 + (level - 1) * 50;
}

const RANKS: { min: number; rank: string; emoji: string }[] = [
  { min: 25, rank: "World Class", emoji: "👑" },
  { min: 15, rank: "Elite", emoji: "🏆" },
  { min: 10, rank: "Pro", emoji: "⭐" },
  { min: 6, rank: "Semi-Pro", emoji: "🔥" },
  { min: 3, rank: "Amateur", emoji: "💪" },
  { min: 1, rank: "Rookie", emoji: "🌱" },
];

export function rankFor(level: number): { rank: string; emoji: string } {
  return RANKS.find((r) => level >= r.min) ?? RANKS[RANKS.length - 1];
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
  const { rank, emoji } = rankFor(level);
  const xpIntoLevel = xp - acc;
  return { level, rank, emoji, xp, xpIntoLevel, xpForNext: need, progress: need ? xpIntoLevel / need : 0 };
}

// --- Achievements -----------------------------------------------------------

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
  test: (s: ActivityStats, level: number) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_checkin", name: "First step", desc: "Log your first check-in", icon: "👣", test: (s) => s.checkIns >= 1 },
  { id: "streak_7", name: "Week warrior", desc: "7-day check-in streak", icon: "🔥", test: (s) => s.streak >= 7 },
  { id: "streak_30", name: "Unstoppable", desc: "30-day check-in streak", icon: "⚡", test: (s) => s.streak >= 30 },
  { id: "perfect_week", name: "Perfect week", desc: "Check in all 7 days", icon: "📅", test: (s) => s.checkInsLast7 >= 7 },
  { id: "sessions_10", name: "Grinder", desc: "Log 10 training sessions", icon: "🏋️", test: (s) => s.trainingSessions >= 10 },
  { id: "sessions_50", name: "Machine", desc: "Log 50 training sessions", icon: "🤖", test: (s) => s.trainingSessions >= 50 },
  { id: "first_program", name: "Got a plan", desc: "Generate your first program", icon: "🗺️", test: (s) => s.completedSessions >= 1 || s.completedBlocks >= 1 },
  { id: "block_cleared", name: "Block cleared", desc: "Finish a full 4-week block", icon: "✅", test: (s) => s.completedBlocks >= 1 },
  { id: "first_video", name: "On camera", desc: "Analyse your first clip", icon: "🎥", test: (s) => s.videos >= 1 },
  { id: "tested", name: "Benchmarked", desc: "Log a strength/speed test", icon: "📏", test: (s) => s.benchmarks >= 1 },
  { id: "fuelled", name: "Fuelled", desc: "Log your nutrition", icon: "🍽️", test: (s) => s.nutritionLogs >= 1 },
  { id: "level_10", name: "Double digits", desc: "Reach level 10", icon: "🌟", test: (_s, level) => level >= 10 },
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
