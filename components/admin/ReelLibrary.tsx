"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { invokeAI } from "@/lib/api";
import { REEL_SCRIPTS, type ReelKind, type ReelRequest } from "@/lib/reel-dispatch";
import { SCRIPTS } from "@/lib/reel-script";
import { saveAll } from "@/lib/save-video";
import { groupPosts, type PostGroup, type StoredFile } from "@/lib/reel-groups";

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

/** A slide rather than a reel. The bucket holds both. */
const isImage = (name: string) => /\.(png|jpe?g|webp)$/i.test(name);

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
  /**
   * The browser halves of the save, kept out of lib/save-video.ts so the
   * decisions in it stay testable without a DOM.
   */
  const saveGroup = useCallback(async (post: PostGroup) => {
    const items = post.files
      .filter((f): f is StoredFile & { url: string } => Boolean(f.url))
      .map((f) => ({ url: f.url, name: f.name }));
    if (items.length === 0) return;

    setSaving(post.id);
    setSaved((s) => ({ ...s, [post.id]: "" }));
    const out = await saveAll(items, {
      fetch: (u) => fetch(u),
      nav: navigator,
      file: (blob, n) => new File([blob], n, {
        // FROM THE NAME when the blob does not say. A slide handed to the
        // share sheet as video/mp4 is a slide the share sheet refuses.
        type: blob.type || (isImage(n) ? "image/png" : "video/mp4"),
      }),
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

    const many = items.length > 1;
    setSaved((s) => ({
      ...s,
      [post.id]:
        out.how === "shared"
          ? `Choose “Save ${many ? `${items.length} Images` : isImage(items[0].name) ? "Image" : "Video"}” to put ${many ? "them" : "it"} in your camera roll.`
        : out.how === "downloaded" ? `Saved to your downloads.`
        : out.how === "cancelled" ? ""
        : out.why,
    }));
  }, []);

  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * DELETING A POST DELETES ALL OF IT.
   *
   * A carousel is six objects in the bucket — five slides and a caption — so
   * removing "the post" one file at a time leaves orphans that reappear as a
   * broken group on the next refresh. The group already knows its files.
   *
   * Admins only, and that is enforced in the DATABASE (migration 0111,
   * `reels: delete admin` using public.is_admin()), not by hiding the button.
   * ═══════════════════════════════════════════════════════════════════════
   */
  const removePost = useCallback(async (post: PostGroup) => {
    const names = [...post.files.map((f) => f.name), ...(post.caption ? [post.caption.name] : [])];
    if (names.length === 0) return;
    // A reel takes three minutes to make. One confirm is not friction.
    if (!window.confirm(`Delete ${post.title}? ${names.length} file${names.length === 1 ? "" : "s"}, permanently.`)) return;

    setRemoving(post.id);
    setError(null);
    try {
      const { error: delError } = await createClient().storage.from("reels").remove(names);
      if (delError) throw new Error(delError.message);
      // Drop them locally rather than re-listing: the list is already right,
      // and a round trip here is a spinner on an action that has happened.
      setReels((current) => (current ?? []).filter((f) => !names.includes(f.name)));
    } catch (e) {
      setError(e instanceof Error
        ? `Could not delete: ${e.message}. Only an admin may remove reels.`
        : "Could not delete.");
    } finally {
      setRemoving(null);
    }
  }, []);

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

      /**
       * VIDEO AND SLIDES. This was `.mp4` only, so a carousel could be made
       * and would never appear — the whole reason the reel went into the
       * dashboard in the first place was not having to go and find it.
       *
       * .srt, .lead and .wav stay hidden: they are the reel's working files,
       * not something anybody opens this page to look at.
       */
      const files = (data ?? []).filter((f) => /\.(mp4|png)$/i.test(f.name));

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

  async function make(script: string, kind: ReelKind = "reel") {
    setBusy(kind === "carousel" ? "carousel" : script);
    setError(null);
    setNote(null);
    try {
      const request: ReelRequest = {
        script, voice: true, kind, ...(subject ? { subject } : {}),
      };
      await invokeAI<{ started?: boolean }>("record-reel", request, 30_000);
      // Says the part people actually want to know. A wait with no idea
      // whether you have to sit through it is a wait somebody sits through.
      setNote(kind === "carousel"
        ? "Making the slides — under a minute. They will appear below."
        : "Recording — about three minutes. You can close this; it carries on without you and will be here when you come back.");
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
        {/**
          * A DIFFERENT POST, not a different reel — so it is set apart rather
          * than sitting fifth in a row of four. Share rate and save rate were
          * both 0.0% on the reel, and those are what carry a post past the
          * people already following. Nobody saves a video to use in a shop.
          */}
        <button
          onClick={() => make("", "carousel")}
          disabled={busy !== null}
          className="tap-target rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 disabled:opacity-50"
        >
          {busy === "carousel" ? "Starting…" : "🖼 Protein carousel"}
        </button>
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
          {groupPosts(reels).map((post) => (
            <li key={post.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-slate-100">{post.title}</span>
                <span className="text-xs text-slate-500">
                  {post.createdAt ? post.createdAt.slice(0, 16).replace("T", " ") : ""}
                </span>
              </div>

              {/**
                * SLIDES SIDE BY SIDE, in posting order.
                *
                * A five-slide carousel used to be five full-width rows, which
                * is a page of scrolling to see one post and no way at all to
                * tell what order they go in.
                */}
              {post.kind === "carousel" ? (
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {post.files.map((file, i) => (
                    file.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={file.name}
                        src={file.url}
                        alt={`Slide ${i + 1}`}
                        className="h-56 w-auto shrink-0 rounded-lg border border-white/10"
                      />
                    ) : null
                  ))}
                </div>
              ) : post.files[0]?.url ? (
                /* Portrait, and capped: a 1080x1920 file at full width is a
                   column of video nobody can see the end of. */
                <video src={post.files[0].url} controls playsInline className="mt-2 max-h-96 rounded-xl" />
              ) : null}

              {post.files.some((f) => f.url) && (
                <>
                  {/**
                    * ONE TAP FOR THE WHOLE POST. navigator.share takes an
                    * array, and iOS offers "Save 5 Images" for one — five
                    * separate saves means five sheets in the right order
                    * without losing count.
                    */}
                  <button
                    type="button"
                    onClick={() => saveGroup(post)}
                    disabled={saving === post.id}
                    className="tap-target mt-2 inline-block rounded-xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 disabled:opacity-60"
                  >
                    {saving === post.id
                      ? "Saving…"
                      : post.files.length > 1
                        ? `Save all ${post.files.length} slides`
                        : "Save to camera roll"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removePost(post)}
                    disabled={removing === post.id}
                    className="tap-target ml-2 mt-2 inline-block rounded-xl border border-readiness-red/30 px-3 py-1.5 text-xs font-semibold text-readiness-red disabled:opacity-60"
                  >
                    {removing === post.id ? "Deleting…" : "Delete"}
                  </button>
                  {saved[post.id] && <p className="mt-1 text-xs text-slate-400">{saved[post.id]}</p>}
                </>
              )}

              {/* The caption is written by the run, so it can be copied rather
                  than retyped from a screenshot of itself. */}
              {post.caption?.url && (
                <details className="mt-2">
                  {/* tap-target: a <summary> is a control, and this one was
                      17px tall against the 44px floor lib/tap-targets.test.ts
                      enforces. A disclosure nobody can hit is a caption
                      nobody can copy. */}
                  <summary className="tap-target inline-flex cursor-pointer items-center text-xs font-semibold text-slate-400">
                    Caption
                  </summary>
                  <a
                    href={post.caption.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs text-accent-400 underline"
                  >
                    Open caption.txt
                  </a>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
