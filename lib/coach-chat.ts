// Deterministic coach-chat fallback — answers common questions offline (and on
// GitHub Pages) when the Claude `coach-chat` Edge Function isn't deployed. The
// headline use case, "why this drill?", is fully handled here.

import { drillInfo, GOALS, type GoalType } from "./coach";

export interface ChatContext {
  goal: GoalType | null;
  soreAreas: string[];
  readinessStatus: "Green" | "Yellow" | "Red" | null;
  programDrills: string[];
  bodyweightKg?: number | null;
  heightCm?: number | null;
  calorieTarget?: number | null;
  proteinTarget?: number | null;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
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
      : "No soreness flagged today, so we can train freely. Log any pain in today's log and I'll adapt the plan automatically.";
  }

  if (/ready|readiness|recover|rest|tired|fatigue/.test(q)) {
    if (ctx.readinessStatus === "Red") return "Your readiness is Red today — take active recovery (mobility, light spin, stretching) instead of the scheduled session and prioritise sleep.";
    if (ctx.readinessStatus === "Yellow") return "Readiness is moderate — train, but keep it crisp and cut the last set if you fade. Don't chase PRs today.";
    return "Readiness looks good — a green light for a higher-quality session. Warm up well and go after it.";
  }

  /**
   * CUTTING AND BULKING ARE NUTRITION, and leaving them out is what produced
   * the reported failure: an athlete answered a rehab reply with "Im cutting
   * though" and got a list of things the coach can do. The words people
   * actually use for eating are not "nutrition" — they are cutting, bulking,
   * deficit, lean, dropping weight.
   */
  if (/eat|nutrition|protein|carb|fuel|diet|weight|cut|cutting|bulk|deficit|surplus|maintenance|lean|calorie|kcal|macro|lose|losing|gain|gaining/.test(q)) {
    const targets = [
      ctx.calorieTarget ? `${ctx.calorieTarget} kcal` : null,
      ctx.proteinTarget ? `${ctx.proteinTarget}g protein` : null,
    ].filter(Boolean).join(" and ");
    const measurements = [
      ctx.bodyweightKg ? `${ctx.bodyweightKg}kg` : null,
      ctx.heightCm ? `${ctx.heightCm}cm` : null,
    ].filter(Boolean).join(" at ");
    if (targets) {
      return `Your current daily targets are ${targets}${measurements ? `, using your recorded ${measurements}` : ""}. Hit protein across the day and put more of your carbs around training; log what you eat so I can compare the advice with what you actually manage.`;
    }
    return `I${measurements ? ` can see your recorded ${measurements}, but I` : ""} don't have a complete calorie and protein target yet. Add the missing details in Profile or Nutrition, then I can answer with your numbers instead of a generic estimate.`;
  }

  if (/season|taper|peak|match/.test(q)) {
    return "In-season I taper volume ~30% and weight recovery so you're fresh for matches; out-of-season I build volume and strength. Toggle the season on your program any time.";
  }

  // Any other drill mentioned in the question (e.g. about one not in today's plan).
  const drill = findAnyDrill(q);
  if (drill && explainIntent) return explainDrill(drill, ctx);

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * SAY IT COULD NOT ANSWER. DO NOT RECITE THE MENU.
   *
   * This used to open "Good question." and then list what the coach can do,
   * which is the worst possible reply to something it did not understand: it
   * claims to have understood, answers a different question, and reads as the
   * coach being stupid rather than as a failure. It also ended with "connect
   * the AI coach for deeper answers" — meaningless to an athlete, and untrue,
   * because the AI *is* connected and had just failed on that turn.
   *
   * Reported from a real conversation: a good AI answer about a shoulder,
   * then "Im cutting though", then this paragraph. Nothing in it was wrong
   * except that it was not an answer.
   *
   * What it says now: this reply came from the offline coach, here is why,
   * here is what the offline coach can do, try again. Three true sentences
   * beat one confident irrelevant one.
   * ═══════════════════════════════════════════════════════════════════════
   */
  const goalLabel = ctx.goal ? GOALS.find((g) => g.id === ctx.goal)?.label.toLowerCase() : "your goal";
  return `I couldn't reach the full coach for that one, so this is the offline version — and it only handles a few things: why a drill is in your plan, a sore area, your readiness, or your calorie and protein targets. Ask again in a moment and it should get through. Your block is currently built around ${goalLabel}.`;
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
