"use client";

import { formGuide, NO_GUIDE } from "@/lib/form-guide";
import { FormGuideEmbed } from "@/components/FormGuideEmbed";

/**
 * The one thing an athlete sees when they want to know how a movement goes.
 *
 * WHY THIS REPLACED THE PICTURES. The app used to answer "how does this go?"
 * with a still: a drawn figure in a start and a finish position, and for about
 * half the gym catalogue a licensed illustration or photograph instead. Both
 * were the same bet — that two frames can teach a movement — and the bet does
 * not pay. A still cannot show the bar path, the tempo, where the hips go
 * first, or what a rounded back looks like from the side, which is the entire
 * content of "good form". Twelve megabytes of artwork shipped to say less than
 * a thirty-second clip does.
 *
 * So there is one visual now and it moves. Where a video has been curated it
 * plays in place; where one has not, this is an honest link to a search rather
 * than a picture pretending to be an answer.
 *
 * IT STILL COSTS NOTHING TO RENDER. See FormGuideEmbed: no iframe, no
 * thumbnail, no YouTube request of any kind until somebody taps play. A
 * library page of twenty rows fetches exactly as much from YouTube as it did
 * when it showed twenty drawings, which is nothing — and it no longer fetches
 * the drawings either.
 *
 * `videoUrl` is the exercise's OWN clip when the catalogue carries one. That
 * beats anything curated: it is the movement as this app prescribes it.
 */
export function ExerciseWatch({ name, videoUrl, youtubeId, className = "" }: {
  name: string;
  videoUrl?: string | null;
  /**
   * A guide chosen for THIS entry, which beats looking one up by name.
   *
   * formGuide() maps a name to a curated clip, and that can only ever cover
   * the compiled catalogue — an exercise somebody added last week has no
   * curated entry and never will. Publishing one attaches its own id, watched
   * by whoever reviewed it. See lib/exercise-review.ts.
   */
  youtubeId?: string | null;
  className?: string;
}) {
  if (videoUrl) {
    return (
      <div className={`aspect-video w-full overflow-hidden rounded-xl bg-black ${className}`}>
        <video src={videoUrl} controls playsInline preload="none" className="h-full w-full object-cover" />
      </div>
    );
  }

  if (youtubeId) return <FormGuideEmbed videoId={youtubeId} title={name} />;

  const guide = formGuide(name);

  if (guide?.videoId) return <FormGuideEmbed videoId={guide.videoId} title={name} />;

  /**
   * NO CHOSEN VIDEO, SO SAY SO RATHER THAN DRESS IT UP.
   *
   * This deliberately does not look like the player above it. A panel styled
   * as a video that turns out to be a YouTube search is worse than a link that
   * admits what it is — the athlete taps expecting a demonstration and gets a
   * results page, and next time they do not trust the play button either.
   */
  if (!guide) {
    return (
      <div className={`grid aspect-video w-full place-items-center rounded-xl border border-white/10 bg-white/[0.03] px-4 text-center text-xs text-slate-500 ${className}`}>
        {NO_GUIDE}
      </div>
    );
  }

  return (
    <a
      href={guide.url}
      target="_blank"
      rel="noreferrer"
      className={`tap-target group flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-4 text-center transition hover:border-pitch-400/40 hover:bg-white/[0.05] ${className}`}
    >
      <span aria-hidden className="grid h-11 w-11 place-items-center rounded-full border border-pitch-400/40 text-base text-pitch-400 transition group-hover:bg-pitch-400/10">
        ▶
      </span>
      <span className="text-sm font-bold text-slate-200">Find a demonstration</span>
      <span className="text-xs text-slate-500">No guide picked for this one yet — opens a YouTube search.</span>
    </a>
  );
}
