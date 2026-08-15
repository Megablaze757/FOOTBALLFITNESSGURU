// =============================================================================
// The challenge pool, and the engine that picks from it.
//
// WHY A POOL AND NOT A MODEL CALL. Weekly challenges were generated per athlete
// per week, which is one inference each, every week, forever — and the free
// model tiers that would carry it are the most rate-limited and the likeliest
// to be deprecated without notice. Worse, the model was never allowed to write
// the RULE (see lib/challenges.ts: a free-text goal creates a challenge nothing
// can check), only the words around a metric from a fixed vocabulary. So the
// entire contribution of the model was phrasing.
//
// Phrasing is worth having. It is not worth a network call, a fallback path and
// a per-user cost, and it is certainly not worth being unreviewable: nobody can
// read what a model will say to an athlete next Tuesday. A written pool is the
// same output, deterministic, testable, and free.
//
// WHAT THE ENGINE ADDS. Picking is where the personalisation actually lives,
// and it works the way lib/engine.ts does for movements: score every candidate
// against who the athlete is (sport, goal, position, training focus) and what
// they are currently neglecting, then take the best few distinct metrics.
// A winger and a prop get different challenges for the same reason they get
// different sessions.
// =============================================================================

import type { SportId } from "./exercises";
import type { GoalType, TrainingFocus } from "./coach";
import { positionList } from "./positions";
import {
  clampTarget, xpFor, type Challenge, type ChallengeMetric, type WeekActivity,
} from "./challenges";

export type ChallengeWindow = "daily" | "weekly";

export interface ChallengeTemplate {
  id: string;
  window: ChallengeWindow;
  metric: ChallengeMetric;
  /** Clamped by lib/challenges — nobody is handed "train 7 days this week". */
  target: number;
  title: string;
  blurb: string;
  icon: string;
  /** Sports this suits. Absent = everyone. */
  sports?: SportId[];
  /** Programme goals this suits. Absent = everyone. */
  goals?: GoalType[];
  /** Positions this suits, by the exact POSITIONS_BY_SPORT strings. */
  positions?: string[];
  /** Training focus this suits. Absent = everyone. */
  focus?: TrainingFocus[];
}

// --- Daily -------------------------------------------------------------------
//
// A day is short and the vocabulary over one day is narrow, so these lean on
// the metrics added for exactly this window: a complete day, a day on target, a
// deliberately easy session, a rest day taken on purpose.

const DAILY: ChallengeTemplate[] = [
  { id: "d_checkin", window: "daily", metric: "check_ins", target: 1, icon: "📋",
    title: "Open with the check-in", blurb: "Thirty seconds. It is what everything else on the page is built from." },
  { id: "d_train", window: "daily", metric: "training_sessions", target: 1, icon: "🏋️",
    title: "Get the session in", blurb: "One logged session today. It does not have to be the best one you have ever done." },
  { id: "d_food", window: "daily", metric: "nutrition_logs", target: 1, icon: "🍽️",
    title: "Log what you ate", blurb: "Even roughly. A day you did not log is a day nothing can be learned from." },
  { id: "d_perfect", window: "daily", metric: "perfect_days", target: 1, icon: "🎯",
    title: "The full set", blurb: "Check in, train and log your food — all three, today." },
  { id: "d_calories", window: "daily", metric: "calorie_goal_days", target: 1, icon: "⚖️",
    title: "Hit your number", blurb: "Land inside your calorie target today. Under-eating is not discipline." },
    { id: "d_easy", window: "daily", metric: "easy_sessions", target: 1, icon: "🌱",
    title: "Keep it easy today", blurb: "One session at RPE 6 or under. Easy days are what make hard days possible." },
  { id: "d_rest", window: "daily", metric: "rest_days", target: 1, icon: "😴",
    title: "Take the rest day", blurb: "Check in, do not train. Backing off on purpose is training." },
  { id: "d_video", window: "daily", metric: "videos", target: 1, icon: "🎥",
    title: "Film one set", blurb: "A couple of reps on camera. It reads what your eyes cannot." },
  { id: "d_benchmark", window: "daily", metric: "benchmarks", target: 1, icon: "📏",
    title: "Test something", blurb: "One benchmark. Numbers are how you find out any of this worked." },

  // Sport- and goal-flavoured versions of the same metrics.
  { id: "d_train_speed", window: "daily", metric: "training_sessions", target: 1, icon: "⚡", goals: ["speed"],
    title: "Sharp and short", blurb: "Speed work is quality, not volume. Get it done fresh and stop while it is still fast." },
  { id: "d_easy_endurance", window: "daily", metric: "easy_sessions", target: 1, icon: "🫁", goals: ["endurance"],
    title: "Bank an easy one", blurb: "Most of an endurance week should feel easy. Today is one of those." },
  { id: "d_food_strength", window: "daily", metric: "calorie_goal_days", target: 1, icon: "🍚", goals: ["strength"],
    title: "Eat like you lift", blurb: "Strength is built on food. Hit today's target." },
  { id: "d_rest_injury", window: "daily", metric: "rest_days", target: 1, icon: "🩹", goals: ["injury_recovery"],
    title: "Rest is the session", blurb: "On a rehab block the day off is not time away from training. It is training." },
  { id: "d_program_skill", window: "daily", metric: "training_sessions", target: 1, icon: "🎯", goals: ["skill"],
    title: "Technical work, done properly", blurb: "One session today, at full attention. Sloppy reps teach sloppy habits." },
  { id: "d_train_gk", window: "daily", metric: "training_sessions", target: 1, icon: "🧤",
    sports: ["football"], positions: ["Goalkeeper"],
    title: "Hands and feet", blurb: "A keeper's session is reactive, lateral and short. Quality over minutes." },
  { id: "d_easy_marathon", window: "daily", metric: "easy_sessions", target: 1, icon: "🏃",
    sports: ["running"], positions: ["Marathon", "Half marathon"],
    title: "Easy means easy", blurb: "If you could not hold a conversation, it was not an easy run." },
  { id: "d_streak_keep", window: "daily", metric: "check_ins", target: 1, icon: "🔥",
    title: "Keep the run alive", blurb: "One check-in is all it takes to keep the streak where it is." },
  { id: "d_food_early", window: "daily", metric: "nutrition_logs", target: 1, icon: "📝",
    title: "Log it as you go", blurb: "Log the meal now rather than reconstructing the day at midnight." },
  { id: "d_easy_rehab", window: "daily", metric: "easy_sessions", target: 1, icon: "🩺", goals: ["injury_recovery"],
    title: "Keep it well under", blurb: "One session at RPE 6 or under. On a rehab block, that ceiling is the plan." },
  { id: "d_perfect_perf", window: "daily", metric: "perfect_days", target: 1, icon: "🏆", focus: ["performance"],
    title: "One complete day", blurb: "Check in, train, log the food. Performance is the sum of ordinary days." },
  { id: "d_cal_aesthetic", window: "daily", metric: "calorie_goal_days", target: 1, icon: "📉", focus: ["aesthetics"],
    title: "Stay in range", blurb: "Body composition is a long series of days inside the range, not one hard one." },
  { id: "d_rest_fitness", window: "daily", metric: "rest_days", target: 1, icon: "🛋️", focus: ["fitness"],
    title: "A day off counts", blurb: "Check in, skip the session. Consistency includes the days you do nothing." },
  { id: "d_train_agility", window: "daily", metric: "training_sessions", target: 1, icon: "🔀", goals: ["agility"],
    title: "Feet first", blurb: "Change of direction is a skill. Do it fresh, at the start, not as a finisher." },
  { id: "d_video_skill", window: "daily", metric: "videos", target: 1, icon: "📹", goals: ["skill"],
    title: "Film today's key rep", blurb: "One clip. Technique you have only felt is technique you cannot check." },
  { id: "d_train_sprint", window: "daily", metric: "training_sessions", target: 1, icon: "💨",
    sports: ["running"], positions: ["Sprinter", "800m/1500m"],
    title: "Short and sharp", blurb: "Quality over quantity. Stop the session while you are still fast." },
  { id: "d_cal_lifting", window: "daily", metric: "calorie_goal_days", target: 1, icon: "🥩",
    sports: ["weightlifting"], positions: ["Powerlifting", "Olympic lifting"],
    title: "Eat for the bar", blurb: "Hit today's number. You cannot recover from a heavy session on a deficit." },
  { id: "d_rest_forward", window: "daily", metric: "rest_days", target: 1, icon: "🏉",
    sports: ["rugby"], positions: ["Prop", "Hooker", "Lock", "No. 8"],
    title: "The big units rest", blurb: "Contact and carrying loads add up. Take the day, check in, and let it settle." },
];

