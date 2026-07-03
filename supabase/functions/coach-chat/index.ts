// =============================================================================
// Supabase Edge Function: coach-chat (Deno)
//
// Authenticated. Answers the athlete's questions as their coach, grounded in
// their goal, pain, readiness and current program. Returns { answer }.
// The /coach chat calls this and falls back to the local engine on any error.
//
// Secrets: ANTHROPIC_API_KEY
// Deploy:  supabase functions deploy coach-chat
// =============================================================================

import Anthropic from "npm:@anthropic-ai/sdk@0.69.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const SYSTEM =
  "You are the athlete's personal football strength & conditioning coach and physio. " +
  "Answer their question directly and practically in 2–4 sentences, grounded in the context " +
  "provided (their goal, sore areas, today's readiness, and the drills in their current plan). " +
  "Explain the 'why' behind drills, respect any pain by favouring lower-impact options, and never " +
  "give medical diagnosis — advise seeing a physio for sharp or persistent pain. Be encouraging and concrete.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "AI not configured" }, 503);

  const { question, context } = await req.json().catch(() => ({}));
  if (!question) return json({ error: "question required" }, 400);

  const ctx = [
    `Goal: ${context?.goal ?? "general"}`,
    `Sore areas: ${(context?.soreAreas ?? []).join(", ") || "none"}`,
    `Today's readiness: ${context?.readinessStatus ?? "unknown"}`,
    `Current plan drills: ${(context?.programDrills ?? []).join(", ") || "none"}`,
  ].join("\n");

  const client = new Anthropic({ apiKey: key });
  try {
    const resp = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 600,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      messages: [{ role: "user", content: `Context:\n${ctx}\n\nQuestion: ${question}` }],
    });
    if (resp.stop_reason === "refusal") return json({ error: "refused" }, 422);
    const answer = resp.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("").trim();
    return json({ answer }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
