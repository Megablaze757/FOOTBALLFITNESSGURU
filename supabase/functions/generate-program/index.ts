// =============================================================================
// Supabase Edge Function: generate-program (Deno)
//
// Authenticated. Builds a personalised, periodised 4-week block. Returns
// { plan, model }. The /coach page calls this and falls back to the on-device
// engine on any error.
//
// WHAT THIS USED TO BE, AND WHY IT WAS A PROBLEM.
//
// It read four fields — goal, pain_map, notes, in_season — and threw the rest
// away. The client has always sent five more: SPORT, POSITION, FOCUS,
// DAYS_PER_WEEK and SPLIT. So a rugby prop asking for four upper/lower days got
// a prompt hard-coded to "elite football strength & conditioning coach" and
// "3 sessions per week", and a bodybuilder who picked push/pull/legs got field
// drills. Every one of those choices is a control the athlete deliberately set,
// and this route silently discarded all of them.
//
// That is the whole of "programs aren't as good as they were" as far as code in
// this repository is concerned. It is now a faithful port of `generateProgram`
// in cloudflare/src/index.ts — same inputs, same brief, same one-week-then-
// expand structure — so falling back to it costs latency and nothing else.
//
// ONE WEEK, NOT FOUR. Weeks 2-4 are Base -> Build -> Peak -> Deload applied
// arithmetically to week 1, and `expandWeeks` never gets that wrong, whereas
// cheap models routinely make week 3 easier than week 1. It is also four times
// less to generate, and output tokens are what latency is actually made of.
//
// NOTE ON SLOTS: like the Worker, the plan returned here carries no warm-up or
// cool-down. That is deliberate and always has been — the model supplies the
// training, and the on-device engine supplies the scaffolding at the boundary
// (see lib/program-repair.ts). A plan from here is expected to be repaired.
//
// Secrets: GROQ_API_KEY and/or OPENROUTER_API_KEY (see ../_shared/llm.ts)
// Deploy:  supabase functions deploy generate-program
// =============================================================================

import { complete, chain, ChainError } from "../_shared/llm.ts";
import { requireTier, CORS, json } from "../_shared/gate.ts";

/**
 * The named splits the athlete can pick on the tile.
 *
 * They chose one. Building a different one is not a lesser version of the
 * feature, it is ignoring the only structural instruction they gave.
 */
