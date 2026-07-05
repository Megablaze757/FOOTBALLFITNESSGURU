"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EXERCISE_CATEGORIES, DEMO_PATTERNS, SPORTS } from "@/lib/exercises";

// Lets a coach author a drill for their team. Stored in custom_exercises;
// their accepted athletes see it in the library.
export function CustomExerciseForm({ coachId, onAdded }: { coachId: string; onAdded: () => void }) {
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
    if (error) { setError(error.message); return; }
    setName(""); setEquipment(""); setMuscles(""); setCues(""); setWhy(""); setDescription("");
    setOpen(false);
    onAdded();
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="btn-ghost">➕ Add a team exercise</button>;
  }

  return (
    <div className="card space-y-3 p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-100">New team exercise</h3>
        <button onClick={() => setOpen(false)} className="text-sm text-slate-400 hover:text-pitch-400">Cancel</button>
      </div>

      <label className="block">
        <span className="field-label">Name</span>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Trap-bar jump" />
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
        <textarea className="field resize-none" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>

      {error && <p className="text-sm text-readiness-red">{error}</p>}
      <button onClick={save} disabled={saving || !name.trim()} className="btn-primary">{saving ? "Saving…" : "Add exercise"}</button>
    </div>
  );
}