// --- Weekly ------------------------------------------------------------------
//
// A week is long enough for a real target, so this is where most of the pool
// lives. Several templates per metric at different sizes, so the selector can
// meet an athlete where they are rather than handing everyone a 5.

const WEEKLY_GENERAL: ChallengeTemplate[] = [
  { id: "w_checkin_3", window: "weekly", metric: "check_ins", target: 3, icon: "📋",
    title: "Three mornings", blurb: "Check in on three days this week. Start where you can hold it." },
  { id: "w_checkin_5", window: "weekly", metric: "check_ins", target: 5, icon: "📋",
    title: "Five out of seven", blurb: "Check in five days this week — the habit that turns on everything else." },
  { id: "w_checkin_7", window: "weekly", metric: "check_ins", target: 7, icon: "🗓️",
    title: "The full week", blurb: "Every single day. Seven for seven." },
  { id: "w_train_2", window: "weekly", metric: "training_sessions", target: 2, icon: "🏋️",
    title: "Two on the board", blurb: "Two sessions this week. Consistency beats intensity you cannot repeat." },
  { id: "w_train_3", window: "weekly", metric: "training_sessions", target: 3, icon: "🏋️",
    title: "Three sessions", blurb: "Three this week. The number most people can actually sustain." },
  { id: "w_train_4", window: "weekly", metric: "training_sessions", target: 4, icon: "💪",
    title: "Four hard days", blurb: "Four logged sessions. This is a proper training week." },
  { id: "w_train_5", window: "weekly", metric: "training_sessions", target: 5, icon: "🔥",
    title: "Five deep", blurb: "Five sessions in seven days. Watch your readiness while you do it." },
  { id: "w_food_3", window: "weekly", metric: "nutrition_logs", target: 3, icon: "🍽️",
    title: "Start logging food", blurb: "Three days of food logged. You cannot fix what you have not looked at." },
  { id: "w_food_5", window: "weekly", metric: "nutrition_logs", target: 5, icon: "🍽️",
    title: "Fuel like a pro", blurb: "Log what you eat on five days. Training is only half of it." },
  { id: "w_food_7", window: "weekly", metric: "nutrition_logs", target: 7, icon: "🥗",
    title: "Every day this week", blurb: "Seven days of food logged. This is where the pattern shows up." },
  { id: "w_cal_3", window: "weekly", metric: "calorie_goal_days", target: 3, icon: "⚖️",
    title: "Three on target", blurb: "Land inside your calorie range on three days." },
  { id: "w_cal_5", window: "weekly", metric: "calorie_goal_days", target: 5, icon: "⚖️",
    title: "Five on target", blurb: "Five days inside your range. Consistent fuelling, not a perfect day." },
  { id: "w_streak_7", window: "weekly", metric: "streak", target: 7, icon: "🔥",
    title: "Build a week-long streak", blurb: "Seven consecutive check-ins. It is the run, not the total." },
  { id: "w_streak_14", window: "weekly", metric: "streak", target: 14, icon: "🔥",
    title: "Push the streak to 14", blurb: "Two unbroken weeks. Keep it going." },
  { id: "w_streak_30", window: "weekly", metric: "streak", target: 30, icon: "🏆",
    title: "Thirty days unbroken", blurb: "A month of showing up. Very few get here." },
  { id: "w_perfect_2", window: "weekly", metric: "perfect_days", target: 2, icon: "🎯",
    title: "Two complete days", blurb: "Check in, train and log food on the same day — twice this week." },
  { id: "w_perfect_3", window: "weekly", metric: "perfect_days", target: 3, icon: "🎯",
    title: "Three complete days", blurb: "All three habits, same day, three times. This is the whole loop." },
  { id: "w_rest_1", window: "weekly", metric: "rest_days", target: 1, icon: "😴",
    title: "Take one properly off", blurb: "One day checked in and not trained. Recovery is a session you do not do." },
  { id: "w_rest_2", window: "weekly", metric: "rest_days", target: 2, icon: "😴",
    title: "Two days off, on purpose", blurb: "Two rest days logged. Adaptation happens between sessions, not during them." },
  { id: "w_easy_2", window: "weekly", metric: "easy_sessions", target: 2, icon: "🌱",
    title: "Two easy sessions", blurb: "Two at RPE 6 or under. If every session is hard, none of them are." },
  { id: "w_easy_3", window: "weekly", metric: "easy_sessions", target: 3, icon: "🌱",
    title: "Mostly easy", blurb: "Three easy sessions this week. The hard days are only hard by comparison." },
  { id: "w_video_1", window: "weekly", metric: "videos", target: 1, icon: "🎥",
    title: "Get one on camera", blurb: "Film a working set. Frame by frame beats how it felt." },
  { id: "w_video_2", window: "weekly", metric: "videos", target: 2, icon: "🎥",
    title: "Two clips", blurb: "Two lifts filmed this week — ideally the same one, twice." },
  { id: "w_bench_1", window: "weekly", metric: "benchmarks", target: 1, icon: "📏",
    title: "Put a number on it", blurb: "One benchmark test. Progress you cannot measure is a feeling." },
  { id: "w_bench_2", window: "weekly", metric: "benchmarks", target: 2, icon: "📊",
    title: "Retest twice", blurb: "Two tests this week. One number is a point; two is a direction." },
  { id: "w_checkin_4", window: "weekly", metric: "check_ins", target: 4, icon: "📋",
    title: "Four days", blurb: "Check in on four days. More than half the week is a real habit." },
  { id: "w_checkin_6", window: "weekly", metric: "check_ins", target: 6, icon: "🔥",
    title: "Six of seven", blurb: "Six check-ins. One day off is allowed; six is still a full week." },
  { id: "w_train_6", window: "weekly", metric: "training_sessions", target: 6, icon: "⚙️",
    title: "Six sessions", blurb: "Six in seven days. Only take this on if your readiness has been green." },
  { id: "w_food_4", window: "weekly", metric: "nutrition_logs", target: 4, icon: "🍽️",
    title: "Four days logged", blurb: "Log your food on four days. Enough to see a pattern rather than a snapshot." },
  { id: "w_food_6", window: "weekly", metric: "nutrition_logs", target: 6, icon: "🥗",
    title: "Six days of food", blurb: "Six days logged. The week you can actually draw conclusions from." },
  { id: "w_cal_2", window: "weekly", metric: "calorie_goal_days", target: 2, icon: "⚖️",
    title: "Two on target", blurb: "Start here. Two days inside your range is a foothold, not a compromise." },
  { id: "w_cal_7", window: "weekly", metric: "calorie_goal_days", target: 7, icon: "🎯",
    title: "Every day on target", blurb: "Seven days inside your range. This is a hard one and it should be." },
  { id: "w_streak_21", window: "weekly", metric: "streak", target: 21, icon: "🔥",
    title: "Three weeks unbroken", blurb: "Twenty-one consecutive check-ins. The run is the achievement." },
  { id: "w_perfect_1", window: "weekly", metric: "perfect_days", target: 1, icon: "🎯",
    title: "One complete day", blurb: "Check in, train and log your food on the same day. Just once this week." },
  { id: "w_perfect_4", window: "weekly", metric: "perfect_days", target: 4, icon: "🏆",
    title: "Four complete days", blurb: "Four days with all three done. Very few weeks look like this." },
  { id: "w_rest_3", window: "weekly", metric: "rest_days", target: 3, icon: "😴",
    title: "Three days off", blurb: "Three rest days logged. A deload week is meant to look like this." },
  { id: "w_easy_4", window: "weekly", metric: "easy_sessions", target: 4, icon: "🌱",
    title: "Four easy sessions", blurb: "Four at RPE 6 or under. This is what a genuine recovery week looks like." },
  { id: "w_video_3", window: "weekly", metric: "videos", target: 3, icon: "🎬",
    title: "Three clips", blurb: "Three lifts filmed. Enough to compare rather than just look." },
  { id: "w_bench_3", window: "weekly", metric: "benchmarks", target: 3, icon: "📊",
    title: "Test week", blurb: "Three tests. Retest the same things you did last block, not new ones." },
];

