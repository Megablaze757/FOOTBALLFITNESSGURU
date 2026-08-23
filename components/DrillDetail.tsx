"use client";

import { getExerciseByName } from "@/lib/exercises";
import { formGuide, NO_GUIDE } from "@/lib/form-guide";
import { artFor } from "@/lib/exercise-art";
import { FormGuideEmbed } from "@/components/FormGuideEmbed";
import { howToFor, type HowTo } from "@/lib/how-to";
import { ExerciseVisual } from "@/components/ExerciseVisual";
import { ExerciseModal, Sheet } from "@/components/ExerciseDetail";

/**
 * Tapping anything in a session and being told how to do it.
 *
 * Every caller used to reach straight for `getExerciseByName` and treat null as
 * "there is nothing to say" — so a footballer could tap "Tight cone weave" in
 * their plan and get nothing, while lib/skills.ts held the setup, the three
 * steps, the coaching point and the progression for that exact drill. See
 * lib/how-to.ts for why the seam is where the bug lived.
 *
 * A library exercise still renders the full library card: it has a demo, a
 * muscle breakdown and a progression method that a ball drill has no equivalent
 * of, and showing a lesser card for the case that has the most data would be a
 * step backwards.
 */
const NEEDS_LABEL = {
  solo: "You only",
  partner: "You + one",
  team: "Full session",
} as const;

export function HowToCard({ how }: { how: HowTo }) {
  return (
    <div className="space-y-4">
      <ExerciseVisual pattern={how.demo} implement={how.implement} muscles={how.muscles} name={how.name} />
      <div className="min-w-0">
        <span className="chip text-pitch-400">{how.tag}</span>
        <h3 className="mt-2 break-words text-2xl font-extrabold leading-tight text-slate-100">{how.name}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-400">{how.why}</p>
        {how.needs && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg bg-white/[0.05] px-2.5 py-1 font-medium text-slate-300">
              {NEEDS_LABEL[how.needs]}
            </span>
          </div>
        )}
      </div>

      {/* WATCH IT FIRST, IF YOU HAVE NEVER SEEN IT.
          Above the written method on purpose: somebody who does not recognise
          the name is not going to be helped by three lines of cues, and the
          rest of this sheet is written for somebody who does. */}
      {(() => {
        const guide = formGuide(how.name);
        if (!guide) return <p className="text-center text-xs text-slate-500">{NO_GUIDE}</p>;

        /**
         * THE VIDEO CARRIES MORE WEIGHT WHERE THERE IS NO PICTURE.
         *
         * Roughly a hundred and twenty movements have no photograph or
         * illustration — the sport-specific work no anatomy library covers —
         * and on those the drawn figure is the only thing above the fold. A
         * figure is a reminder for somebody who knows the movement and nearly
         * nothing for somebody who does not, which is exactly who taps into a
         * detail sheet.
         *
         * So on those the guide gets a line of explanation and the whole width
         * of the sheet; where there IS a picture it stays the compact button it
         * was, because the picture has already done that job. Same link either
         * way — this is emphasis, not a different feature.
         *
         * `kind` matters too: a chosen video and a YouTube search are different
         * promises, and saying which one is behind the tap is the difference
         * between a link that under-delivers and one that says what it is.
         */
        /**
         * A CHOSEN VIDEO PLAYS HERE; A SEARCH STILL LEAVES.
         *
         * Eighteen movements have a video somebody picked and checked, and
         * those now play in place — nothing of YouTube's loads until the tap,
         * see FormGuideEmbed. The rest resolve to a search, and there is no
         * iframe for a list of results, so they keep the link out.
         *
         * The two look different because they ARE different, and a link that
         * pretends to be a player is worse than one that says it is a link.
         */
        if (guide.videoId) return <FormGuideEmbed videoId={guide.videoId} title={how.name} />;

        const illustrated = artFor(how.name) !== null;
        return (
          <a
            href={guide.url}
            target="_blank"
            rel="noreferrer"
            className={illustrated
              ? "tap-target flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-pitch-400 px-4 text-sm font-bold text-ink-900 transition hover:bg-pitch-300"
              : "tap-target flex w-full items-center gap-3 rounded-xl bg-pitch-400 px-4 py-3 text-left text-ink-900 transition hover:bg-pitch-300"}
          >
            <span aria-hidden className={illustrated ? "" : "text-lg"}>▶</span>
            {illustrated ? guide.label : (
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{guide.label}</span>
                <span className="block text-xs font-medium text-ink-900/70">
                  {illustrated
                    ? "Search YouTube for a demonstration of this movement."
                    : "No illustration for this one — watch it done before you try it."}
                </span>
              </span>
            )}
          </a>
        );
      })()}

      {/* WHAT YOU NEED, BEFORE HOW TO DO IT. Kit and space is the first reason
          a drill gets skipped, and finding out you needed six cones after
          reading the method is finding out too late. */}
      {how.setup && (
        <div>
          <div className="stat-label mb-1.5">What you need</div>
          <p className="text-sm leading-relaxed text-slate-300">{how.setup}</p>
        </div>
      )}

      {how.steps.length > 0 && (
        <div>
          <div className="stat-label mb-1.5">How to do it</div>
          {how.steps.length === 1 ? (
            <p className="text-sm leading-relaxed text-slate-300">{how.steps[0]}</p>
          ) : (
            <ol className="space-y-2">
              {how.steps.map((s, i) => (
                <li key={s} className="flex gap-3 text-sm text-slate-200">
                  <span className="shrink-0 font-bold text-pitch-400">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {how.cues.length > 0 && (
        <div>
          <div className="stat-label mb-2">Coaching cues</div>
          <ul className="space-y-2">
            {how.cues.map((c) => (
              <li key={c} className="flex gap-2 text-sm text-slate-200">
                <span className="text-pitch-400">›</span>{c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The single most useful line a run type carries: the way people ruin
          the session while believing they are training harder. */}
      {how.watch && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-3">
          <div className="stat-label mb-1 !text-amber-300/80">What ruins it</div>
          <p className="text-sm text-slate-300">{how.watch}</p>
        </div>
      )}

      {how.progression && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="stat-label mb-1">How to progress</div>
          <p className="text-sm text-slate-300">{how.progression}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Open the detail for a drill by name, whatever catalogue holds it.
 *
 * Exact catalogue movements get the full library detail. Name variants and
 * coach-entered movements receive the shared how-to card, so every named row
 * that looks like an exercise can actually be opened.
 */
export function DrillModal({ name, sets, reps, onClose }: {
  name: string;
  sets?: number;
  reps?: number;
  onClose: () => void;
}) {
  const ex = getExerciseByName(name);
  if (ex) return <ExerciseModal ex={ex} sets={sets} reps={reps} onClose={onClose} />;

  const how = howToFor(name);
  if (!how) return null;

  return (
    <Sheet label={how.name} onClose={onClose}>
      <HowToCard how={how} />
    </Sheet>
  );
}
