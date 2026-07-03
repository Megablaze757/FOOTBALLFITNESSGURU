"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { METRIC_CATALOG } from "@/lib/benchmarks";

export function BenchmarkForm({ onSaved }: { onSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [testDate, setTestDate] = useState(new Date().toISOString().slice(0, 10));
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setValue(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const metrics: Record<string, number> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v.trim() !== "" && !Number.isNaN(Number(v))) metrics[k] = Number(v);
    }
    if (Object.keys(metrics).length === 0) {
      setError("Enter at least one metric.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { error: dbError } = await supabase.from("strength_benchmarks").insert({
      user_id: user!.id,
      test_date: testDate,
      metrics,
      notes: notes.trim() || null,
    });

    if (dbError) {
      setError(dbError.message);
      setSaving(false);
      return;
    }

    setValues({});
    setNotes("");
    setOpen(false);
    setSaving(false);
    onSaved?.();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary">+ Log a benchmark test</button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card animate-scale-in space-y-4 p-5">
      <label className="block">
        <span className="field-label">Test date</span>
        <input type="date" value={testDate} onChange={(e) => setTestDate(e.target.value)} className="field [color-scheme:dark]" />
      </label>

      <div className="space-y-2">
        {METRIC_CATALOG.map((m) => (
          <label key={m.key} className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-300">{m.label}</span>
            <span className="flex items-center gap-2">
              <input type="number" step="any" inputMode="decimal" value={values[m.key] ?? ""} onChange={(e) => setValue(m.key, e.target.value)} placeholder="–" className="field w-24 py-1.5 text-right" />
              <span className="w-7 text-xs text-slate-500">{m.unit}</span>
            </span>
          </label>
        ))}
      </div>

      <label className="block">
        <span className="field-label">Notes</span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. tested after recovery day" className="field" />
      </label>

      {error && <p className="text-sm text-readiness-red">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? "Saving…" : "Save"}</button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost w-auto px-5">Cancel</button>
      </div>
    </form>
  );
}