// --- Weekly, by goal ---------------------------------------------------------

const WEEKLY_BY_GOAL: ChallengeTemplate[] = [
  { id: "w_speed_quality", window: "weekly", metric: "training_sessions", target: 3, icon: "⚡", goals: ["speed"],
    title: "Three quality days", blurb: "Speed is trained fresh. Three sessions, none of them junk miles." },
  { id: "w_speed_easy", window: "weekly", metric: "easy_sessions", target: 2, icon: "🌱", goals: ["speed", "agility"],
    title: "Earn the fast days", blurb: "Two easy sessions. Sprinting tired trains you to be slow." },
  { id: "w_strength_program", window: "weekly", metric: "training_sessions", target: 4, icon: "🏋️", goals: ["strength"],
    title: "Four sessions", blurb: "Strength comes from running the block as written, not improvising. Log all four." },
  { id: "w_strength_food", window: "weekly", metric: "calorie_goal_days", target: 5, icon: "🍚", goals: ["strength"],
    title: "Eat for the block", blurb: "Five days on target. You cannot add strength in a deficit you did not plan." },
  { id: "w_endurance_easy", window: "weekly", metric: "easy_sessions", target: 3, icon: "🫁", goals: ["endurance"],
    title: "Keep the easy days easy", blurb: "Three sessions at RPE 6 or under. Most of an endurance week should be." },
  { id: "w_endurance_volume", window: "weekly", metric: "training_sessions", target: 5, icon: "🏃", goals: ["endurance"],
    title: "Five runs", blurb: "Frequency is the engine. Five sessions, most of them comfortable." },
  { id: "w_agility_program", window: "weekly", metric: "training_sessions", target: 3, icon: "🔀", goals: ["agility"],
    title: "Three change-of-direction days", blurb: "Agility is a skill before it is a fitness quality. Run the drills." },
  { id: "w_rehab_rest", window: "weekly", metric: "rest_days", target: 2, icon: "🩹", goals: ["injury_recovery"],
    title: "Two full rest days", blurb: "On a rehab block, the days off do as much work as the days on." },
  { id: "w_rehab_checkin", window: "weekly", metric: "check_ins", target: 7, icon: "📋", goals: ["injury_recovery"],
    title: "Track it every day", blurb: "Check in daily while you are rehabbing — the pain map is what the plan reads." },
  { id: "w_skill_program", window: "weekly", metric: "training_sessions", target: 3, icon: "🎯", goals: ["skill"],
    title: "Three technical sessions", blurb: "Skill is reps with attention. Three sessions, done properly." },
  { id: "w_skill_video", window: "weekly", metric: "videos", target: 2, icon: "🎥", goals: ["skill"],
    title: "Film the technique", blurb: "Two clips. You cannot fix what you have only felt." },
  { id: "w_speed_rest", window: "weekly", metric: "rest_days", target: 2, icon: "😴", goals: ["speed"],
    title: "Two days fully off", blurb: "Speed work is the most fatiguing thing you do. It needs the days around it." },
  { id: "w_speed_bench", window: "weekly", metric: "benchmarks", target: 1, icon: "📏", goals: ["speed"],
    title: "Time yourself", blurb: "One timed effort. Speed is the one quality you can never judge by feel." },
  { id: "w_strength_bench", window: "weekly", metric: "benchmarks", target: 1, icon: "🏋️", goals: ["strength"],
    title: "Test a lift", blurb: "One benchmark. A block with no test at the end is a block you cannot judge." },
  { id: "w_strength_video", window: "weekly", metric: "videos", target: 1, icon: "🎥", goals: ["strength"],
    title: "Film the heavy set", blurb: "One clip of your top set. Bar speed is the honest read on how it went." },
  { id: "w_endurance_food", window: "weekly", metric: "nutrition_logs", target: 6, icon: "🍚", goals: ["endurance"],
    title: "Log the fuel", blurb: "Six days. Under-fuelled endurance training is the fastest route to injury." },
  { id: "w_endurance_checkin", window: "weekly", metric: "check_ins", target: 6, icon: "📋", goals: ["endurance"],
    title: "Watch the load", blurb: "Six check-ins. Volume creeps up quietly and the check-in is what catches it." },
  { id: "w_agility_easy", window: "weekly", metric: "easy_sessions", target: 2, icon: "🌱", goals: ["agility"],
    title: "Sharp, not tired", blurb: "Two easy sessions. Cutting and landing on dead legs is how knees go." },
  { id: "w_agility_video", window: "weekly", metric: "videos", target: 1, icon: "🎥", goals: ["agility"],
    title: "Film a cut", blurb: "One clip of a change of direction. Knee position is visible and not feelable." },
  { id: "w_rehab_easy", window: "weekly", metric: "easy_sessions", target: 3, icon: "🩹", goals: ["injury_recovery"],
    title: "Three sessions well under", blurb: "Three at RPE 6 or under. On a rehab block that ceiling is the whole plan." },
  { id: "w_rehab_perfect", window: "weekly", metric: "perfect_days", target: 2, icon: "🩺", goals: ["injury_recovery"],
    title: "Two complete days", blurb: "Rehab works fastest when the sleep, the food and the session all line up." },
  { id: "w_skill_checkin", window: "weekly", metric: "check_ins", target: 5, icon: "📋", goals: ["skill"],
    title: "Five check-ins", blurb: "Skill work needs fresh attention. The check-in is what tells you if you have it." },
];

