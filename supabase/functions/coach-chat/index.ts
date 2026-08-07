// =============================================================================
// Supabase Edge Function: coach-chat (Deno)
//
// Authenticated. Answers the athlete's questions as their coach, grounded in
// their goal, pain, readiness and current program. Returns { answer }.
// The /coach chat calls this and falls back to the local engine on any error.
//
// Secrets: GROQ_API_KEY and/or OPENROUTER_API_KEY (see ../_shared/llm.ts)
// Deploy:  supabase functions deploy coach-chat
// =============================================================================

import { complete, chain, ChainError } from "../_shared/llm.ts";

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

  if (!chain("text").length) return json({ error: "AI not configured" }, 503);

  const { question, context } = await req.json().catch(() => ({}));
  if (!question) return json({ error: "question required" }, 400);

  const ctx = [
    `Goal: ${context?.goal ?? "general"}`,
    `Sore areas: ${(context?.soreAreas ?? []).join(", ") || "none"}`,
    `Today's readiness: ${context?.readinessStatus ?? "unknown"}`,
    `Current plan drills: ${(context?.programDrills ?? []).join(", ") || "none"}`,
  ].join("\n");

  try {
    const { text } = await complete({
      system: SYSTEM,
      user: `Context:\n${ctx}\n\nQuestion: ${question}`,
      maxTokens: 600,
      // A one-word reply is a failed rung, not an answer. The /coach chat falls
      // back to the local engine on any error, so a blank-ish response here is
      // strictly worse than admitting the model didn't answer.
      validate: (t) => t.trim().length > 20,
    });
    return json({ answer: text.trim() }, 200);
  } catch (e) {
    if (e instanceof ChainError) return json({ error: e.message }, 502);
    return json({ error: String(e) }, 500);
  }
});

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
