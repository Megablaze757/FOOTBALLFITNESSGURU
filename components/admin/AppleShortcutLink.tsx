"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAsync } from "@/lib/use-async";
import { isShortcutUrl, primeShortcutUrl, appleShortcutFallback } from "@/lib/apple-shortcut";

/**
 * Publish the Apple Health shortcut, without a deploy.
 *
 * WHAT THIS REPLACES. The link was a constant in lib/apple-shortcut.ts, so
 * turning the one-tap Apple setup on meant editing a source file, committing,
 * building and deploying — for a value that can only be produced by hand on an
 * iPhone in the first place. Anyone who can build and share the shortcut can
 * paste a link into a box, and needing a development environment to finish the
 * job is why it stayed unpublished.
 *
 * IT IS NOT SOMETHING THIS CODE CAN GENERATE, and that is worth saying on the
 * screen rather than only in a doc. An iCloud shortcut link comes from a real
 * iPhone sharing a shortcut it has installed: no API mints one, and a .shortcut
 * file served from this site cannot be signed, so a phone refuses it. The
 * build itself is docs/APPLE-SHORTCUT.md.
 */
export function AppleShortcutLink() {
  const { data, loading, reload } = useAsync(async () => {
    const { data: row, error } = await createClient()
      .from("app_settings").select("apple_shortcut_url").maybeSingle();
    return {
      url: (row as { apple_shortcut_url?: string | null } | null)?.apple_shortcut_url ?? null,
      // PostgREST rejects a select naming a column it does not know, so this is
      // how a database without 0103 announces itself.
      missing: !!error && /column|schema cache/i.test(error.message),
      error: error?.message ?? null,
    };
  }, [], "admin-apple-shortcut");

  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setValue(data?.url ?? ""); }, [data?.url]);

  const trimmed = value.trim();
  const valid = isShortcutUrl(trimmed);
  const fallback = appleShortcutFallback();
  const live = data?.url ?? fallback;

  async function save(next: string | null) {
    setBusy(true); setErr(null); setSaved(false);
    const { error } = await createClient()
      .from("app_settings").update({ apple_shortcut_url: next, updated_at: new Date().toISOString() })
      .eq("id", true);
    setBusy(false);
    if (error) {
      setErr(
        /column|schema cache/i.test(error.message)
          ? "Run migration 0103 first — the column does not exist yet."
          : /app_settings_apple_shortcut_url/i.test(error.message)
            ? "The database refused that: it is not an iCloud shortcut link."
            : error.message,
      );
      return;
    }
    // So the wearable panel picks it up without a reload.
    primeShortcutUrl(next);
    setSaved(true);
    reload();
  }

  return (
    <div className="card space-y-3 p-5">
      <div>
        <h2 className="field-label !mb-0">🍎 Apple Health shortcut</h2>
        <p className="mt-1 text-sm text-slate-300">
          {live
            ? "Published. Athletes see “Add the Shortcut” instead of the five-minute build."
            : "Not published yet. Athletes are building the Shortcut by hand."}
        </p>
      </div>

      {data?.missing && (
        <p className="rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-3 py-2 text-xs text-amber-200">
          <b>Migration 0103 has not run.</b> Paste supabase/apply-0088-0107.sql into the SQL editor and
          this box will work.
        </p>
      )}

      {/* SAY WHAT ONLY A HUMAN CAN DO, on the screen where they are about to
          wonder why there is no button that does it. */}
      <p className="rounded-xl bg-white/[0.03] px-3 py-2 text-xs leading-relaxed text-slate-400">
        This link can only come from an iPhone: build the shortcut once, share it, and choose
        <b className="text-slate-300"> Copy iCloud Link</b>. Nothing can generate one — a shortcut file
        served from a website is unsigned, and a phone refuses it. The build is six actions and is written
        out in <code className="text-slate-300">docs/APPLE-SHORTCUT.md</code>.
      </p>

      <label className="block">
        <span className="field-label">iCloud link</span>
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value); setSaved(false); setErr(null); }}
          placeholder="https://www.icloud.com/shortcuts/…"
          className="field"
          inputMode="url"
        />
      </label>

      {/* A LINK THAT IS NOT A LINK IS THE FAILURE THIS FEATURE ALREADY HAD ONCE
          — the ingest endpoint was never deployed and the guide sent everybody
          through five steps into a 404. Refuse it at the box. */}
      {trimmed.length > 0 && !valid && (
        <p className="text-xs text-readiness-yellow">
          That is not an iCloud shortcut link. It should look like
          <span className="font-mono"> https://www.icloud.com/shortcuts/</span> followed by a long hex id —
          copy it from the share sheet, not from the address bar of a preview page.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => void save(trimmed)}
          disabled={busy || !valid || trimmed === (data?.url ?? "")}
          className="btn-primary disabled:opacity-40"
        >
          {busy ? "Saving…" : saved ? "Saved ✓" : "Publish it"}
        </button>
        {data?.url && (
          <>
            <a href={data.url} target="_blank" rel="noreferrer" className="chip text-slate-300">
              Open it ↗
            </a>
            <button onClick={() => void save(null)} disabled={busy} className="chip text-slate-400">
              Unpublish
            </button>
          </>
        )}
        {loading && <span className="text-xs text-slate-500">Loading…</span>}
      </div>

      {err && <p className="text-sm text-readiness-red">{err}</p>}

      {/* RE-SHARING MAKES A NEW LINK, and forgetting that is how the button ends
          up pointing at a version nobody can install any more. */}
      {live && (
        <p className="text-xs text-slate-500">
          Editing the shortcut does not change this link — people keep the version they installed. A real
          fix needs a re-share, which produces a <b className="text-slate-400">new</b> link to paste here.
          Do not un-share it on the phone: that breaks new installs while this box still says published.
        </p>
      )}

      {!data?.url && fallback && (
        <p className="text-xs text-slate-500">
          A link is currently coming from the build (<code>lib/apple-shortcut.ts</code> or
          NEXT_PUBLIC_APPLE_SHORTCUT_URL). Anything saved here overrides it.
        </p>
      )}
    </div>
  );
}