// --- Weekly, by sport and position -------------------------------------------
//
// Position-specific challenges are deliberately about the QUALITY a position
// lives on, not about a drill — a challenge has to be checkable by counting
// something, and the counters do not know what movement you did.

const WEEKLY_BY_POSITION: ChallengeTemplate[] = [
  // Football
  { id: "w_fb_gk", window: "weekly", metric: "training_sessions", target: 4, icon: "🧤",
    sports: ["football"], positions: ["Goalkeeper"],
    title: "Four keeper sessions", blurb: "Reactive and lateral work, four times. A keeper's week is short bursts, not distance." },
  { id: "w_fb_cb_bench", window: "weekly", metric: "benchmarks", target: 1, icon: "📏",
    sports: ["football"], positions: ["Centre back", "Striker"],
    title: "Test your jump", blurb: "One benchmark this week. Aerial duels are decided by a number you can measure." },
  { id: "w_fb_engine", window: "weekly", metric: "training_sessions", target: 5, icon: "🫁",
    sports: ["football"], positions: ["Central mid", "Defensive mid", "Full back"],
    title: "Build the engine", blurb: "Five sessions. Your position covers more ground than any other on the pitch." },
  { id: "w_fb_wide_speed", window: "weekly", metric: "benchmarks", target: 1, icon: "⚡",
    sports: ["football"], positions: ["Winger", "Full back"],
    title: "Time your ten metres", blurb: "One benchmark. Wide players are judged on the first two yards, so measure them." },
  // Rugby
  { id: "w_rg_front_row", window: "weekly", metric: "benchmarks", target: 1, icon: "🏉",
    sports: ["rugby"], positions: ["Prop", "Hooker", "Lock"],
    title: "Test your squat", blurb: "One benchmark. Front five strength is built in the gym and cashed in at the scrum." },
  { id: "w_rg_back_row", window: "weekly", metric: "training_sessions", target: 5, icon: "🔥",
    sports: ["rugby"], positions: ["Flanker", "No. 8", "Scrum-half"],
    title: "Five sessions", blurb: "The back row and the nine cover the most ground of anyone. Build for it." },
  { id: "w_rg_backs_speed", window: "weekly", metric: "easy_sessions", target: 2, icon: "🌱",
    sports: ["rugby"], positions: ["Wing", "Full-back", "Centre"],
    title: "Protect the fast days", blurb: "Two easy sessions. Top-end speed needs fresh legs to exist at all." },
  { id: "w_rg_fly_half", window: "weekly", metric: "videos", target: 2, icon: "🎥",
    sports: ["rugby"], positions: ["Fly-half", "Full-back"],
    title: "Film your kicking", blurb: "Two clips. A kicking routine is a technique, and technique is visible." },
  // Basketball
  { id: "w_bb_guards", window: "weekly", metric: "training_sessions", target: 4, icon: "🏀",
    sports: ["basketball"], positions: ["Point guard", "Shooting guard"],
    title: "Four on the floor", blurb: "Guards live on change of direction and repeatability. Four sessions this week." },
  { id: "w_bb_bigs", window: "weekly", metric: "benchmarks", target: 1, icon: "📏",
    sports: ["basketball"], positions: ["Centre", "Power forward"],
    title: "Test your vertical", blurb: "One benchmark. Rebounding is a jump you either have or you do not." },
  // Running
  { id: "w_rn_sprint", window: "weekly", metric: "easy_sessions", target: 2, icon: "🌱",
    sports: ["running"], positions: ["Sprinter", "800m/1500m"],
    title: "Two genuinely easy", blurb: "Sprinting is trained fresh. Two easy sessions to make the fast ones fast." },
  { id: "w_rn_distance", window: "weekly", metric: "training_sessions", target: 5, icon: "🏃",
    sports: ["running"], positions: ["5k/10k", "Half marathon", "Marathon"],
    title: "Five runs this week", blurb: "Frequency builds the aerobic base. Most of them should feel comfortable." },
  { id: "w_rn_fuel", window: "weekly", metric: "calorie_goal_days", target: 5, icon: "🍚",
    sports: ["running"], positions: ["Half marathon", "Marathon"],
    title: "Fuel the volume", blurb: "Five days on target. Under-fuelled endurance training is how people get hurt." },
  // Lifting
  { id: "w_wl_program", window: "weekly", metric: "training_sessions", target: 4, icon: "🏋️",
    sports: ["weightlifting"], positions: ["Powerlifting", "Olympic lifting"],
    title: "Four sessions as written", blurb: "Percentages only work if the sessions actually happen. Log all four." },
  { id: "w_wl_film", window: "weekly", metric: "videos", target: 2, icon: "🎥",
    sports: ["weightlifting"], positions: ["Powerlifting", "Olympic lifting"],
    title: "Film both main lifts", blurb: "Two clips. Bar speed at a given weight is the honest progress measure." },
  { id: "w_gym_food", window: "weekly", metric: "calorie_goal_days", target: 5, icon: "⚖️",
    sports: ["gym"], focus: ["aesthetics"],
    title: "Five days on target", blurb: "Body composition is decided in the kitchen far more than in the gym." },

  // Football — the positions with nothing written for them yet
  { id: "w_fb_gk_video", window: "weekly", metric: "videos", target: 1, icon: "🧤",
    sports: ["football"], positions: ["Goalkeeper"],
    title: "Film your handling", blurb: "One clip. Set position and hand shape are visible and almost never felt." },
  { id: "w_fb_cb_rest", window: "weekly", metric: "rest_days", target: 2, icon: "🛡️",
    sports: ["football"], positions: ["Centre back"],
    title: "Two days off", blurb: "Jumping and landing all game is high-impact. Give the joints the days back." },
  { id: "w_fb_dm_easy", window: "weekly", metric: "easy_sessions", target: 3, icon: "🫁",
    sports: ["football"], positions: ["Defensive mid", "Central mid"],
    title: "Three easy sessions", blurb: "You cover more ground than anyone. Most of that mileage should be easy." },
  { id: "w_fb_striker_food", window: "weekly", metric: "calorie_goal_days", target: 5, icon: "⚡",
    sports: ["football"], positions: ["Striker", "Winger"],
    title: "Five days on target", blurb: "Repeated sprints run on carbohydrate. Turn up fuelled or turn up slow." },
  // Rugby
  { id: "w_rg_front_food", window: "weekly", metric: "calorie_goal_days", target: 5, icon: "🍚",
    sports: ["rugby"], positions: ["Prop", "Hooker", "Lock"],
    title: "Five days fuelled", blurb: "Holding size takes eating on purpose, not eating a lot once." },
  { id: "w_rg_back_row_rest", window: "weekly", metric: "rest_days", target: 2, icon: "😴",
    sports: ["rugby"], positions: ["Flanker", "No. 8"],
    title: "Two days properly off", blurb: "Most collisions of anyone on the pitch. Take the days between them." },
  { id: "w_rg_half_video", window: "weekly", metric: "videos", target: 2, icon: "🎥",
    sports: ["rugby"], positions: ["Scrum-half", "Fly-half"],
    title: "Film your pass", blurb: "Two clips off both hands. A pass is a technique and technique is visible." },
  { id: "w_rg_backs_bench", window: "weekly", metric: "benchmarks", target: 1, icon: "📏",
    sports: ["rugby"], positions: ["Wing", "Full-back", "Centre"],
    title: "Time your 40", blurb: "One timed run. Out wide, the gap between you and the cover IS the job." },
  { id: "w_rg_perfect", window: "weekly", metric: "perfect_days", target: 2, icon: "🏉",
    sports: ["rugby"],
    title: "Two complete days", blurb: "Rugby takes more out of you than most. The recovery has to be deliberate." },
  // Basketball
  { id: "w_bb_guards_easy", window: "weekly", metric: "easy_sessions", target: 2, icon: "🌱",
    sports: ["basketball"], positions: ["Point guard", "Shooting guard"],
    title: "Two easy sessions", blurb: "Guards live on repeat sprints. That only survives if some days are easy." },
  { id: "w_bb_wing_video", window: "weekly", metric: "videos", target: 2, icon: "🎥",
    sports: ["basketball"], positions: ["Small forward", "Shooting guard"],
    title: "Film your shot", blurb: "Two clips from the same angle. A shooting stroke is built by comparison." },
  { id: "w_bb_bigs_rest", window: "weekly", metric: "rest_days", target: 2, icon: "😴",
    sports: ["basketball"], positions: ["Centre", "Power forward"],
    title: "Two days off", blurb: "Landing under the rim, all game, every game. The knees need the days back." },
  { id: "w_bb_food", window: "weekly", metric: "nutrition_logs", target: 5, icon: "🍽️",
    sports: ["basketball"],
    title: "Five days logged", blurb: "Basketball burns a lot and hides it. Log the week and see the real number." },
  // Running
  { id: "w_rn_sprint_bench", window: "weekly", metric: "benchmarks", target: 1, icon: "⏱️",
    sports: ["running"], positions: ["Sprinter", "800m/1500m"],
    title: "Put a time on it", blurb: "One timed effort. In your event the clock is the only opinion that counts." },
  { id: "w_rn_distance_rest", window: "weekly", metric: "rest_days", target: 1, icon: "😴",
    sports: ["running"], positions: ["5k/10k", "Half marathon", "Marathon"],
    title: "One full rest day", blurb: "One day with no running at all. Mileage is built on the days between." },
  { id: "w_rn_checkin", window: "weekly", metric: "check_ins", target: 6, icon: "📋",
    sports: ["running"],
    title: "Six check-ins", blurb: "Running injuries build quietly over weeks. The check-in is the early warning." },
  { id: "w_rn_marathon_easy", window: "weekly", metric: "easy_sessions", target: 4, icon: "🫁",
    sports: ["running"], positions: ["Half marathon", "Marathon"],
    title: "Four easy runs", blurb: "The overwhelming majority of marathon training should feel comfortable." },
  // Lifting and gym
  { id: "w_wl_rest", window: "weekly", metric: "rest_days", target: 2, icon: "😴",
    sports: ["weightlifting"],
    title: "Two days off the bar", blurb: "Strength is expressed in the gym and built between visits." },
  { id: "w_wl_general", window: "weekly", metric: "training_sessions", target: 3, icon: "🏋️",
    sports: ["weightlifting"], positions: ["General strength"],
    title: "Three sessions", blurb: "Three full-body sessions. Frequency beats a single heroic day." },
  { id: "w_wl_bench", window: "weekly", metric: "benchmarks", target: 1, icon: "📏",
    sports: ["weightlifting"], positions: ["Powerlifting", "Olympic lifting"],
    title: "Log a top single", blurb: "One recorded test. A programme with no numbers in it is a guess." },
  { id: "w_gym_hyper_train", window: "weekly", metric: "training_sessions", target: 4, icon: "💪",
    sports: ["gym"], positions: ["Hypertrophy"],
    title: "Four sessions", blurb: "Growth follows weekly volume, and weekly volume follows turning up." },
  { id: "w_gym_hyper_food", window: "weekly", metric: "calorie_goal_days", target: 5, icon: "🍚",
    sports: ["gym"], positions: ["Hypertrophy"],
    title: "Five days on target", blurb: "You cannot add tissue out of nothing. Five days inside the range." },
  { id: "w_gym_strength", window: "weekly", metric: "benchmarks", target: 1, icon: "🏋️",
    sports: ["gym"], positions: ["Strength"],
    title: "Test a main lift", blurb: "One benchmark. Strength is the easiest quality to measure, so measure it." },
  { id: "w_gym_general", window: "weekly", metric: "check_ins", target: 5, icon: "📋",
    sports: ["gym"], positions: ["General fitness"],
    title: "Five check-ins", blurb: "Turning up is the whole thing at this stage. Everything else follows it." },
  // --- Weekly, by training focus ---------------------------------------------
  //
  // Focus is what someone said they were here for, and it cuts across sport —
  // a rugby player training for aesthetics and a lifter training for aesthetics
  // want the same thing from the board.
  { id: "w_focus_perf_bench", window: "weekly", metric: "benchmarks", target: 2, icon: "📊", focus: ["performance"],
    title: "Two tests", blurb: "Performance without numbers is a feeling. Two benchmarks this week." },
  { id: "w_focus_perf_perfect", window: "weekly", metric: "perfect_days", target: 3, icon: "🏆", focus: ["performance"],
    title: "Three complete days", blurb: "The training, the food and the check-in on the same day, three times." },
  { id: "w_focus_fit_checkin", window: "weekly", metric: "check_ins", target: 5, icon: "📋", focus: ["fitness"],
    title: "Five check-ins", blurb: "General fitness is a consistency problem before it is a training problem." },
  { id: "w_focus_fit_train", window: "weekly", metric: "training_sessions", target: 3, icon: "🏃", focus: ["fitness"],
    title: "Three sessions", blurb: "Three is the number most people can hold through a busy week." },
  { id: "w_focus_aes_food", window: "weekly", metric: "nutrition_logs", target: 7, icon: "🥗", focus: ["aesthetics"],
    title: "Log every day", blurb: "Body composition is decided by what you logged, not by what you remember." },
  { id: "w_focus_aes_train", window: "weekly", metric: "training_sessions", target: 4, icon: "💪", focus: ["aesthetics"],
    title: "Four sessions", blurb: "Four this week. Volume drives it, and volume needs to be repeatable." },
  { id: "w_focus_rehab_rest", window: "weekly", metric: "rest_days", target: 3, icon: "🩹", focus: ["rehab"],
    title: "Three days off", blurb: "Three rest days logged. Tissue heals on the days you leave it alone." },
  { id: "w_focus_rehab_checkin", window: "weekly", metric: "check_ins", target: 7, icon: "🩺", focus: ["rehab"],
    title: "Check in every day", blurb: "Daily, while you are rehabbing. The pain map is what the plan reads." },
];

