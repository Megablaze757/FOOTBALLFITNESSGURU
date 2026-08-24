"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EXERCISE_CATEGORIES, DEMO_PATTERNS, SPORTS } from "@/lib/exercises";
import { blockReasons, NAME_MAX, DESCRIPTION_MAX } from "@/lib/exercise-moderation";

/**
 * Author your own exercise.
 *
 * ATHLETES COULD ALREADY DO THIS AND HAD NO WAY TO. This form was only ever
 * rendered from /squad, which is coaches-only — so the exercise library showed
 * custom entries, merged them into search, and offered no route to creating
 * one. The database was never the blocker: the RLS policy is
 * `using (coach_id = auth.uid())`, which asks who owns the row and not whether
 * they are a coach, so any authenticated user has always been able to insert
 * their own.
 *
 * The column is named `coach_id` and means owner. Renaming it is a migration
 * plus churn across three files for no behavioural gain, so it stays — noted
 * here because the name will otherwise mislead the next person who reads it.
 *
 * `scope` only changes the wording. A coach is adding something their squad
 * will see; an athlete is adding something for themselves. Same table, same
 * policy, and a coach on their own library page is still just an owner.
 */
export function CustomExerciseForm({ coachId, onAdded, scope = "team" }: {
  coachId: string;
  onAdded: () => void;
  scope?: "team" | "mine";
}) {
  const words = scope === "team"
    ? { cta: "➕ Add a team exercise", title: "New team exercise" }
    : { cta: "➕ Add your own exercise", title: "Your own exercise" };
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Strength");
  const [sport, setSport] = useState("");
  const [demo, setDemo] = useState("squat");
  const [equipment, setEquipment] = useState("");
  const [muscles, setMuscles] = useState("");
  const [cues, setCues] = useState("");
  const [why, setWhy] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return;

    /**
     * SCREENED BEFORE IT IS SAVED, and the refusal says why.
     *
     * This is not a security boundary and must not be read as one: the
     * publishable key is public by design, so anybody who wants to can post
     * straight to PostgREST and skip this entirely. The checks that actually
     * hold are in the database — migration 0100 caps the lengths, rate-limits
     * the inserts and insists a name is a name — and the review queue is what
     * stands between anything and the whole app.
     *
     * What this buys is the ordinary case: somebody typing something they
     * shouldn't is told immediately instead of having it quietly land in front
     * of their squad. Mild language is deliberately NOT blocked — a coach
     * writing "this one is brutal" is a coach — it is flagged for the reviewer
     * and saves normally.
     */
    const refusals = blockReasons({
      name,
      equipment,
      muscles: muscles.split(",").map((m) => m.trim()).filter(Boolean),
      cues: cues.split("\n").map((c) => c.trim()).filter(Boolean),
      why,
      description,
    });
    if (refusals.length) { setError(refusals.join(" ")); return; }

    setSaving(true);
    setError(null);
    const { error } = await createClient().from("custom_exercises").insert({
      coach_id: coachId,
      name: name.trim(),
      category,
      sport: sport || null,
      demo,
      equipment: equipment || null,
      muscles: muscles.split(",").map((m) => m.trim()).filter(Boolean),
      cues: cues.split("\n").map((c) => c.trim()).filter(Boolean),
      why: why || null,
      description: description || null,
    });
    setSaving(false);
    if (error) {
      /* The guard in migration 0100 raises plain English; everything else from
         PostgREST does not. Passing a constraint name to somebody who typed an
         exercise name is how a working rule reads as a broken app. */
      setError(
        /rate limit|too many|name|length|character/i.test(error.message)
          ? error.message.replace(/^.*?:\s*/, "")
          : "That could not be saved. Check the fields and try again.",
      );
      return;
    }
    setName(""); setEquipment(""); setMuscles(""); setCues(""); setWhy(""); setDescription("");
    setOpen(false);
    onAdded();
  }

  if (!open) {
    return <button data-tip="add-exercise" onClick={() => setOpen(true)} className="btn-ghost">{words.cta}</button>;
  }

  return (
    <div className="card space-y-3 p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-100">{words.title}</h3>
        <button onClick={() => setOpen(false)} className="tap-target text-sm text-slate-400 hover:text-pitch-400">Cancel</button>
      </div>

      <label className="block">
        <span className="field-label">Name</span>
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX}
          placeholder="e.g. Trap-bar jump"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="field-label">Category</span>
          <select className="field [color-scheme:dark]" value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXERCISE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Movement</span>
          <select className="field [color-scheme:dark]" value={demo} onChange={(e) => setDemo(e.target.value)}>
            {DEMO_PATTERNS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="field-label">Sport (optional)</span>
          <select className="field [color-scheme:dark]" value={sport} onChange={(e) => setSport(e.target.value)}>
            <option value="">All sports</option>
            {SPORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Equipment</span>
          <input className="field" value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="Barbell" />
        </label>
      </div>

      <label className="block">
        <span className="field-label">Target muscles (comma-separated)</span>
        <input className="field" value={muscles} onChange={(e) => setMuscles(e.target.value)} placeholder="Glutes, Quads" />
      </label>

      <label className="block">
        <span className="field-label">Coaching cues (one per line)</span>
        <textarea className="field resize-none" rows={3} value={cues} onChange={(e) => setCues(e.target.value)} placeholder={"Brace the core\nDrive through the heels"} />
      </label>

      <label className="block">
        <span className="field-label">Why it helps (one line)</span>
        <input className="field" value={why} onChange={(e) => setWhy(e.target.value)} />
      </label>

      <label className="block">
        <span className="field-label">Full description (optional)</span>
        <textarea
          className="field resize-none"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={DESCRIPTION_MAX}
        />
      </label>

      {error && <p className="text-sm text-readiness-red">{error}</p>}
      <button onClick={save} disabled={saving || !name.trim()} className="btn-primary">{saving ? "Saving…" : "Add exercise"}</button>
    </div>
  );
}
