"use client";

import { useEffect, useState } from "react";
import { recordChanged } from "@/lib/data-events";
import { createClient } from "@/lib/supabase/client";
import { isNative, readHealth, haptic } from "@/lib/native";
import { todayLocal } from "@/lib/day";

/**
 * Pull last night out of Apple Health, on the check-in, in one tap.
 *
 * WHY THIS IS THE POINT OF THE iOS BUILD. On the web, getting HRV and sleep in
 * means an Apple Shortcut sending to a per-user ingest endpoint — now three
 * steps rather than five (the endpoint takes a plain GET, so there is no header
 * and no JSON body to assemble), but still a setup, and one that silently stops
 * working if they change phones. Natively it is one permission prompt and then
 * it is simply true every morning.
 *
 * Readiness is the number this whole app is built around, and its two best
 * inputs are the two an athlete is worst at self-reporting. "How did you sleep?"
 * answered from a watch beats the same question answered from memory at 6am.
 *
 * RENDERS NOTHING ON THE WEB. `isNative()` is false in every browser including
 * the installed PWA, so this costs the web build one function call — the plugin
 * behind it is never even resolved.
 */
export function AppleHealthPill({ onSleep }: {
  /** Sleep hours mapped onto the 1-10 quality scale the check-in uses. */
  onSleep: (quality: number) => void;
}) {
  const [show, setShow] = useState(false);
  const [state, setState] = useState<"idle" | "reading" | "done" | "none">("idle");
  const [summary, setSummary] = useState<string | null>(null);

  // Native-only, and checked after mount because `Capacitor` is injected by the
  // shell rather than present at module evaluation.
  useEffect(() => { setShow(isNative()); }, []);
  if (!show) return null;

  async function pull() {
    setState("reading");
    const rows = await readHealth(2);
    const today = todayLocal();
    // Last night's sleep is recorded against the day it ENDED, but a nap or a
    // late sync can leave today empty — so fall back to the most recent row
    // rather than reporting nothing when there is something.
    const row = rows.find((r) => r.date === today) ?? rows[rows.length - 1];

    if (!row || (row.sleepHours == null && row.hrv == null && row.restingHr == null)) {
      setState("none");
      return;
    }

    if (row.sleepHours != null) {
      // 8h+ is a 10, 4h is a 3, linear between — the same shape as the tap
      // scale's own labels, so importing and tapping agree.
      const q = Math.max(1, Math.min(10, Math.round((row.sleepHours / 8) * 10)));
      onSleep(q);
    }

    // Store the raw numbers too. The check-in only consumes sleep, but HRV and
    // resting HR drive the trends on Progress and the readiness baseline, and
    // they are exactly what the web version has to beg for via a Shortcut.
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("biometrics").upsert({
          user_id: user.id,
          metric_date: row.date,
          hrv_ms: row.hrv ?? null,
          resting_hr: row.restingHr ?? null,
          sleep_hours: row.sleepHours ?? null,
          // 'apple_health', NOT 'healthkit'. The biometrics_source_check
          // constraint enumerates the allowed values and healthkit is not one
          // of them — the upsert would have been rejected, and because this
          // write is deliberately best-effort the failure would have been
          // completely silent. Verified against supabase/migrations.
          source: "apple_health",
        }, { onConflict: "user_id,metric_date" });
      }
      // Sleep and HRV are inputs to readiness and to the biometric trends on
      // Progress. Both were reading yesterday's row until a remount.
      recordChanged("training", "profile");
    } catch { /* the check-in still works; the trend just misses a day */ }

    setSummary([
      row.sleepHours != null ? `${row.sleepHours}h sleep` : null,
      row.hrv != null ? `HRV ${row.hrv}ms` : null,
      row.restingHr != null ? `RHR ${row.restingHr}` : null,
    ].filter(Boolean).join(" · "));
    setState("done");
    void haptic("success");
  }

  if (state === "done") {
    return (
      <p className="text-xs text-readiness-green">✓ From Apple Health — {summary}</p>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={pull}
        disabled={state === "reading"}
        className="tap-target self-start rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs font-semibold text-slate-400 transition hover:border-pitch-400/40 hover:text-accent-400 disabled:opacity-50"
      >
        {state === "reading" ? "Reading Health…" : "❤️ Fill from Apple Health"}
      </button>
      {state === "none" && (
        // Says which of the two it is. "Nothing found" alone leaves the athlete
        // unable to tell a permission they denied from a watch they didn't wear.
        <p className="mt-1 text-xs text-slate-500">
          Nothing recorded for last night — check Health access is allowed in Settings, or just tap it in.
        </p>
      )}
    </div>
  );
}