export const CHALLENGE_POOL: ChallengeTemplate[] = [
  ...DAILY, ...WEEKLY_GENERAL, ...WEEKLY_BY_GOAL, ...WEEKLY_BY_POSITION,
];

// --- The engine --------------------------------------------------------------

export interface ChallengeContext {
  sport?: SportId | null;
  goal?: GoalType | null;
  position?: string | string[] | null;
  focus?: TrainingFocus | null;
  window: ChallengeWindow;
  /** What they have done in the window, for evaluating progress. */
  week: WeekActivity;
  /**
   * The habit BEFORE this period started, as a rate per period.
   *
   * This is what "aim at the gap" is scored against, and the "before" is the
   * whole point — see scoreTemplate. Optional: without it the board is picked
   * on fit and rotation alone, which is what shipped while this was being
   * worked out.
   */
  habit?: WeekActivity;
  /** Stable per week/day so the set does not reshuffle on every page load. */
  seed: number;
  count?: number;
}

/** Points for a template that names this athlete's sport, goal or position. */
const FIT_SPORT = 6;
const FIT_GOAL = 6;
const FIT_POSITION = 10;
const FIT_FOCUS = 4;
/**
 * A template that names nothing is not penalised — the general pool is the
 * backbone and has to stay reachable. It simply scores lower than one written
 * for this exact athlete, which is all the ordering needs.
 */
