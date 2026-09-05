"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { invokeAI } from "@/lib/api";
import { REEL_SCRIPTS, type ReelRequest } from "@/lib/reel-dispatch";
import { SCRIPTS } from "@/lib/reel-script";

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
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error: listError } = await supabase.storage.from("reels").list("", {
        limit: 40,
        sortBy: { column: "created_at", order: "desc" },
      });
      if (listError) throw new Error(listError.message);

      const files = (data ?? []).filter((f) => f.name.endsWith(".mp4"));
      /**
       * SIGNED URLS, because the bucket is private and has to be.
       * They expire; the list is re-fetched when the panel is opened, which is
       * the only time anybody is looking at it.
       */
      const signed = await supabase.storage.from("reels")
        .createSignedUrls(files.map((f) => f.name), 60 * 60);

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

  async function make(script: string) {
    setBusy(script);
    setError(null);
    setNote(null);
    try {
      const request: ReelRequest = { script, voice: true, ...(subject ? { subject } : {}) };
      await invokeAI<{ started?: boolean }>("record-reel", request, 30_000);
      setNote("Recording. It takes about three minutes — it will appear below when it lands.");
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
      <p className="text-xs text-slate-500">
        Filmed and narrated on a runner, then uploaded here. Nothing is posted anywhere — these are
        files to watch and download.
      </p>

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
                  <a
                    href={reel.url}
                    download={reel.name}
                    className="tap-target mt-2 inline-block rounded-xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300"
                  >
                    Download
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
