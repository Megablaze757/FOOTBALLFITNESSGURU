// =============================================================================
// Supabase Edge Function: generate-program (Deno)
//
// Authenticated. Uses Claude to generate a personalised, periodised program for
// the athlete's goal, working around their current pain. Returns { plan }.
// The /coach page calls this and falls back to the local engine on any error.
//
// Secrets: GROQ_API_KEY and/or OPENROUTER_API_KEY (see ../_shared/llm.ts)
// Deploy:  supabase functions deploy generate-program
// =============================================================================

import { complete, chain, ChainError } from "../_shared/llm.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const DRILL_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    sets: { type: "integer" },
    reps: { type: "integer" },
    cue: { type: "string" },
    reason: { type: "string" },
  },
  required: ["name", "sets", "reps", "cue", "reason"],
  additionalProperties: false,
};

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    goal: { type: "string" },
    summary: { type: "string" },
    constraints: { type: "array", items: { type: "string" } },
    weeks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          week: { type: "integer" },
          theme: { type: "string" },
          intensity: { type: "string" },
          sessions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                day: { type: "integer" },
                title: { type: "string" },
                focus: { type: "string" },
                drills: { type: "array", items: DRILL_SCHEMA },
              },
              required: ["day", "title", "focus", "drills"],
              additionalProperties: false,
            },
          },
        },
        required: ["week", "theme", "intensity", "sessions"],
        additionalProperties: false,
      },
    },
  },
  required: ["goal", "summary", "constraints", "weeks"],
  additionalProperties: false,
};

const SYSTEM =
  "You are an elite football strength & conditioning coach and physiotherapist. " +
  "Design a 4-week periodised program (Base → Build → Peak → Deload) for the athlete's goal, " +
  "with 3 sessions per week. CRITICAL: work around any sore body areas by substituting " +
  "lower-impact drills (e.g. swap depth jumps/heavy sprints for ladder agility, bike intervals, " +
  "or isometric holds when the knee is sore) while still progressing the goal. For every drill give " +
  "a short cue and a one-line reason. Be specific and realistic. " +
  // The schema moved from an API parameter into the prompt when this came off
  // Anthropic. `output_config.format.json_schema` is Anthropic's; Groq and
  // OpenRouter both speak the OpenAI shape and have no equivalent that every
  // model on the chain honours. Stating the schema and VALIDATING THE REPLY is
  // the portable version, and it is what the Cloudflare Worker already does —
  // a rung that returns prose or half an object is a failed rung, not a
  // failed program.
  "Output ONLY valid minified JSON matching exactly this schema, with no prose, " +
  "no markdown fence and no commentary:\n" + JSON.stringify(PLAN_SCHEMA);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (!chain("text").length) return json({ error: "AI not configured" }, 503);

  const { goal, pain_map, notes, in_season } = await req.json().catch(() => ({}));
  if (!goal) return json({ error: "goal required" }, 400);
  const season = in_season ? "in-season (taper volume ~30%, prioritise recovery and short sharp work)" : "out-of-season (build phase, higher volume and heavier strength)";

  const sore = Object.entries(pain_map ?? {})
    .filter(([, v]) => Number(v) >= 4)
    .map(([k, v]) => `${k.replace("_", " ")} (${v}/10)`)
    .join(", ") || "none";

  try {
    const { text } = await complete({
      system: SYSTEM,
      user: `Goal: ${goal}\nSeason: ${season}\nCurrent sore areas: ${sore}\nAthlete notes: ${notes || "none"}\n\nBuild the 4-week program.`,
      maxTokens: 4096,
      validate: (t) => parsePlan(t) !== null,
    });
    const plan = parsePlan(text);
    if (!plan) return json({ error: "could not build a program" }, 422); // validate passed, so unreachable
    return json({ plan }, 200);
  } catch (e) {
    if (e instanceof ChainError) return json({ error: e.message }, 502);
    return json({ error: String(e) }, 500);
  }
});

/**
 * A plan, or null if the reply isn't one.
 *
 * Checks the SHAPE, not just that it parsed. A model that returns
 * `{"weeks":[]}` has produced valid JSON and no program, and handing that to
 * the client puts an empty four-week block in front of an athlete. The client
 * repairs missing warm-ups and cool-downs (lib/program-repair.ts) but it cannot
 * invent sessions that were never there.
 */
function parsePlan(raw: string): Record<string, unknown> | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const plan = JSON.parse(match[0]) as { weeks?: unknown };
    if (!Array.isArray(plan.weeks) || plan.weeks.length === 0) return null;
    const usable = plan.weeks.every((w) => {
      const week = w as { sessions?: unknown };
      return Array.isArray(week.sessions) && week.sessions.length > 0;
    });
    return usable ? plan as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