const NEED_WEIGHT = 5;

export function scoreTemplate(t: ChallengeTemplate, ctx: ChallengeContext): number | null {
  if (t.window !== ctx.window) return null;

  // A template naming sports/goals/positions is FOR those and nobody else —
  // handing a goalkeeper's challenge to a striker is worse than a generic one.
  if (t.sports && (!ctx.sport || !t.sports.includes(ctx.sport))) return null;
  if (t.goals && (!ctx.goal || !t.goals.includes(ctx.goal))) return null;
  if (t.focus && (!ctx.focus || !t.focus.includes(ctx.focus))) return null;
  if (t.positions) {
    const mine = positionList(ctx.position);
    if (!mine.some((p) => t.positions!.includes(p))) return null;
  }

  let score = 0;
  if (t.sports) score += FIT_SPORT;
  if (t.goals) score += FIT_GOAL;
  if (t.positions) score += FIT_POSITION;
  if (t.focus) score += FIT_FOCUS;

  /**
   * AIM AT THE GAP — SCORED ON LAST MONTH, NEVER ON THIS WEEK.
   *
   * The original version of this scored how far the athlete was from each
   * target using their CURRENT activity, and docked 12 points from anything
   * already finished. Both read as obviously right, and together they made the
   * feature unwinnable: the board is rebuilt on every page load, so the moment
   * you did any of the work, that challenge scored below the things you had not
   * touched and fell off the board — taking its XP with it, because completions
   * can only be recorded for challenges still on it. Measured, on a board that
   * opened the week with "train twice":
   *
   *   0 sessions   w_train_2, w_video_1, w_bench_1
   *   1 session    w_perfect_1, w_rest_1, w_streak_14   <- the card is gone
   *
   * One session and all three cards changed. Doing the work erased the
   * challenge for the work.
   *
   * `habit` is the fix: activity over the four periods BEFORE this one, as a
   * rate per period. Nothing done during the current period can move it, so the
   * board is fixed from the moment it is dealt — and it still aims at what the
   * athlete has actually been skipping, which is the part worth keeping.
   *
   * Absent `habit`, this term is skipped entirely rather than falling back to
   * `week`. Falling back would quietly restore the exact bug in any call site
   * that forgot to pass it.
   */
  if (ctx.habit) {
    const usual = Math.max(0, Number(ctx.habit[t.metric]) || 0);
    /**
     * REFUSED, not docked. Something an athlete already does more of than this
     * asks for is not a challenge at any level of fit, and a penalty can be
     * outweighed: this was -12, and a goalkeeper-specific template carries +10
     * for position and +6 for sport, so a keeper who trains five times a week
     * was handed "train four times" — complete before it was dealt — because
     * 16 beats 12. Fit decides between real options; it cannot make a
     * non-option into one.
     *
     * Safe for board stability because `habit` is the period BEFORE this one
     * and cannot move while the board is live.
     */
    if (usual >= t.target) return null;
    const gap = (t.target - usual) / Math.max(1, t.target);
    score += gap * NEED_WEIGHT;
  }

  return score;
}

