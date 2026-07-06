"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { parseBiometricCsv } from "@/lib/biometrics";

// Log today's HRV / resting HR / sleep manually, or bulk-import a watch export
// (Garmin / Whoop / Apple Health CSV). Writes to the biometrics table.
export function WearableImport({ userId, today, initial, onSaved }: {
  userId: string;
  today: string;
  initial?: { hrv_ms: number | null; resting_hr: number | null; sleep_hours: number | null };
  onSaved: () => void;
}) {
  const [hrv, setHrv] = useState(initial?.hrv_ms?.toString() ?? "");
  const [rhr, setRhr] = useState(initial?.resting_hr?.toString() ?? "");
  const [sleep, setSleep] = useState(initial?.sleep_hours?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function saveManual() {
    setSaving(true); setErr(null); setMsg(null);
    const { error } = await createClient().from("biometrics").upsert({
      user_id: userId, metric_date: today,
      hrv_ms: hrv ? Number(hrv) : null,
      resting_hr: rhr ? Math.round(Number(rhr)) : null,
      sleep_hours: sleep ? Number(sleep) : null,
      source: "manual",
    }, { onConflict: "user_id,metric_date" });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setMsg("Saved today's biometrics.");
    onSaved();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true); setErr(null); setMsg(null);
    try {
      const rows = parseBiometricCsv(await file.text());
      if (!rows.length) { setErr("Couldn't find date/HRV/sleep columns in that CSV."); setSaving(false); return; }
      const { error } = await createClient().from("biometrics").upsert(
        rows.map((r) => ({ user_id: userId, ...r })),
        { onConflict: "user_id,metric_date" }
      );
      if (error) throw error;
      setMsg(`Imported ${rows.length} day(s) of data.`);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="field-label !mb-0">⌚ Wearable data</h2>
      </div>
      <p className="mb-3 text-xs text-slate-400">Feed real HRV, resting HR &amp; sleep into your readiness.</p>

      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="field-label">HRV (ms)</span>
          <input type="number" inputMode="decimal" className="field text-center" value={hrv} onChange={(e) => setHrv(e.target.value)} placeholder="—" />
        </label>
        <label className="block">
          <span className="field-label">Rest HR</span>
          <input type="number" inputMode="numeric" className="field text-center" value={rhr} onChange={(e) => setRhr(e.target.value)} placeholder="—" />
        </label>
        <label className="block">
          <span className="field-label">Sleep (h)</span>
          <input type="number" inputMode="decimal" step="0.1" className="field text-center" value={sleep} onChange={(e) => setSleep(e.target.value)} placeholder="—" />
        </label>
      </div>

      <button onClick={saveManual} disabled={saving} className="btn-primary mt-3">{saving ? "Saving…" : "Save today"}</button>

      <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
        <span className="h-px flex-1 bg-white/10" /> or import a watch export <span className="h-px flex-1 bg-white/10" />
      </div>
      <button onClick={() => fileRef.current?.click()} disabled={saving} className="btn-ghost mt-3">📄 Import CSV (Garmin / Whoop / Apple Health)</button>
      <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />

      {err && <p className="mt-2 text-sm text-readiness-red">{err}</p>}
      {msg && <p className="mt-2 text-sm text-pitch-400">{msg}</p>}
    </div>
  );
}