const SPLIT_BRIEF: Record<string, string> = {
  ppl: "push/pull/legs — chest+shoulders+triceps, back+biceps, then legs",
  upper_lower: "upper/lower — alternating whole-upper and whole-lower days",
  arnold: "an Arnold-style split — chest & back together, shoulders & arms together, then legs",
  bro: "a body-part split — one muscle group per session (chest day, back day, shoulders, arms, legs)",
  full_body: "full body every session, rotating which lifts lead",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!chain("text").length) return json({ error: "AI not configured" }, 503);

  // Training programs are a paid feature, and this route had NO check of any
  // kind — not tier, not even identity, relying on Supabase's default JWT
  // verification alone. With the Worker out of the request path it is the only
  // thing standing between a free account and the whole product.
  const gate = await requireTier(req, "silver", "Training programs");
  if (gate.denied) return gate.denied;

  const body = await req.json().catch(() => ({})) as {
    goal?: string; pain_map?: Record<string, number>; notes?: string; in_season?: boolean;
    sport?: string; position?: string | string[]; focus?: string;
    days_per_week?: number; split?: string;
  };
  const { goal, pain_map, notes, in_season, sport, position, focus, days_per_week, split } = body;
  if (!goal) return json({ error: "goal required" }, 400);

  // An athlete can play more than one position — a full back who covers at
  // centre back needs both briefed, or half their technical work is for
  // somebody else.
  const positions = (Array.isArray(position) ? position : [position])
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim());

  const days = Math.max(2, Math.min(5, Number(days_per_week) || 3));
  const sore = Object.entries(pain_map ?? {})
    .filter(([, v]) => Number(v) >= 4)
    .map(([k, v]) => `${k.replace(/_/g, " ")} (${v}/10)`)
    .join(", ") || "none";
  const season = in_season
    ? "in-season (taper ~30%, recovery-weighted)"
    : "out-of-season (build, higher volume)";

  const system =
    "You are an elite strength & conditioning coach & physio working across sports (football, rugby, weightlifting, gym, basketball, running). " +
    "Choose exercises appropriate to the athlete's SPORT, POSITION and FOCUS (e.g. a weightlifter gets barbell squat/bench/deadlift; a rugby prop gets contact & scrum power; 'general fitness' is conditioning-led). " +
    // The on-device engine builds bodybuilders a real split (lib/hypertrophy.ts).
    // Without the same instruction here the two paths disagreed, and the AI one
    // returned field-sport circuits to people who had asked for muscle.
    "BODYBUILDING RULE — if the focus is 'muscle & aesthetics' or the sport is 'gym', build a HYPERTROPHY program, not a conditioning circuit: " +
    "use a proper split sized to the training days (2 days full-body A/B, 3 days push/pull/legs, 4 days upper/lower, 5 days push/pull/legs/upper/lower) and NAME each session that way ('Push — chest, shoulders & triceps'). " +
    "Open each session with 1-2 compound lifts, then 3-4 ISOLATION exercises (curls, lateral raises, leg extensions, leg curls, flyes, pushdowns, calf raises) — isolation work is most of a bodybuilding program and must be present. " +
    "Keep every rep count between 6 and 15 for the whole block: compounds 6-10, isolation 10-15. Progress by adding reps within the range, then a set, then load — do NOT drop into 3-5 rep powerlifting territory. " +
    "Never prescribe sprints, ladder drills, cone work, burpees or sport skills to this athlete. " +
    "For this athlete the 6-15 rep rule OVERRIDES the rep-drop guidance below — peak week means more sets and more load, not fewer reps. " +
    "Output ONLY valid minified JSON matching this TypeScript type: " +
    "{goal:string;summary:string;constraints:string[];sessions:{day:number;title:string;focus:string;drills:{name:string;sets:number;reps:number;cue:string;prog:\"load\"|\"reps\"|\"hold\"}[]}[]}. " +
    `Give exactly ONE week of ${days} sessions — the first week of a 4-week block. Do NOT output weeks 2-4; they are derived automatically. ` +
    "Set sets/reps as the STARTING week: moderate, technique-first, a couple of reps in reserve. " +
    "prog says how that drill gets harder over the block: \"load\" for anything you add weight to, \"reps\" for bodyweight and conditioning, \"hold\" for skill work that progresses by difficulty. " +
    "cue is one short coaching sentence. " +
    "Work around sore areas with lower-impact drills. " +
    // Without this the model treated the athlete's note as flavour text: someone
    // who wrote "I don't train legs" still got squats in week 1.
    "ATHLETE NOTES ARE BINDING. If the notes rule out a body part, movement or " +
    "equipment ('I don't train legs', 'no running', 'no barbell'), that thing must " +
    "not appear ANYWHERE in the program — not once, not lightened, not as a warm-up. " +
    "Fill the freed volume with work they do want, and state the exclusion in " +
    "`constraints` so they can see you followed it. " +
    "No prose outside the JSON.";

  const user =
    `Sport: ${sport || "football"}\n` +
    (positions.length > 1
      ? `Position/event: ${positions[0]} (main), also plays ${positions.slice(1).join(" and ")} — cover the demands of all of them.\n`
      : `Position/event: ${positions[0] || "unspecified"}\n`) +
    `Training focus: ${focus || "performance"}\n` +
    `Goal: ${goal}\nSeason: ${season}\nSore: ${sore}\nNotes: ${notes || "none"}` +
    (split && SPLIT_BRIEF[split] ? `\nREQUIRED SPLIT: ${SPLIT_BRIEF[split]}. Name each session accordingly.` : "");

  try {
    const { text, model, provider } = await complete({
      system, user,
      maxTokens: 1600,
      // A rung that returns prose, or a week with an empty session in it, is a
      // failed rung — try the next model rather than handing the athlete a
      // program with a blank day in it.
      validate: (t) => parseSeedWeek(t) !== null,
    });
    const seed = parseSeedWeek(text);
    if (!seed) return json({ error: "could not build a program" }, 422); // validate passed, so unreachable
    return json({ plan: expandWeeks(seed, goal), model: `${provider}/${model}` }, 200);
  } catch (e) {
    if (e instanceof ChainError) return json({ error: e.message }, 502);
    return json({ error: String(e) }, 500);
  }
});

