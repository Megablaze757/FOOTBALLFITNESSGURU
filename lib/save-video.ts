/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GETTING A REEL INTO THE CAMERA ROLL. "Won't let me save to camera roll."
 *
 * The button was `<a href={signedUrl} download={name}>`, and on iOS that does
 * nothing of the sort. Safari IGNORES the download attribute for a
 * cross-origin URL — and the signed URL is on supabase.co, which is always
 * cross-origin — so it navigates to the file and plays it. There is no way
 * from that screen to Photos, which is exactly what was reported.
 *
 * The route that works on a phone is the SHARE SHEET: navigator.share with a
 * File attached shows "Save Video", which writes to the camera roll. It needs
 * the bytes in hand, so the file is fetched first rather than linked to.
 *
 * Desktop has no share sheet and does not need one — a blob URL is same-origin,
 * so `download` is honoured there and the file lands in Downloads.
 *
 * Pure and injected, because the interesting cases are the ones a browser is
 * hard to put into: a share the user cancels, a share sheet that refuses the
 * file type, a fetch that fails on a signed URL that has expired.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type SaveOutcome =
  /** The share sheet opened. On a phone this is where "Save Video" lives. */
  | { ok: true; how: "shared" }
  /** No share sheet: the file downloaded instead. */
  | { ok: true; how: "downloaded" }
  /** The person dismissed the share sheet. Not a failure and not worth a message. */
  | { ok: false; how: "cancelled" }
  | { ok: false; how: "failed"; why: string };

export interface SaveDeps {
  fetch: (url: string) => Promise<{ ok: boolean; status: number; blob: () => Promise<Blob> }>;
  /** navigator, or the parts of it this needs. */
  nav: {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string }) => Promise<void>;
  };
  /** Makes the File. Separated because jsdom-free tests have no File. */
  file: (blob: Blob, name: string) => File;
  /** The download fallback. */
  download: (blob: Blob, name: string) => void;
}

/**
 * Whether this browser can put a video in the camera roll at all.
 *
 * BOTH share and canShare, and canShare asked about a FILE specifically:
 * every desktop browser with a share button reports `share` and most of them
 * refuse files, so checking only for `share` sends the file to a share sheet
 * that silently drops it.
 */
export function canSaveToPhotos(nav: SaveDeps["nav"], probe?: File): boolean {
  if (typeof nav?.share !== "function" || typeof nav?.canShare !== "function") return false;
  if (!probe) return true;
  try {
    return nav.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export async function saveVideo(url: string, name: string, deps: SaveDeps): Promise<SaveOutcome> {
  let blob: Blob;
  try {
    const res = await deps.fetch(url);
    if (!res.ok) {
      /**
       * A signed URL is the one that expires, and it is the likeliest failure
       * by a distance — the panel signs for an hour and a reel sits open in a
       * tab for longer than that all the time.
       */
      return {
        ok: false,
        how: "failed",
        why: res.status === 400 || res.status === 403
          ? "That link has expired. Reload the page and try again."
          : `The video could not be fetched (HTTP ${res.status}).`,
      };
    }
    blob = await res.blob();
  } catch (e) {
    return { ok: false, how: "failed", why: e instanceof Error ? e.message : "The video could not be fetched." };
  }

  const asFile = deps.file(blob, name);
  if (canSaveToPhotos(deps.nav, asFile)) {
    try {
      await deps.nav.share!({ files: [asFile], title: name });
      return { ok: true, how: "shared" };
    } catch (e) {
      /**
       * DISMISSING THE SHARE SHEET THROWS. It rejects with AbortError, which is
       * the person saying "not now" and not a fault — reporting it as one puts
       * an error under a button they deliberately backed out of.
       */
      const name_ = e instanceof Error ? e.name : "";
      if (name_ === "AbortError" || name_ === "NotAllowedError") return { ok: false, how: "cancelled" };
      // Anything else: fall through to the download, which still works.
    }
  }

  try {
    deps.download(blob, name);
    return { ok: true, how: "downloaded" };
  } catch (e) {
    return { ok: false, how: "failed", why: e instanceof Error ? e.message : "The video could not be saved." };
  }
}
