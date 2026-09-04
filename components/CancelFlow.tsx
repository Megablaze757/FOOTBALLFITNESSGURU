"use client";

import { useState } from "react";
import { invokeAI } from "@/lib/api";
import { recordChanged } from "@/lib/data-events";

/**
 * Cancelling, with one honest attempt to offer something better first.
 *
 * THE RULE THIS IS BUILT AROUND: cancelling must never be harder than
 * subscribing. UK DMCCA 2024 and the FTC's click-to-cancel rule both say so,
 * and it's also just decent. So:
 *
 *   - the offer is ONE screen, never a sequence
 *   - "Cancel anyway" is a real, visible button on that screen — not hidden
 *     behind a link, not a second confirmation, not an email you must send
 *   - the reason is optional; skipping it still cancels
 *
 * The offer itself is a PAUSE, because for a seasonal sports app that's the
 * true answer most of the time. Someone cancelling in November is usually
 * injured or out of season — they don't want to leave, they want to come back
 * in February. Cancelling makes them re-decide from scratch; pausing makes
 * returning the default.
 */

interface Reason {
  id: string;
  label: string;
  /** Pause length to suggest, in days. 0 = a pause isn't the right answer. */
  pauseDays: number;
  offer: string;
}

const REASONS: Reason[] = [
  {
    id: "injured",
    label: "I'm injured",
    pauseDays: 60,
    offer: "Pause for 2 months instead — your history, PRs and streak all stay exactly where they are, and we'll pick you back up when you're fit.",
  },
  {
    id: "season_ended",
    label: "My season's finished",
    pauseDays: 90,
    offer: "Pause until pre-season — 3 months, no charge, and everything's waiting when you come back.",
  },
  {
    id: "not_using",
    label: "I'm not using it enough",
    pauseDays: 30,
    offer: "Pause for a month rather than losing it. If you still aren't using it when it comes back, cancel then and you've lost nothing.",
  },
  {
    id: "too_expensive",
    label: "It's too expensive right now",
    pauseDays: 60,
    offer: "Pause for 2 months — you won't be charged a penny while it's paused, and you keep everything you've built.",
  },
  {
    id: "missing_feature",
    label: "It's missing something I need",
    pauseDays: 0,
    offer: "Tell us what's missing below. We read every one of these, and it genuinely decides what gets built next.",
  },
  {
    id: "technical",
    label: "Something isn't working",
    pauseDays: 0,
    offer: "If it's broken we'd rather fix it than lose you. Tell us what happened and we'll come back to you.",
  },
  { id: "other", label: "Something else", pauseDays: 0, offer: "" },
];

type Phase = "picking" | "offered" | "done-cancel" | "done-pause";

