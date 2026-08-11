"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A button that asks before doing something you can't undo.
 *
 * WHY THIS EXISTS. There was not a single confirmation anywhere in the app —
 * `confirm(` appeared zero times. "Not right? Rebuild it" archived a block
 * mid-way through, "Delete this block" hard-deleted it, and regenerating a meal
 * plan rerolled all 28 meals and orphaned the shopping list you might be
 * standing in a supermarket holding. Every one of those was one stray tap on a
 * phone, with no way back.
 *
 * INLINE, NOT `window.confirm`. The native dialog is suppressed outright in
 * some installed-PWA contexts, which would silently turn a guarded action back
 * into a one-tap one — the exact failure this is meant to prevent. It also
 * can't be styled, reads as a browser error to most people, and cannot say what
 * is actually about to be lost. So the button becomes the question in place.
 *
 * The destructive choice is never the default focus: focus moves to Cancel, so
 * a double-tap on the original button lands on the safe option rather than
 * confirming what it just asked about.
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
  /** Red confirm for irreversible loss; plain for merely disruptive. */
  destructive?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (asking) cancelRef.current?.focus();
  }, [asking]);

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} disabled={disabled} className={className}>
        {children}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2" role="alertdialog" aria-live="polite">
      <span className="text-xs text-slate-300">{question}</span>
      <button
        ref={cancelRef}
        type="button"
        onClick={() => setAsking(false)}
        className="tap-target rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-white/[0.06]"
      >
        Cancel
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            // Guard the unmount case: confirming often removes the thing this
            // button lives on, and setting state afterwards would warn.
            if (cancelRef.current) { setBusy(false); setAsking(false); }
          }
        }}
        className={`tap-target rounded-full px-3 py-1 text-xs font-bold disabled:opacity-50 ${
          destructive
            ? "bg-readiness-red/20 text-readiness-red hover:bg-readiness-red/30"
            : "bg-pitch-400/20 text-pitch-400 hover:bg-pitch-400/30"
        }`}
      >
        {busy ? "Working…" : confirmLabel}
      </button>
    </span>
  );
}
