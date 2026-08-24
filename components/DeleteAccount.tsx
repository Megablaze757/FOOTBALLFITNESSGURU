"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { invokeAI } from "@/lib/api";
import { Portal } from "@/components/Portal";

/**
 * Delete your account, for real.
 *
 * The privacy policy promises this, so it has to work rather than deactivate.
 * Everything goes: daily logs, programs, training history, videos, body photos.
 *
 * Two deliberate pieces of friction, because there is no undo and no backup we
 * can restore from:
 *   - it's behind a confirmation dialog, not a bare button on the settings page
 *   - you have to type your own email address, which is the difference between
 *     meaning it and mis-tapping while scrolling
 *
 * The dialog also states plainly what will be destroyed. "Are you sure?" is not
 * informed consent when the answer is someone's whole training history.
 */
// Deletion talks to Stripe and to storage before it returns, which is well past
// the default budget for an AI call.
const DELETE_TIMEOUT_MS = 60_000;

export function DeleteAccount({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase();

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    try {
      await invokeAI("delete-account", { confirm: typed.trim() }, DELETE_TIMEOUT_MS);
      // The account is gone, so the session token now points at nothing. Clear
      // it locally before navigating, or the app spends the next load retrying
      // requests as a user who no longer exists.
      await createClient().auth.signOut();
      router.replace("/?deleted=1");
    } catch (e) {
      // Every failure path on the server deletes nothing, so it's safe to say so.
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mt-8 rounded-2xl border border-readiness-red/20 bg-readiness-red/[0.03] p-4">
        <div className="text-sm font-semibold text-slate-200">Delete account</div>
        <p className="mt-1 text-xs text-slate-500">
          Permanently deletes your account and everything in it — daily logs, programs,
          training history, videos and photos. This cannot be undone.
        </p>
        <button
          onClick={() => { setOpen(true); setTyped(""); setError(null); }}
          className="tap-target mt-3 rounded-2xl border border-readiness-red/40 px-4 text-sm font-semibold text-readiness-red transition hover:bg-readiness-red/10"
        >
          Delete my account
        </button>
      </div>

      {open && (
        <Portal>
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-ink-900 p-6">
              <h2 className="text-xl font-extrabold tracking-tight">Delete your account?</h2>
              <p className="mt-2 text-sm text-slate-400">
                This is permanent. We will delete:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-slate-400">
                <li>• every daily log and readiness score</li>
                <li>• your programs and training history</li>
                <li>• uploaded videos and body photos</li>
                <li>• your place on every leaderboard</li>
              </ul>
              <p className="mt-3 text-sm text-slate-400">
                Any active subscription is cancelled at the same time.
              </p>

              <label className="mt-5 block">
                <span className="field-label">
                  Type <b className="text-slate-300">{email}</b> to confirm
                </span>
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="field"
                  placeholder={email}
                />
              </label>

              {error && <p className="mt-3 text-sm text-readiness-red">{error}</p>}

              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="min-h-[44px] flex-1 rounded-2xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06]"
                >
                  Keep my account
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={!matches || busy}
                  className="min-h-[44px] flex-1 rounded-2xl bg-readiness-red px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-40"
                >
                  {busy ? "Deleting…" : "Delete forever"}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