export function CancelFlow({ onClose, onChanged }: { onClose: () => void; onChanged?: () => void }) {
  const [reason, setReason] = useState<Reason | null>(null);
  const [detail, setDetail] = useState("");
  const [phase, setPhase] = useState<Phase>("picking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await invokeAI<{ endsAt?: string; stillBilling?: number }>("cancel-subscription", {
        reason: reason?.id, detail: detail.trim() || undefined,
      });
      /**
       * ═══════════════════════════════════════════════════════════════════
       * NEVER SAY "CANCELLED" WHILE SOMETHING IS STILL BILLING THEM.
       *
       * Reported as "I cancelled and I am still being charged". A customer can
       * end up with two live subscriptions in Stripe, our table holds one row
       * per user, and the second one billed every month with the app showing a
       * cheerful confirmation over the top of it.
       *
       * The endpoint now cancels every live one and reports any it could not.
       * A partial result has to read as a problem, because the athlete's next
       * move — believing it and closing the app — is the expensive one.
       * ═══════════════════════════════════════════════════════════════════
       */
      if (res?.stillBilling) {
        setError(
          `${res.stillBilling} other subscription${res.stillBilling === 1 ? "" : "s"} on your account could not `
          + "be cancelled, so you may still be charged. Nothing else has changed — please contact support "
          + "and we will stop it by hand.",
        );
        setBusy(false);
        return;
      }
      setEndsAt(res?.endsAt ?? null);
      setPhase("done-cancel");
      recordChanged("everything");
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  async function pause(days: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await invokeAI<{ resumesAt?: string }>("pause-subscription", {
        days, reason: reason?.id, detail: detail.trim() || undefined,
      });
      setEndsAt(res?.resumesAt ?? null);
      setPhase("done-pause");
      recordChanged("everything");
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  if (phase === "done-cancel") {
    return (
      <Panel title="Cancelled">
        <p className="text-sm text-slate-300">
          You&apos;re cancelled{endsAt ? `, and you keep full access until ${fmt(endsAt)}` : ""}. Nothing
          is deleted — your history, PRs and programs stay exactly as they are.
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Changed your mind? You can restart any time before then and pick up where you left off.
        </p>
        <button onClick={onClose} className="btn-primary mt-4">Done</button>
      </Panel>
    );
  }

  if (phase === "done-pause") {
    return (
      <Panel title="Paused">
        <p className="text-sm text-slate-300">
          Billing is paused{endsAt ? ` until ${fmt(endsAt)}` : ""}. You won&apos;t be charged while
          it&apos;s paused, and Pro switches itself back on automatically — nothing for you to remember.
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Back early? Resume any time from this page and you&apos;ll be charged from that day, not before.
        </p>
        <button onClick={onClose} className="btn-primary mt-4">Done</button>
      </Panel>
    );
  }

  return (
    <Panel title={phase === "picking" ? "Before you go" : "One suggestion"}>
      {phase === "picking" && (
        <>
          <p className="text-sm text-slate-400">
            What&apos;s prompting this? It&apos;s optional — you can skip straight to cancelling.
          </p>
          <div className="mt-3 space-y-2">
            {REASONS.map((r) => (
              <button
                key={r.id}
                onClick={() => { setReason(r); setPhase("offered"); }}
                className="min-h-[2.75rem] w-full rounded-xl bg-white/[0.04] px-4 py-2.5 text-left text-sm text-slate-200 transition hover:bg-white/[0.08]"
              >
                {r.label}
              </button>
            ))}
          </div>
          {/* Always available, from the very first screen. Nobody has to explain
              themselves to us in order to stop paying us. */}
          <button
            onClick={cancel}
            disabled={busy}
            className="tap-target mt-4 w-full text-sm font-semibold text-slate-400 underline underline-offset-4 hover:text-readiness-red"
          >
            {busy ? "Cancelling…" : "Skip and cancel my subscription"}
          </button>
        </>
      )}

      {phase === "offered" && reason && (
        <>
          <p className="text-sm font-semibold text-slate-100">{reason.label}</p>
          {reason.offer && <p className="mt-2 text-sm text-slate-300">{reason.offer}</p>}

          {(reason.id === "missing_feature" || reason.id === "technical" || reason.id === "other") && (
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={3}
              placeholder={reason.id === "technical" ? "What went wrong?" : "What would have made this worth keeping?"}
              className="field mt-3 resize-none"
            />
          )}

          <div className="mt-4 space-y-2">
            {reason.pauseDays > 0 && (
              <button onClick={() => pause(reason.pauseDays)} disabled={busy} className="btn-primary">
                {busy ? "…" : `Pause for ${monthsLabel(reason.pauseDays)} instead`}
              </button>
            )}
            {/* Equal weight, same screen, no extra step. */}
            <button
              onClick={cancel}
              disabled={busy}
              className="min-h-[2.75rem] w-full rounded-xl bg-white/[0.04] text-sm font-semibold text-slate-300 transition hover:bg-readiness-red/15 hover:text-readiness-red"
            >
              {busy ? "Cancelling…" : "Cancel anyway"}
            </button>
            <button onClick={onClose} className="min-h-[44px] w-full py-1 text-xs text-slate-500 hover:text-slate-300">
              Never mind, keep my plan
            </button>
          </div>
        </>
      )}

      {error && <p className="mt-3 text-sm text-readiness-red">{error}</p>}
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card mt-3 p-5">
      <h3 className="mb-2 text-base font-extrabold text-slate-100">{title}</h3>
      {children}
    </div>
  );
}

function monthsLabel(days: number): string {
  if (days >= 60) return `${Math.round(days / 30)} months`;
  return `${days} days`;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}
