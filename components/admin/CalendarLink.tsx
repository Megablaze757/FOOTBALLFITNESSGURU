"use client";

import { useState } from "react";
import { invokeAI } from "@/lib/api";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * YOUR TRAINING PLAN, INSIDE THE CALENDAR YOU ALREADY LOOK AT.
 *
 * A subscription rather than an export: an .ics you download once is wrong the
 * moment the programme changes, and a plan that goes stale is worse than no
 * plan in the calendar at all. Subscribed, the calendar re-polls and the
 * sessions move with it.
 *
 * webcal:// is the link that matters. https:// hands a phone a FILE, which it
 * imports once and never updates; webcal:// makes it offer to subscribe. Both
 * are shown because a desktop client usually wants the https one pasted in.
 *
 * THE URL IS THE PASSWORD — there is no other way for a calendar app to
 * identify you, since none of them can log in. So it says so, and re-minting
 * revokes the old one, which is the only way to un-share a link already given
 * out.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function CalendarLink() {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ url: string; webcal: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function mint() {
    setBusy(true);
    setError(null);
    try {
      const res = await invokeAI<{ url?: string; webcal?: string }>("calendar-token", {});
      if (!res?.url || !res.webcal) throw new Error("The Worker returned no URL.");
      setLink({ url: res.url, webcal: res.webcal });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function copy(value: string, which: string) {
    navigator.clipboard.writeText(value);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">
        Subscribe to your programme from Apple Calendar, Google Calendar or Outlook. Sessions appear
        as all-day entries you can drag — the app tracks your block in order rather than by date, so
        the days are a suggested spread rather than appointments.
      </p>

      {!link ? (
        <button onClick={mint} disabled={busy} className="btn-primary">
          {busy ? "Creating…" : "Create my calendar link"}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl border border-readiness-yellow/25 bg-readiness-yellow/[0.04] p-3 text-sm text-slate-300">
            <b>This link is the password.</b> Anyone who has it can read your training plan — there
            is no way for a calendar app to log in, so the address is what identifies you. Creating a
            new one immediately stops the old one working.
          </div>

          <div>
            <p className="field-label">Subscribe on a phone</p>
            <a href={link.webcal} className="btn-primary inline-block">Add to my calendar</a>
            <button
              onClick={() => copy(link.webcal, "webcal")}
              className="tap-target ml-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-slate-300"
            >
              {copied === "webcal" ? "Copied" : "Copy webcal link"}
            </button>
          </div>

          <div>
            <p className="field-label">Paste into a desktop calendar</p>
            <p className="break-all rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-slate-400">
              {link.url}
            </p>
            <button
              onClick={() => copy(link.url, "https")}
              className="tap-target mt-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-slate-300"
            >
              {copied === "https" ? "Copied" : "Copy link"}
            </button>
          </div>

          {/* A revoke is a thing you reach for in a hurry, on a phone, because
              you shared the link somewhere you should not have. It gets a
              thumb-sized target like everything else. */}
          <button
            onClick={mint}
            disabled={busy}
            className="tap-target rounded-xl px-3 py-2 text-xs text-slate-500 underline"
          >
            Create a new link and revoke this one
          </button>
        </div>
      )}

      {error && <p className="text-sm text-readiness-red">{error}</p>}
    </div>
  );
}
