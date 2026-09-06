"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { invokeAI } from "@/lib/api";
import { REEL_SCRIPTS, type ReelRequest } from "@/lib/reel-dispatch";
import { SCRIPTS } from "@/lib/reel-script";
import { saveVideo } from "@/lib/save-video";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MAKE A REEL, WATCH A REEL. WITHOUT LEAVING THIS PAGE.
 *
 * "Make the admin one click to make the reel — it's too complex", then
 * "I want it in admin dashboard not github". Both fair. It was: open GitHub,
 * find Actions, find the workflow, Run workflow, pick from a dropdown, wait,
 * find the run, download a zip, unzip it. Nine steps outside the app to watch
 * a twenty-second video the app itself asked for.
 *
 * Now: one button. Recording still happens on a GitHub runner, because that is
 * where a full ffmpeg and a browser live and neither is coming to a static
 * site — but that is an implementation detail nobody should have to know. The
 * runner uploads the finished file to the app's own storage and it turns up
 * here.
 *
 * IT TAKES A FEW MINUTES AND THE PANEL SAYS SO. A button that appears to do
 * nothing gets pressed again, and pressing it again is another three minutes
 * of somebody else's compute.
 * ═══════════════════════════════════════════════════════════════════════════
 */
/** Long enough for a slow phone, short enough that nobody sits watching it. */
const LOAD_TIMEOUT_MS = 15_000;

interface Reel {
  name: string;
  createdAt: string | null;
  size: number | null;
  url: string | null;
}

const LABEL: Record<string, string> = Object.fromEntries(SCRIPTS.map((s) => [s.id, s.label]));

