"use client";

import { useEffect, useRef, useState } from "react";
import { Portal } from "@/components/Portal";

/**
 * A button that asks before doing something you can't undo.
 *
 * WHY THIS EXISTS. There was not a single confirmation anywhere in the app —
 * `confirm(` appeared zero times. "Not right? Rebuild it" archived the block you
 * were part-way through, "New plan" cleared a saved rehab plan one line under a
 * sentence promising it was kept, "Regenerate week" rerolled all 28 meals and
 * orphaned the shopping list, and Remove hard-deleted a coach's hand-typed
 * exercise. Each was one stray tap on a phone with no way back.
 *
 * WHY IT IS A DIALOG AND NOT INLINE. My first version swapped the button for
 * the question and two more buttons, in place. On a 375px iPhone that does not
 * fit: on /coach it lives in a `shrink-0` right-hand column a few characters
 * wide, so the question wrapped to one word a line and the buttons ran off the
 * card. A confirmation whose own layout is broken is worse than none, because
 * it is the moment you most need to read what you are agreeing to.
 *
 * Rendered through Portal so its width comes from the viewport rather than
 * whatever narrow box the trigger happens to sit in. That also means one
 * layout for every caller instead of four that each need checking.
 *
 * WHY NOT `window.confirm`. It is suppressed outright in some installed-PWA
 * contexts, which would silently turn a guarded action back into a one-tap one
 * — precisely the failure this exists to prevent. It also cannot say what is
 * about to be lost, which is the only part that matters.
 *
 * Focus lands on Cancel, never the destructive choice, so a double-tap on the
 * trigger cannot confirm the question it just raised. Escape and the backdrop
 * both cancel.
 */
export function ConfirmButton({
  onConfirm,
  children,
  question,
  confirmLabel = "Yes, do it",
  className = "",
  disabled = false,
  destructive = true,
}: {
  onConfirm: () => void | Promise<void>;
  children: React.ReactNode;
  /** What is about to happen, in the athlete's terms. Say what is lost. */
  question: string;
  confirmLabel?: string;
  className?: string;
  disabled?: boolean;
  /** Red confirm for irreversible loss; accent for merely disruptive. */
  destructive?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    if (!asking) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAsking(false); };
    document.addEventListener("keydown", onKey);
    // The page behind a modal must not scroll under your thumb.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [asking]);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      // Confirming often unmounts the thing this button lives on.
      if (alive.current) { setBusy(false); setAsking(false); }
    }
  }

  return (
    <>
      <button type="button" onClick={() => setAsking(true)} disabled={disabled} className={className}>
        {children}
      </button>

      {asking && (
        <Portal>
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
            onClick={() => setAsking(false)}
          >
            {/* Bottom sheet on a phone, centred card from `sm` up — a dialog
                pinned to the middle of a small screen sits above the thumb. */}
            <div
              role="alertdialog"
              aria-modal="true"
              aria-label={question}
              onClick={(e) => e.stopPropagation()}
              className="card w-full max-w-sm p-5 shadow-glow"
            >
              <p className="text-sm font-semibold text-slate-100">{question}</p>
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row">
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={() => setAsking(false)}
                  className="tap-target flex-1 rounded-2xl border border-white/15 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-white/[0.06]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={confirm}
                  className={`tap-target flex-1 rounded-2xl px-4 py-3 text-sm font-bold disabled:opacity-50 ${
                    destructive
                      ? "bg-readiness-red/20 text-readiness-red hover:bg-readiness-red/30"
                      : "bg-pitch-400/20 text-pitch-400 hover:bg-pitch-400/30"
                  }`}
                >
                  {busy ? "Working…" : confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
