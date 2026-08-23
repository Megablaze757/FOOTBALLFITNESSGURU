"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { useTier } from "@/lib/use-tier";
import { can } from "@/lib/subscription";
import { Portal } from "@/components/Portal";
import { CoachChat } from "@/components/CoachChat";
import { loadCoachContext, coachContextKey } from "@/lib/coach-context";

/**
 * The coach, on every screen, without leaving the one you are on.
 *
 * WHY A BUBBLE AND NOT A TAB. Questions arrive while you are looking at
 * something: mid-session, staring at a drill you do not recognise; on the
 * nutrition page, wondering whether the target is right; on Progress, wanting
 * to know what a number means. A tab makes you leave the thing you are asking
 * about, type the question from memory, and then navigate back to check the
 * answer against it. /ask is still there for a long conversation you arrive
 * with; this is for the question you already have.
 *
 * IT COSTS NOTHING UNTIL IT IS OPENED. The briefing behind the coach is twelve
 * queries — the block, the check-in, a month of training, benchmarks, food, the
 * rehab plan — and running that on every page load to power a button nobody
 * pressed would be indefensible. `useAsync` only runs when `open` has been true
 * at least once, and it shares /ask's cache key, so opening the page afterwards
 * costs nothing at all.
 */
export function CoachBubble() {
  const user = useCurrentUser();
  const { tier } = useTier();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  /**
   * Sticky, so closing the sheet does not throw the briefing away.
   *
   * Without it, `useAsync` would unmount with the panel and the next open would
   * pay for twelve queries again — which is exactly the cost this whole
   * arrangement exists to avoid.
   */
  const [everOpened, setEverOpened] = useState(false);

  const { data, loading } = useAsync(
    async () => (everOpened ? loadCoachContext(user.id) : null),
    [user.id, everOpened],
    everOpened ? coachContextKey(user.id) : undefined,
  );

  // Escape closes it, like every other sheet in the app.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // The page behind a full-screen sheet must not scroll under it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  // Navigating closes it. A sheet that survived a route change would sit over a
  // page it has nothing to do with.
  useEffect(() => setOpen(false), [pathname]);

  /**
   * NOT ON THE PAGE THAT IS ALREADY THE CHAT. A floating button that opens a
   * copy of what is behind it is a bug that looks like a feature.
   *
   * And not for a tier without the coach: a button that exists only to say
   * "upgrade" every time it is pressed is nagware, and /ask already explains
   * what the feature is to somebody who goes looking for it.
   */
  if (pathname?.startsWith("/ask") || !can(tier, "ai_chat")) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => { setEverOpened(true); setOpen(true); }}
        aria-label="Ask your coach"
        aria-expanded={open}
        /**
         * ABOVE THE TAB BAR, WHICH MOVES. The nav hides on scroll down and
         * comes back on scroll up, so anchoring to it would make this jump
         * around. It sits at a fixed height clear of the bar's tallest state
         * plus the home indicator, and stays put.
         */
        className="fixed bottom-24 right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-pitch-400 to-pitch-600 text-ink-900 shadow-glow transition hover:scale-105 active:scale-95 lg:bottom-8 lg:right-8"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <ChatIcon />
      </button>

      {open && (
        <Portal>
          {/* ABOVE THE TAB BAR, WHICH IS z-[60].
              This was z-50, so the nav rendered ON TOP of the sheet: it covered
              the composer completely and sliced the top off the suggestion
              chips, which is why the panel looked like it had failed to load
              rather than like it was behind something. A full-screen sheet has
              to outrank the furniture it covers. */}
          <div className="fixed inset-0 z-[70] flex flex-col justify-end bg-ink-900/70 backdrop-blur-sm sm:items-end sm:justify-end sm:p-6">
            {/* Tapping the dimmed page closes it — the gesture everybody tries
                first, and the one a sheet without it swallows. */}
            <button
              type="button"
              aria-label="Close the coach"
              onClick={() => setOpen(false)}
              className="absolute inset-0 cursor-default"
            />

            <div className="animate-fade-up relative flex h-[85dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/[0.08] bg-ink-900 shadow-2xl sm:h-[calc(100dvh-6rem)] sm:max-w-md sm:rounded-3xl">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                <span className="text-sm font-bold text-slate-100">Ask your coach</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="tap-target -mr-2 text-xl leading-none text-slate-500 hover:text-slate-200"
                >
                  ✕
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                {loading || !data ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-pitch-400" />
                    {/* Said out loud, because the wait is the coach READING —
                        it is loading your block, your check-in and your lifts,
                        and a bare spinner makes that look like slowness. */}
                    <p className="text-xs text-slate-500">Reading your block, today&apos;s check-in and your lifts…</p>
                  </div>
                ) : (
                  <CoachChat
                    context={data.context}
                    briefing={data.briefing}
                    suggestions={data.suggestions.length ? data.suggestions : undefined}
                    storageKey={`coach-chat:${user.id}`}
                    userId={user.id}
                    fill
                  />
                )}
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}

function ChatIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  );
}
