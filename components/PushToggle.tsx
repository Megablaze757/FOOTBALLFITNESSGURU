"use client";

import { useEffect, useState } from "react";
import { currentBrowser, installGuide } from "@/lib/browser";
import { createClient } from "@/lib/supabase/client";

/**
 * Turn the morning check-in reminder on or off.
 *
 * A visible button rather than an automatic prompt on load: browsers penalise
 * permission requests that arrive without a user gesture, and a denied
 * permission is close to permanent — the browser stops asking and the user has
 * to go into site settings to undo it. Asking once, on purpose, is worth far
 * more than asking early.
 */
const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** VAPID keys travel as base64url; PushManager wants raw bytes. */
function urlBase64ToBytes(base64: string): ArrayBuffer {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

// "unconfigured" is deliberately distinct from "unsupported". They render the
// same (nothing — there's no point offering a reminder we can't send), but they
// mean opposite things: one is the device, the other is us. Conflating them
// meant a missing VAPID key looked like a browser limitation, so the whole
// reminders feature could be silently absent for every user on every device
// with nothing anywhere to say why.
type State = "loading" | "unsupported" | "unconfigured" | "needs-install" | "blocked" | "off" | "on";

export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!VAPID) {
        // Loud in the console on purpose: this is a deploy-config mistake, and
        // the only other symptom is a feature that quietly doesn't exist.
        console.warn("[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set — reminders are disabled for everyone.");
        return setState("unconfigured");
      }
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        // iOS only exposes PushManager to an installed PWA, so this is the
        // common case on iPhone — and "not supported" would be wrong and
        // discouraging when the fix is one Share-sheet tap away.
        //
        // `currentBrowser` rather than a local regex: the old test was
        // /iPad|iPhone|iPod/, and iPadOS 13+ reports itself as a Macintosh, so
        // every modern iPad was told reminders were unsupported when they were
        // one install away. See lib/browser.ts.
        return setState(currentBrowser().platform === "ios" ? "needs-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBytes(VAPID),
      });

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      // Upsert on endpoint: re-subscribing on the same device returns the same
      // endpoint, and we want one row per device, not one per attempt.
      const { error: dbErr } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh ?? null,
          auth: json.keys?.auth ?? null,
          failed_at: null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );
      if (dbErr) throw new Error(dbErr.message);
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Delete our row FIRST. Unsubscribing first and then failing would
        // leave a row we'd push to forever with no device on the other end.
        await createClient().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unsupported" || state === "unconfigured") return null;

  return (
    <div className="mb-4 rounded-2xl bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-200">Morning log reminder</div>
          <p className="mt-0.5 text-xs text-slate-500">
            {state === "needs-install"
              ? "Add PocketAthlete to your home screen first — iPhone only allows notifications for installed apps."
              : state === "blocked"
              ? "Notifications are blocked for this site. Turn them back on in your browser's settings for pocketathlete.com."
              : "One nudge a day, only if you haven't checked in yet. No streak spam."}
          </p>
          {/* AND HOW, because "add it to your home screen first" is a
              requirement, not an instruction. It named the thing to do and
              left the athlete to find out where the button is — on a platform
              where the steps differ between Safari and Chrome, which is the
              whole reason lib/browser.ts exists. */}
          {state === "needs-install" && (
            <ol className="mt-2 space-y-1">
              {installGuide(currentBrowser()).steps.map((step, i) => (
                <li key={step} className="flex gap-2 text-[11px] leading-relaxed text-slate-400">
                  <span className="shrink-0 font-bold text-accent-400">{i + 1}</span>{step}
                </li>
              ))}
            </ol>
          )}
        </div>
        {(state === "on" || state === "off") && (
          <button
            onClick={state === "on" ? disable : enable}
            disabled={busy}
            className={`min-h-[44px] shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
              state === "on"
                ? "border border-white/10 text-slate-300 hover:bg-white/[0.06]"
                : "bg-pitch-500 text-on-accent"
            }`}
          >
            {busy ? "…" : state === "on" ? "Turn off" : "Turn on"}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-readiness-red">{error}</p>}
    </div>
  );
}
