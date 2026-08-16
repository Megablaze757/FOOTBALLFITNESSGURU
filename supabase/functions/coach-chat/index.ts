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
import { requireTier, CORS, json } from "../_shared/gate.ts";

const SYSTEM =
  "You are this athlete's personal strength & conditioning coach and physio. " +
  "You are given a full briefing on them: who they are, their current training block and next " +
  "session, today's readiness, any injuries WITH the rehab protocol and its stages, their " +
  "nutrition targets and intake, and their ranked lifts. " +
  "Answer the question directly and practically, grounded in that briefing and quoting the " +
  "athlete's own numbers back to them where it helps. " +
  "USE THE BRIEFING BEFORE ANYTHING ELSE: if it contains the answer — a rehab stage, a calorie " +
  "target, a lift, a prescribed effort — cite it rather than speaking generally. " +
  "If the briefing says something is not recorded, SAY SO and ask for it, rather than assuming a " +
  "value; a confident answer built on a number you were not given is worse than no answer. " +
  "Explain the 'why' behind drills, respect pain by favouring lower-impact options, and never give " +
  "a medical diagnosis — advise seeing a physio for sharp or persistent pain. " +
  /**
   * THE NAMED-EXERCISE RULE.
   *
   * An athlete was told their preacher curls were going well. There was no
   * preacher curl in their programme and never had been — the briefing carried
   * one session's drills, so a question about the block as a whole had almost
   * nothing behind it and the gap got filled with plausible gym exercises.
   *
   * An invented specific is worse than a general answer: it reads as evidence
   * that the coach has actually looked at their training, so it is believed,
   * and it makes every true specific alongside it suspect once noticed. The
   * briefing now carries the block's full exercise list as a CLOSED list, and
   * this says what to do with it.
   */
  "NEVER name an exercise as being in their programme, or comment on how it is going, unless that " +
  "exact exercise appears in the briefing's list of prescribed or logged exercises. The list is " +
  "complete — if something is not on it, it is not in their programme. To suggest something new, " +
  "say plainly that it is a suggestion and not currently prescribed. " +
  "Be concrete and encouraging. Four to eight sentences unless asked for more.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (!chain("text").length) return json({ error: "AI not configured" }, 503);

  // "Ask the coach" is a paid feature — the Worker gated it and this did not.
  const gate = await requireTier(req, "silver", "Ask the coach");
  if (gate.denied) return gate.denied;

  const { question, context, briefing } = await req.json().catch(() => ({}));
  if (!question) return json({ error: "question required" }, 400);

  /**
   * THE BRIEFING, or the four facts the old client sent.
   *
   * `briefing` is built by lib/coach-briefing.ts on the page, because every
   * number in it — the calorie target, the rehab stage, the strength rank — is
   * already derived there and a second implementation here would be a second
   * answer. See the note at the top of that file.
   *
   * The fallback is not dead code: this function is deployed independently of
   * the site, and a browser holding a cached bundle will keep posting the old
   * shape for as long as that bundle lives. Answering those requests from four
   * facts is worse than answering from a briefing, and much better than a 400.
   */
  const ctx = typeof briefing === "string" && briefing.trim().length > 0
    ? briefing
    : [
        `Goal: ${context?.goal ?? "general"}`,
        `Sore areas: ${(context?.soreAreas ?? []).join(", ") || "none"}`,
        `Today's readiness: ${context?.readinessStatus ?? "unknown"}`,
        `Current plan drills: ${(context?.programDrills ?? []).join(", ") || "none"}`,
      ].join("\n");

  try {
    const { text } = await complete({
      system: SYSTEM,
      user: `Here is everything known about this athlete.\n\n${ctx}\n\n---\n\nTheir question: ${question}`,
      maxTokens: 900,
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