/**
 * The challenges for this athlete, this window.
 *
 * Distinct metrics, because three challenges on one metric is one challenge
 * with three names — the same rule `parseChallenges` applies to model output.
 *
 * Deterministic: same athlete, same week, same set. A challenge board that
 * reshuffles on every page load is not a board, and it is the first thing
 * people notice.
 */
export function pickChallenges(ctx: ChallengeContext): Challenge[] {
  const count = ctx.count ?? 3;
  const scored: { t: ChallengeTemplate; score: number }[] = [];
  for (const t of CHALLENGE_POOL) {
    const score = scoreTemplate(t, ctx);
    if (score !== null) scored.push({ t, score });
  }
  // Ties broken by id so the order cannot depend on array position.
  scored.sort((a, b) => b.score - a.score || a.t.id.localeCompare(b.t.id));

  /**
   * ROTATE OVER METRICS, NOT OVER TEMPLATES. This is the whole fix.
   *
   * Rotation used to run across the top ten TEMPLATES, and the board then threw
   * away everything sharing a metric with something already chosen. For an
   * athlete with no sport, goal or position every generic template scores
   * identically, so the sort collapsed to alphabetical by id — and the top ten
   * ids were three benchmark variants, four calorie variants and three
   * check-in variants. Ten templates, three distinct metrics, and a rotation
   * that could never reach past them.
   *
   * `training_sessions` ranked THIRTY-FIRST. It has 26 templates in this pool,
   * more than any other metric, and not one of them could ever be offered to a
   * general athlete. Neither could rest days, videos, streaks, perfect days or
   * food logging. An athlete could train five times a week, all year, and never
   * once be given a challenge for training — which is precisely what was
   * reported: "I've done 3 sessions this week and it's not giving me the XP."
   *
   * Deduplicating FIRST and rotating over the distinct metrics makes the unit
   * of variety the thing the athlete actually perceives as variety.
   */
  const byMetric = new Map<ChallengeMetric, { t: ChallengeTemplate; score: number }>();
  for (const s of scored) if (!byMetric.has(s.t.metric)) byMetric.set(s.t.metric, s);
  const metrics = [...byMetric.values()];

  /**
   * And rotate only inside the EQUALLY-GOOD band, which is what preserves the
   * two behaviours that were right before.
   *
   * Score already encodes both "written for this athlete" and "aimed at the
   * habit they have been skipping"; a metric they have already finished takes
   * a 12-point penalty. Spinning across the whole list for variety's sake would
   * hand back exactly those — the wrong sport's challenge, or one already done.
   * Rotating within the top score only means variety ranges over the options
   * this athlete has equal need of, and nothing else. Same rule as `pick` in
   * lib/engine.ts, and for the same reason.
   */
  const top = metrics[0]?.score ?? 0;
  const band = metrics.filter((m) => m.score >= top - 1e-9).length;
  const rotated = rotate(metrics, ctx.seed, band);

  /**
   * ONE SLOT ON THE WEEKLY BOARD IS ALWAYS TRAINING.
   *
   * Rotating fairly over ten metrics moves the window by one each week, so any
   * given metric appears three weeks in ten. That is right for filming a set or
   * testing a benchmark, and wrong for the one habit this entire app exists to
   * support: seven weeks out of ten, a training app would ask an athlete for
   * everything except training.
   *
   * Fair rotation is not the same as a good board. The weekly board leads with
   * training and rotates the other two slots, so the core habit always pays and
   * the variety happens around it.
   *
   * NOT on the daily board, which only has two slots — pinning one there would
   * leave a single rotating card, and both boards would open with the same
   * question every day.
   *
   * The TARGET still moves: the variant is chosen by seed from the ones that
   * fit this athlete equally well, so it is "train twice" one week and "train
   * four times" another rather than the same card forever.
   */
  const picked: { t: ChallengeTemplate; score: number }[] = [];
  if (ctx.window === "weekly") {
    const variants = scored.filter((s) => s.t.metric === "training_sessions");
    const bestFit = variants[0]?.score ?? 0;
    const equal = variants.filter((v) => v.score >= bestFit - 1e-9);
    if (equal.length) picked.push(equal[((ctx.seed % equal.length) + equal.length) % equal.length]);
  }
  for (const m of rotated) {
    if (picked.length >= count) break;
    if (picked.some((p) => p.t.metric === m.t.metric)) continue;
    picked.push(m);
  }
  return picked.slice(0, count).map((m) => toChallenge(m.t));
}

