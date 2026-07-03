// Deterministic coach-chat fallback — answers common questions offline (and on
// GitHub Pages) when the Claude `coach-chat` Edge Function isn't deployed. The
// headline use case, "why this drill?", is fully handled here.

import { drillInfo, GOALS, type GoalType } from "./coach";

export interface ChatContext {
  goal: GoalType | null;
  soreAreas: string[];
  readinessStatus: "Green" | "Yellow" | "Red" | null;
  programDrills: string[];
}

export function localCoachAnswer(question: string, ctx: ChatContext): string {
  const q = question.toLowerCase();
  const explainIntent = /why|how|explain|point|benefit|tell me about|what is|what does/.test(q);

  // A drill explicitly named from the current plan — explain it directly.
  const namedDrill = ctx.programDrills.map((d) => drillInfo(d)).find((d) => d && q.includes(d.name.toLowerCase()));
  if (namedDrill && explainIntent) return explainDrill(namedDrill, ctx);

  if (/pain|sore|hurt|knee|ankle|hamstring|injur/.test(q)) {
    return ctx.soreAreas.length
      ? `You've flagged soreness in your ${ctx.soreAreas.join(" / ")}, so I'm swapping high-impact work for lower-load options and keeping intensity in check. If pain is sharp (7+/10) or lingers, see a physio before loading it.`
      : "No soreness flagged today, so we can train freely. Log any pain in your daily check-in and I'll adapt the plan automatically.";
  }

  if (/ready|readiness|recover|rest|tired|fatigue/.test(q)) {
    if (ctx.readinessStatus === "Red") return "Your readiness is Red today — take active recovery (mobility, light spin, stretching) instead of the scheduled session and prioritise sleep.";
    if (ctx.readinessStatus === "Yellow") return "Readiness is moderate — train, but keep it crisp and cut the last set if you fade. Don't chase PRs today.";
    return "Readiness looks good — a green light for a higher-quality session. Warm up well and go after it.";
  }

  if (/eat|nutrition|protein|carb|fuel|diet|weight/.test(q)) {
    return "Head to Nutrition for your goal-based targets — protein scaled to your bodyweight and carbs weighted to fuel your sessions. Hit protein every day and time carbs around training.";
  }

  if (/season|taper|peak|match/.test(q)) {
    return "In-season I taper volume ~30% and weight recovery so you're fresh for matches; out-of-season I build volume and strength. Toggle the season on your program any time.";
  }

  // Any other drill mentioned in the question (e.g. about one not in today's plan).
  const drill = findAnyDrill(q);
  if (drill && explainIntent) return explainDrill(drill, ctx);

  const goalLabel = ctx.goal ? GOALS.find((g) => g.id === ctx.goal)?.label.toLowerCase() : "your goal";
  return `Good question. Right now we're building ${goalLabel} with a pain-aware, readiness-adjusted plan. Ask me "why is <drill> in my plan?", about a sore area, your readiness, or nutrition — and connect the AI coach for deeper, free-form answers.`;
}

function explainDrill(drill: NonNullable<ReturnType<typeof drillInfo>>, ctx: ChatContext): string {
  const sore = ctx.soreAreas.length ? ` It keeps load off your sore ${ctx.soreAreas.join(" / ")}, which is why it's in today's plan.` : "";
  const tgt = drill.targets.map((t) => GOALS.find((g) => g.id === t)?.label.toLowerCase() ?? t).join(" & ");
  return `${drill.name} builds ${tgt}. Coaching cue: ${drill.cue}.${sore}`;
}

function findAnyDrill(q: string) {
  // Resolve a multi-word drill phrase (>=2 words) mentioned anywhere — avoids
  // single-token false positives.
  const words = q.replace(/[?.,!]/g, "").split(/\s+/).filter((w) => w.length >= 3);
  for (let n = 4; n >= 2; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const info = drillInfo(words.slice(i, i + n).join(" "));
      if (info) return info;
    }
  }
  return null;
}
