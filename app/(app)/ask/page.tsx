"use client";

import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { useTier } from "@/lib/use-tier";
import { can } from "@/lib/subscription";
import { FeatureLock } from "@/components/FeatureLock";
import { CoachChat } from "@/components/CoachChat";
import { loadCoachContext, coachContextKey } from "@/lib/coach-context";
import { daysAgoLocal, todayLocal } from "@/lib/day";

/**
 * Ask the coach — its own page, with the whole athlete behind it.
 *
 * IT WAS THE THIRD TAB OF /coach, and it was given four facts: the goal, the
 * NAMES of sore areas, a readiness colour, and the names of the drills in the
 * next session. So an athlete could ask "how's my rehab plan going?" and be
 * answered by something that had never seen their rehab plan — reported, and
 * fair. A coach that answers confidently without the evidence is worse than no
 * coach, because you cannot tell which answers were grounded.
 *
 * A tab is also the wrong shape for this. The chat is the one part of the app
 * you arrive at with a question already formed, rather than something you
 * browse into from a training block — the same argument that moved Injury out
 * of the third tab of Guides.
 *
 * WHY THE PAGE ASSEMBLES THE BRIEFING RATHER THAN THE EDGE FUNCTION. The
 * function has a service key and could fetch all of this itself, saving a round
 * trip — and would then hold a second implementation of every derived number in
 * the app: a second calorie target, a second definition of "sore", a second
 * strength ranking. This codebase has been bitten by exactly that before (see
 * the note atop lib/nutrition.ts about two calorie calculations). Sending what
 * the app already computed guarantees the coach is discussing the same athlete
 * the rest of the screens are showing.
 */
export default function AskCoachPage() {
  const user = useCurrentUser();
  const { tier, loading: tierLoading } = useTier();
  const today = todayLocal();

  /**
   * The same loader the floating bubble uses, behind the same cache key.
   *
   * It was 216 lines inline here, which was fine while this page was the only
   * way to reach the coach. It is not any more — see lib/coach-context.ts.
   */
  const { data, loading } = useAsync(() => loadCoachContext(user.id), [user.id], coachContextKey(user.id));

  /**
   * KEPT SHORT SO THE CONVERSATION GETS THE SCREEN.
   *
   * The page used to open with a heading, a line of prose, a chat window 288px
   * tall and a paragraph underneath explaining what the coach can see — so on a
   * phone the actual conversation was the smallest thing on it. The subtitle
   * moved into the chat's own header, where it says the same thing beside the
   * face saying it.
   */
  const header = (
    <header className="mb-3">
      <h1 className="text-2xl font-extrabold tracking-tight">Ask coach</h1>
    </header>
  );

  if (loading || tierLoading) {
    return <div className="mx-auto max-w-3xl">{header}<div className="card h-96 animate-pulse" /></div>;
  }

  if (!can(tier, "ai_chat")) {
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        <FeatureLock
          capability="ai_chat"
          title="Ask your coach anything"
          blurb="A coach that has already read your training block, your rehab plan and its stages, today's readiness, your calorie targets and every lift you have ranked — then answers in your own numbers."
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-up mx-auto max-w-3xl">
      {header}
      <CoachChat
        context={data!.context}
        briefing={data!.briefing}
        suggestions={data!.suggestions.length ? data!.suggestions : undefined}
        storageKey={`coach-chat:${user.id}`}
        userId={user.id}
      />
      {/* WHAT IT CAN SEE, said plainly — but folded away.
          An athlete who does not know the coach has their rehab plan will not
          ask about it, and one who assumes it can see things it cannot will be
          misled by a confident answer. So it stays, one tap from the chat,
          rather than taking four lines off the conversation on every visit. */}
      <details className="mt-3 text-[11px] leading-relaxed text-slate-500">
        <summary className="tap-target inline-flex cursor-pointer list-none items-center font-semibold hover:text-slate-300">
          What can it see?
        </summary>
        <p className="mt-1.5">
          Your current block and next session, today&apos;s readiness and check-in, anything
          you have marked as sore along with the rehab protocol for it, your calorie and protein
          targets against what you have logged, and every lift it has ranked. It cannot see anything
          you have not recorded — if it says a number is missing, that is why.
        </p>
      </details>
    </div>
  );
}