export function ReelLibrary({ subject }: { subject?: string }) {
  const [reels, setReels] = useState<Reel[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});

  /**
   * The browser halves of the save, kept out of lib/save-video.ts so the
   * decisions in it stay testable without a DOM.
   */
  const save = useCallback(async (url: string, name: string) => {
    setSaving(name);
    setSaved((s) => ({ ...s, [name]: "" }));
    const out = await saveVideo(url, name, {
      fetch: (u) => fetch(u),
      nav: navigator,
      file: (blob, n) => new File([blob], n, { type: blob.type || "video/mp4" }),
      download: (blob, n) => {
        // A blob URL is SAME-ORIGIN, which is why `download` is honoured here
        // and was not on the signed URL this replaced.
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = n;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Revoked on a turn of the loop: revoking immediately cancels the
        // download in some browsers before it has read the blob.
        setTimeout(() => URL.revokeObjectURL(href), 10_000);
      },
    });
    setSaving(null);
    setSaved((s) => ({
      ...s,
      [name]:
        out.how === "shared" ? "Choose “Save Video” to put it in your camera roll."
        : out.how === "downloaded" ? "Saved to your downloads."
        : out.how === "cancelled" ? ""
        : out.why,
    }));
  }, []);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const supabase = createClient();

      /**
       * ═══════════════════════════════════════════════════════════════════
       * "IT'S STUCK IN LOADING."
       *
       * It could be. `reels === null` renders "Loading…" and only a settled
       * request clears it, so ANY request that never settles is a spinner
       * with no way out and nothing to read. A storage call can hang on a
       * stalled token refresh, on a network that accepted the connection and
       * went quiet, or on a captive portal — none of which reject.
       *
       * A timeout means the panel always ends up saying something. This is
       * the same lesson as the share card's image loader, which had exactly
       * this failure and left a button reading "Creating…" forever.
       * ═══════════════════════════════════════════════════════════════════
       */
      const withTimeout = <T,>(work: PromiseLike<T>, what: string): Promise<T> =>
        Promise.race([
          Promise.resolve(work),
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`${what} took too long — is the app online?`)), LOAD_TIMEOUT_MS)),
        ]);

      const { data, error: listError } = await withTimeout(
        supabase.storage.from("reels").list("", {
          limit: 40,
          sortBy: { column: "created_at", order: "desc" },
        }),
        "Listing the reels",
      );
      if (listError) throw new Error(listError.message);

      const files = (data ?? []).filter((f) => f.name.endsWith(".mp4"));

      /**
       * NO FILES, NO REQUEST.
       *
       * createSignedUrls([]) is a POST asking to sign nothing. It is the
       * common case on a fresh install — there are no reels yet — and asking
       * the API to do nothing is a round trip that can only fail.
       */
      const signed = files.length
        ? await withTimeout(
            supabase.storage.from("reels").createSignedUrls(files.map((f) => f.name), 60 * 60),
            "Signing the links",
          )
        : { data: [] as { signedUrl: string }[] };

      setReels(files.map((f, i) => ({
        name: f.name,
        createdAt: f.created_at ?? null,
        size: (f.metadata as { size?: number } | null)?.size ?? null,
        url: signed.data?.[i]?.signedUrl ?? null,
      })));
    } catch (e) {
      // A missing bucket is the common case before migration 0111 is applied,
      // and saying which migration is the difference between a fix and a hunt.
      const message = e instanceof Error ? e.message : String(e);
      setError(/bucket|not found|does not exist/i.test(message)
        ? "No reels bucket yet — run migration 0111."
        : message);
      setReels([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * "DOES MY PHONE NEED TO BE OPEN ON THE TAB FOR IT TO WORK?"
   *
   * No — and the honest answer exposed a weakness in how this refreshed.
   * Once GitHub accepts the request everything after it is server-side: the
   * runner films, narrates and uploads whether or not anybody is watching.
   * Closing the tab, locking the phone or killing the browser changes nothing.
   *
   * But the refresh was a three-minute setTimeout, which is exactly the thing
   * that does NOT survive that. iOS throttles timers in a backgrounded tab to
   * the point of never firing, so the one case where a refresh matters — you
   * pressed the button and went away — is the case it could not handle, and
   * the reel would sit there looking absent until a manual reload.
   *
   * Coming BACK to the tab is the reliable signal, and it is the exact moment
   * somebody wants to know. The timer stays for the case where they wait.
   * ═══════════════════════════════════════════════════════════════════════
   */
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  async function make(script: string) {
    setBusy(script);
    setError(null);
    setNote(null);
    try {
      const request: ReelRequest = { script, voice: true, ...(subject ? { subject } : {}) };
      await invokeAI<{ started?: boolean }>("record-reel", request, 30_000);
      // Says the part people actually want to know. A three-minute wait with
      // no idea whether you have to sit through it is a three-minute wait
      // somebody sits through.
      setNote("Recording — about three minutes. You can close this; it carries on without you and will be here when you come back.");
      // Reels arrive minutes later and nothing pushes them here, so the list
      // is re-read when it is plausible one has landed rather than making
      // somebody reload the page to find out.
      window.setTimeout(() => void load(), 180_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {REEL_SCRIPTS.map((id) => (
          <button
            key={id}
            onClick={() => make(id)}
            disabled={busy !== null}
            className="tap-target rounded-xl border border-pitch-400/30 bg-pitch-400/[0.06] px-3 py-2 text-sm font-semibold text-accent-300 disabled:opacity-50"
          >
            {busy === id ? "Starting…" : `🎬 ${LABEL[id] ?? id}`}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-xs text-slate-500">
          Filmed and narrated on a runner, then uploaded here — it keeps going with the app closed.
          Nothing is posted anywhere; these are files to watch and download.
        </p>
        <button
          onClick={() => void load()}
          className="tap-target shrink-0 rounded-xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-400"
        >
          Refresh
        </button>
      </div>

      {note && <p className="text-sm text-accent-400">{note}</p>}
      {error && <p className="text-sm text-readiness-yellow">{error}</p>}

      {reels === null ? (
        <p className="py-2 text-center text-sm text-slate-500">Loading…</p>
      ) : reels.length === 0 ? (
        <p className="text-sm text-slate-500">No reels yet. Make one above.</p>
      ) : (
        <ul className="space-y-3">
          {reels.map((reel) => (
            <li key={reel.name} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-slate-100">{reel.name}</span>
                <span className="text-xs text-slate-500">
                  {reel.size ? `${Math.round(reel.size / 1024 / 1024 * 10) / 10}MB` : ""}
                  {reel.createdAt ? ` · ${reel.createdAt.slice(0, 16).replace("T", " ")}` : ""}
                </span>
              </div>
              {reel.url && (
                <>
                  {/* Portrait, and capped: a 1080x1920 file at full width is a
                      column of video nobody can see the end of. */}
                  <video src={reel.url} controls playsInline className="mt-2 max-h-96 rounded-xl" />
                  {/**
                    * A BUTTON, NOT A LINK. "Won't let me save to camera roll."
                    *
                    * This was `<a href={signedUrl} download>`, and iOS ignores
                    * the download attribute on a cross-origin URL — which a
                    * signed Supabase URL always is. Safari navigated to the
                    * file and played it, and there is no way from that screen
                    * to Photos. See lib/save-video.ts.
                    */}
                  <button
                    type="button"
                    onClick={() => save(reel.url as string, reel.name)}
                    disabled={saving === reel.name}
                    className="tap-target mt-2 inline-block rounded-xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 disabled:opacity-60"
                  >
                    {saving === reel.name ? "Saving…" : "Save to camera roll"}
                  </button>
                  {saved[reel.name] && (
                    <p className="mt-1 text-xs text-slate-400">{saved[reel.name]}</p>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