// --- Turning one week into a block -------------------------------------------
//
// Ported verbatim from cloudflare/src/index.ts. If one changes, change both:
// an athlete whose backend falls over mid-block must not see the periodisation
// shape change under them.

interface SeedDrill { name: string; sets: number; reps: number; cue?: string; prog?: string }
interface SeedSession { day: number; title: string; focus?: string; drills: SeedDrill[] }
interface SeedPlan { goal?: string; summary?: string; constraints?: string[]; sessions: SeedSession[] }

/** The model's single week, validated. Returns null so the chain tries another. */
function parseSeedWeek(raw: string): SeedPlan | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const p = JSON.parse(match[0]) as SeedPlan;
    if (!Array.isArray(p.sessions) || p.sessions.length === 0) return null;
    for (const s of p.sessions) {
      if (!Array.isArray(s?.drills) || s.drills.length === 0) return null;
      if (!s.drills.every((d) => typeof d?.name === "string" && d.name.trim())) return null;
    }
    return p;
  } catch {
    return null;
  }
}

// How each week differs, per progression type. Mirrors lib/coach.ts so the AI
// and on-device paths shape a block the same way.
const SHAPE: Record<string, { sets: number; reps: number }[]> = {
  load: [{ sets: 0, reps: 1 }, { sets: 1, reps: 0.85 }, { sets: 1, reps: 0.7 }, { sets: -1, reps: 1 }],
  reps: [{ sets: 0, reps: 1 }, { sets: 0, reps: 1.2 }, { sets: 1, reps: 1.35 }, { sets: -1, reps: 0.9 }],
  hold: [{ sets: 0, reps: 1 }, { sets: 0, reps: 1 }, { sets: 1, reps: 1 }, { sets: -1, reps: 1 }],
};
const THEMES = ["Base", "Build", "Peak", "Deload"];
const INTENSITY = ["Moderate", "Higher", "Peak", "Deload"];
const FOCUS_NOTE = [
  "Build a base and nail technique.",
  "Turn the dial up — more than week 1.",
  "Peak week: the hardest sessions of the block.",
  "Recover and absorb the work.",
];
const PROGRESSION: Record<string, string[]> = {
  load: ["Pick a weight you could do 2-3 more reps with.", "Add a little weight and a set; reps drop, that's the point.", "Heaviest week — stop one rep short of failure.", "Deload: same lifts, ~60% of the weight."],
  reps: ["Establish clean reps you fully control.", "Same movement, more reps than last week.", "Peak volume: an extra set and the highest reps.", "Deload: cut the volume right back."],
  hold: ["Prioritise clean technique over speed.", "Same drill, faster or in tighter space.", "Add a decision, a defender, or your weaker side.", "Deload: light, sharp reps to stay grooved."],
};

/** Expand the model's first week into the full Base → Build → Peak → Deload block. */
export function expandWeeks(seed: SeedPlan, goal: string) {
  const weeks = THEMES.map((theme, wi) => ({
    week: wi + 1,
    theme,
    intensity: INTENSITY[wi],
    focusNote: FOCUS_NOTE[wi],
    sessions: seed.sessions.map((s, di) => ({
      day: Number(s.day) || di + 1,
      title: s.title || `Day ${di + 1}`,
      focus: s.focus || goal,
      drills: s.drills.map((d) => {
        const prog = SHAPE[d.prog ?? ""] ? (d.prog as string) : "reps";
        const shape = SHAPE[prog][wi];
        const baseSets = Math.max(1, Math.round(Number(d.sets) || 3));
        const baseReps = Math.max(1, Math.round(Number(d.reps) || 10));
        return {
          name: d.name,
          // Week 4 may drop to a single set; every other week keeps at least two.
          sets: Math.max(wi === 3 ? 1 : 2, baseSets + shape.sets),
          reps: Math.max(3, Math.round(baseReps * shape.reps)),
          cue: d.cue ?? "",
          reason: `${theme} week — ${FOCUS_NOTE[wi].toLowerCase()}`,
          progression: PROGRESSION[prog][wi],
        };
      }),
    })),
  }));

  return {
    goal: seed.goal || goal,
    summary: seed.summary || "A 4-week block progressing Base → Build → Peak → Deload.",
    constraints: Array.isArray(seed.constraints) ? seed.constraints : [],
    weeks,
  };
}

export { parseSeedWeek };
