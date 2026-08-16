"use client";

import { useEffect, useRef, useState } from "react";
import { exerciseMuscles } from "@/lib/muscle-volume";
import { demoImplement, exerciseProgression, PROGRESSION_NOTE, type Exercise } from "@/lib/exercises";
import { ExerciseSteps } from "@/components/ExerciseDemo";
import { Portal } from "@/components/Portal";
import { Icon } from "@/components/Icon";
import { createClient } from "@/lib/supabase/client";

const PROGRESSION_LABEL = { load: "Add weight", reps: "Add reps", time: "Add time", skill: "Add difficulty" } as const;

// The coached content for one exercise: demo + how-to + cues + tempo + muscles.
export function ExerciseDetailCard({ ex, sets, reps }: { ex: Exercise; sets?: number; reps?: number }) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shared, setShared] = useState(false);
  const guideUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${ex.name} exercise proper form`)}`;

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase.from("profiles").select("saved_exercises").eq("id", data.user.id).maybeSingle();
      if (active) setSaved(((profile?.saved_exercises ?? []) as string[]).includes(ex.id));
    });
    return () => { active = false; };
  }, [ex.id]);

  async function toggleSaved() {
    setSaving(true);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setSaving(false); return; }
    const { data: profile } = await supabase.from("profiles").select("saved_exercises").eq("id", auth.user.id).maybeSingle();
    const current = (profile?.saved_exercises ?? []) as string[];
    const next = saved ? current.filter((id) => id !== ex.id) : [...new Set([...current, ex.id])];
    const { error } = await supabase.from("profiles").update({ saved_exercises: next }).eq("id", auth.user.id);
    if (!error) setSaved(!saved);
    setSaving(false);
  }

  async function shareExercise() {
    const payload = { title: ex.name, text: `${ex.name} — ${ex.why}`, url: guideUrl };
    if (navigator.share) await navigator.share(payload).catch(() => undefined);
    else await navigator.clipboard?.writeText(`${payload.text}\n${payload.url}`);
    setShared(true);
    window.setTimeout(() => setShared(false), 1600);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        {/* Wider than it is tall on mobile: two frames side by side need the
            room, and a 40-unit square would squeeze each figure to nothing. */}
        <div className="grid h-44 w-full shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-2 sm:w-56">
          {ex.video_url ? (
            <video src={ex.video_url} autoPlay muted loop playsInline className="h-full w-full rounded-2xl object-cover" />
          ) : (
            <ExerciseSteps pattern={ex.demo} implement={demoImplement(ex)} className="h-full w-full" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <span className="chip text-pitch-400">{ex.category}</span>
          <h3 className="mt-2 break-words text-xl font-extrabold text-slate-100">{ex.name}</h3>
          <p className="mt-1 text-sm text-slate-400">{ex.why}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {(sets && reps) ? <Tag label={`${sets} × ${reps}`} /> : null}
            <Tag label={ex.tempo} />
            <Tag label={ex.equipment} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-y border-white/[0.08] py-3">
        <a href={guideUrl} target="_blank" rel="noreferrer" className="tap-target inline-flex min-h-[44px] flex-1 items-center gap-1.5 text-sm font-semibold text-pitch-400 hover:underline">
          Visit <span aria-hidden>›</span>
        </a>
        <button type="button" onClick={shareExercise} className="btn-ghost w-auto gap-2 px-3 py-2 text-xs">
          <Icon name="share" size={17} /> {shared ? "Copied" : "Share"}
        </button>
        <button type="button" onClick={toggleSaved} disabled={saving} aria-pressed={saved} className={`btn-ghost w-auto gap-2 px-3 py-2 text-xs ${saved ? "text-pitch-400" : ""}`}>
          <Icon name="bookmark" size={17} /> {saved ? "Saved" : "Save"}
        </button>
      </div>

      {/* Only claim to be teaching the movement when we actually are. The bulk
          gym entries carry a one-line note on what the lift is for, which is
          useful — but printing it under "How to perform it" promises a
          step-by-step and delivers a sentence, which is worse than saying
          nothing. Label each for what it is, and be honest about the gap. */}
      {ex.description && (
        <div>
          <div className="stat-label mb-1.5">{ex.hasHowTo ? "How to perform it" : "What it's for"}</div>
          <p className="text-sm leading-relaxed text-slate-300">{ex.description}</p>
          {!ex.hasHowTo && (
            <p className="mt-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-slate-400">
              We haven&apos;t written a full step-by-step for this one yet. The cues below are the
              points that matter most — and the animation shows the movement pattern.
            </p>
          )}
        </div>
      )}

      {/* A heading over an empty list is a promise the data can't keep. 199 of
          the imported exercises have no cues at all — they get the full how-to
          above instead, which is the more useful of the two anyway. */}
      {ex.cues.length > 0 && (
        <div>
          <div className="stat-label mb-2">Coaching cues</div>
          <ul className="space-y-2">
            {ex.cues.map((c) => (
              <li key={c} className="flex gap-2 text-sm text-slate-200">
                <span className="text-pitch-400">›</span>{c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* PRIMARY MOVER, THEN WHAT ASSISTS IT.
          This was a flat row of chips, which said two different things in one
          voice: a bench press listed "Chest" and nothing else, because the
          imported catalogue carries one coarse label per exercise, while a
          Copenhagen plank listed "Adductors" and "Core" as though they were
          equal claims. The engine has known the difference since assisting
          movers were added to the volume accounting — see exerciseMuscles —
          so the page and the volume bars now agree about what a lift trains. */}
      {(() => {
        const { primary, secondary } = exerciseMuscles(ex.name, ex.muscles);
        if (!primary) return null;
        return (
          <div>
            <div className="stat-label mb-1.5">Targets</div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-pitch-400/15 px-3 py-1 text-xs font-semibold text-pitch-400">
                {primary}
              </span>
              {secondary.length > 0 && (
                <>
                  <span className="text-[11px] text-slate-500">also works</span>
                  {secondary.map((m) => (
                    <span key={m} className="rounded-full bg-white/[0.05] px-3 py-1 text-xs text-slate-400">{m}</span>
                  ))}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {(() => {
        const method = exerciseProgression(ex);
        return (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center gap-2">
              <span className="stat-label !mb-0">How to progress</span>
              <span className="chip text-pitch-400">{PROGRESSION_LABEL[method]}</span>
            </div>
            <p className="mt-1.5 text-sm text-slate-300">{PROGRESSION_NOTE[method]}</p>
          </div>
        );
      })()}
    </div>
  );
}

function Tag({ label }: { label: string }) {
  return <span className="rounded-lg bg-white/[0.05] px-2.5 py-1 font-medium text-slate-300">{label}</span>;
}

/**
 * The bottom sheet itself, without opinions about what's inside it.
 *
 * Exported because the exercise library is no longer the only catalogue a
 * session draws from — ball drills and runs open the same sheet with different
 * contents (see components/DrillDetail.tsx). Two copies of this markup would
 * mean two behaviours for Escape, for the scroll lock, and for the tab-bar
 * clearance, which is exactly the drift that makes one of them wrong.
 */
export function Sheet({ label, children, onClose }: { label: string; children: React.ReactNode; onClose: () => void }) {
  const touchStart = useRef<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
        <div
          // pb-28 keeps the bottom of the sheet clear of the floating mobile
          // tab bar, which otherwise sits on top of the last section.
          className="animate-scale-in max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-ink-800 p-6 pb-28 shadow-card sm:rounded-3xl sm:pb-6"
          onClick={(e) => e.stopPropagation()}
          // Escape already worked here; the dialog semantics didn't exist, so a
          // screen reader was never told the page behind had become unavailable.
          role="dialog"
          aria-modal="true"
          aria-label={label}
          onTouchStart={(e) => { touchStart.current = e.touches[0]?.clientY ?? null; }}
          onTouchEnd={(e) => {
            const start = touchStart.current;
            const end = e.changedTouches[0]?.clientY;
            touchStart.current = null;
            if (start != null && end != null && end - start > 80) onClose();
          }}
        >
          <div className="mx-auto -mt-2 mb-3 h-1.5 w-12 rounded-full bg-white/15 sm:hidden" aria-hidden />
          <div className="mb-4 flex justify-end">
            <button onClick={onClose} className="tap-target grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] text-slate-300 transition hover:bg-white/10" aria-label="Close">✕</button>
          </div>
          {children}
        </div>
      </div>
    </Portal>
  );
}

export function ExerciseModal({ ex, sets, reps, onClose }: { ex: Exercise; sets?: number; reps?: number; onClose: () => void }) {
  return (
    <Sheet label={ex.name} onClose={onClose}>
      <ExerciseDetailCard ex={ex} sets={sets} reps={reps} />
    </Sheet>
  );
}