/** Rotate the first `depth` entries, leaving the weaker tail in place. */
function rotate<T>(list: T[], by: number, depth: number): T[] {
  const d = Math.max(0, Math.min(list.length, depth));
  if (d < 2) return list;
  const k = ((by % d) + d) % d;
  return [...list.slice(k, d), ...list.slice(0, k), ...list.slice(d)];
}

/**
 * Both boards for one athlete, on one day.
 *
 * A board is a list AND the activity it is measured against, built together.
 * Picking against one window and scoring against another is what made daily
 * cards arrive pre-ticked — "take the rest day" read 4/1 and complete on a
 * Tuesday morning — and it is a one-word mistake, because `week` and `today`
 * are the same type. Pairing them here means the mistake has to be made in one
 * place rather than at every call site.
 *
 * Shared because the page needs the lists to award XP and the component needs
 * them to render. Two copies of the seed arithmetic would eventually disagree,
 * and the symptom would be XP paid for a challenge the athlete never saw.
 */
export interface Board {
  window: ChallengeWindow;
  /** Identifies which day or week this board belongs to, for recording XP once. */
  period: string;
  activity: WeekActivity;
  list: Challenge[];
}

export interface BoardRequest {
  who: Omit<ChallengeContext, "window" | "week" | "seed" | "count" | "habit">;
  /** Habit before this period — see scoreTemplate. Per week and per day. */
  habitWeek?: WeekActivity;
  habitDay?: WeekActivity;
  /** The last 7 days. */
  week: WeekActivity;
  /** The same counters for today alone. */
  today: WeekActivity;
  /** Today's local date, which seeds both boards. */
  todayIso: string;
}

/**
 * Named rather than positional, deliberately: `week` and `today` are the same
 * type, so `boardsFor(ctx, today, week, iso)` would typecheck perfectly and put
 * every daily card back to arriving pre-ticked. Naming them makes the
 * transposition something you have to write on purpose.
 */
export function boardsFor({ who, week, today, todayIso, habitWeek, habitDay }: BoardRequest): { daily: Board; weekly: Board } {
  const ctx = who;
  /**
   * Seeds, not randomness. The daily set turns over at midnight and the weekly
   * set every seven days — a board that reshuffles on every page load is not a
   * board, and it is the first thing anyone notices.
   */
  const dayNumber = Math.floor(Date.parse(`${todayIso}T00:00:00Z`) / 86_400_000);
  const weekNumber = Math.floor(dayNumber / 7);
  const build = (
    window: ChallengeWindow, activity: WeekActivity, seed: number, count: number,
    habit: WeekActivity | undefined,
  ): Board => ({
    window,
    period: window === "daily" ? todayIso : `w${weekNumber}`,
    activity,
    // `activity` is what progress is MEASURED against; `habit` is what the set
    // is CHOSEN from. Keeping them separate is the whole fix — see
    // scoreTemplate. Passing `activity` as both is the bug.
    list: pickChallenges({ ...ctx, window, week: activity, habit, seed, count }),
  });
  return {
    daily: build("daily", today, dayNumber, 2, habitDay),
    weekly: build("weekly", week, weekNumber, 3, habitWeek),
  };
}

export function toChallenge(t: ChallengeTemplate): Challenge {
  // Clamped and priced by lib/challenges, not here. A pool that sets its own
  // targets escapes "nobody is handed train 7 days this week", and a pool that
  // prices its own XP is a second copy of the table that drifts from the first.
  const target = clampTarget(t.metric, t.target);
  return {
    id: t.id,
    title: t.title,
    blurb: t.blurb,
    icon: t.icon,
    metric: t.metric,
    target,
    xp: xpFor(t.metric, target),
  };
}
