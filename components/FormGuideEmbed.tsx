"use client";

import { useState } from "react";

/**
 * A form guide that plays where you are, instead of throwing you at YouTube.
 *
 * WHY IT IS NOT JUST AN IFRAME. An iframe per exercise costs a third-party
 * document, its scripts and its cookies on every card that renders — before
 * anybody has asked to watch anything. On a library page of twenty rows that is
 * twenty YouTube sessions loaded to show twenty rectangles.
 *
 * So nothing of YouTube's is fetched until the tap: our own poster, our own
 * play button, and the iframe swapped in underneath it. The first frame the
 * athlete sees is ours and the second is the video. It is also faster, because
 * the expensive thing never happens for the cards nobody opens.
 *
 * `youtube-nocookie.com` for the same reason — it is the domain that does not
 * set the tracking cookie until playback, and there is no reason to take more
 * than we need from somebody watching a squat demonstration.
 *
 * SEARCHES CANNOT BE EMBEDDED. There is no iframe for a list of results, so an
 * exercise with no chosen video still links out. That is 18 of the catalogue
 * playing in place and the rest leaving — a real difference, and the button
 * says which one it is rather than pretending they are the same.
 */
export function FormGuideEmbed({ videoId, title }: { videoId: string; title: string }) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
          title={`${title} — form guide`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      /**
       * The poster is ours, not a thumbnail fetched from YouTube — the whole
       * point is that nothing leaves the page until this is tapped, and a
       * thumbnail request is a request.
       */
      className="tap-target group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-slate-800 to-ink-900 transition hover:border-pitch-400/40"
      aria-label={`Play the form guide for ${title}`}
    >
      <span className="grid h-14 w-14 place-items-center rounded-full bg-pitch-400 text-xl text-ink-900 shadow-glow transition group-hover:scale-105">
        <span aria-hidden className="ml-1">▶</span>
      </span>
      <span className="absolute bottom-3 left-0 right-0 px-4 text-center text-xs font-semibold text-slate-300">
        Watch the form guide
      </span>
    </button>
  );
}
