// =============================================================================
// Supabase Edge Function: generate-program (Deno)
//
// Authenticated. Uses Claude to generate a personalised, periodised program for
// the athlete's goal, working around their current pain. Returns { plan }.
// The /coach page calls this and falls back to the local engine on any error.
//
// Secrets: ANTHROPIC_API_KEY
// Deploy:  supabase functions deploy generate-program
// =============================================================================

import Anthropic from "npm:@anthropic-ai/sdk@0.69.0";

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
  "a short cue and a one-line reason. Be specific and realistic.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "AI not configured" }, 503);

  const { goal, pain_map, notes, in_season } = await req.json().catch(() => ({}));
  if (!goal) return json({ error: "goal required" }, 400);
  const season = in_season ? "in-season (taper volume ~30%, prioritise recovery and short sharp work)" : "out-of-season (build phase, higher volume and heavier strength)";

  const sore = Object.entries(pain_map ?? {})
    .filter(([, v]) => Number(v) >= 4)
    .map(([k, v]) => `${k.replace("_", " ")} (${v}/10)`)
    .join(", ") || "none";

  const client = new Anthropic({ apiKey: key });
  try {
    const resp = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: PLAN_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `Goal: ${goal}\nSeason: ${season}\nCurrent sore areas: ${sore}\nAthlete notes: ${notes || "none"}\n\nBuild the 4-week program.`,
        },
      ],
    });
    if (resp.stop_reason === "refusal") return json({ error: "refused" }, 422);
    const text = resp.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    const plan = JSON.parse(text);
    return json({ plan }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
