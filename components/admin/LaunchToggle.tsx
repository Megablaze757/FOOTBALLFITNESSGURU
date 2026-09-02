"use client";

import { setLaunched, useLaunched } from "@/lib/launch";
import { useState } from "react";

export function LaunchToggle() {
  const launched = useLaunched();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Optimistic local view so the button reflects the click immediately.
  const [local, setLocal] = useState<boolean | null>(null);
  const isLaunched = local ?? launched;

  async function toggle() {
    setBusy(true); setErr(null);
    const next = !isLaunched;
    const error = await setLaunched(next);
    setBusy(false);
    if (error) { setErr(error); return; }
    setLocal(next);
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="field-label !mb-0">🚀 Launch status</h2>
          <p className="mt-1 text-sm text-slate-300">
            {isLaunched
              ? "Live — the beta badge is hidden across the app."
              : "In beta — a “Beta” badge shows next to the logo for everyone."}
          </p>
        </div>
        <span className={`chip ${isLaunched ? "text-readiness-green" : "text-accent-400"}`}>
          {isLaunched ? "Launched" : "Beta"}
        </span>
      </div>
      <button
        onClick={toggle}
        disabled={busy}
        className={`mt-4 ${isLaunched ? "btn-ghost" : "btn-primary"}`}
      >
        {busy ? "Saving…" : isLaunched ? "Put back into beta" : "Mark app as fully launched"}
      </button>
      {err && <p className="mt-2 text-sm text-readiness-red">{err}</p>}
    </div>
  );
}

/**
 * Tell the waitlist the app is live.
 *
 * THIS IS THE ONE CONTROL IN THE PANEL THAT CANNOT BE UNDONE. Everything else
 * here flips a flag or edits a row; this puts mail in other people's inboxes,
 * and there is no recalling it. So the design is deliberately slower than the
 * rest of the admin page:
 *
 *   - the count is shown BEFORE anything is pressed, because a bulk send whose
 *     size you learn afterwards is one you cannot sanity-check;
 *   - "Preview" sends nothing and reports exactly who would get it;
 *   - the send itself takes two deliberate presses, not one;
 *   - it goes in batches and tells you what is left, because the function has a
 *     wall clock and the mail provider has a rate limit.
 *
 * Repeat presses are safe by construction: each row is stamped as it sends and
 * the query only picks unstamped ones. Nobody gets it twice.
 */
/** What the SQL sender returns: one row of (emailed, remaining, note). */
interface SendResult { emailed?: number; remaining?: number; note?: string }

/**
 * How many go out per press. pg_net queues each request rather than waiting on
 * it, so this is not bounded by a wall clock the way the Edge Function was, but
 * a smaller number is still a smaller mistake and the button says what is left.
 */
const BATCH = 50;
