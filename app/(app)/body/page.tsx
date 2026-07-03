"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { MiniBars } from "@/components/MiniBars";
import type { BodyLog } from "@/lib/types";

export default function BodyPage() {
  const user = useCurrentUser();
  const today = new Date().toISOString().slice(0, 10);

  const { data, loading, reload } = useAsync(async () => {
    const supabase = createClient();
    const since = new Date(Date.now() - 120 * 86400_000).toISOString().slice(0, 10);
    const { data: logs } = await supabase
      .from("body_logs").select("*").eq("user_id", user.id).gte("log_date", since).order("log_date", { ascending: true });
    const rows = (logs ?? []) as BodyLog[];
    // Sign photo URLs for the gallery.
    const withPhotos = rows.filter((r) => r.photo_path);
    const signed: Record<string, string> = {};
    for (const r of withPhotos.slice(-6)) {
      const { data: s } = await supabase.storage.from("photos").createSignedUrl(r.photo_path!, 600);
      if (s) signed[r.id] = s.signedUrl;
    }
    return { rows, signed };
  }, [user.id]);

  const rows = data?.rows ?? [];
  const weightSeries = rows.filter((r) => r.weight_kg != null).map((r) => ({ date: r.log_date, value: Number(r.weight_kg) }));
  const bfSeries = rows.filter((r) => r.body_fat_pct != null).map((r) => ({ date: r.log_date, value: Number(r.body_fat_pct) }));
  const photos = rows.filter((r) => r.photo_path && data?.signed[r.id]);

  return (
    <div className="animate-fade-up space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Body</h1>
          <p className="mt-1 text-sm text-slate-400">Weight, body-fat &amp; progress photos.</p>
        </div>
        <Link href="/history" className="text-sm text-slate-400 hover:text-pitch-400">← Back</Link>
      </header>

      <BodyForm userId={user.id} today={today} onSaved={reload} />

      {loading ? (
        <div className="card h-40 animate-pulse" />
      ) : (
        <>
          {weightSeries.length > 0 && (
            <div className="card p-5">
              <h2 className="field-label">Weight (kg)</h2>
              <MiniBars data={weightSeries} color="#a3e635" unit=" kg" />
            </div>
          )}
          {bfSeries.length > 0 && (
            <div className="card p-5">
              <h2 className="field-label">Body fat (%)</h2>
              <MiniBars data={bfSeries} color="#fbbf24" unit="%" height={72} />
            </div>
          )}
          {photos.length > 0 && (
            <div className="card p-5">
              <h2 className="field-label">Progress photos</h2>
              <div className="grid grid-cols-3 gap-2">
                {photos.slice(-6).map((r) => (
                  <figure key={r.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={data!.signed[r.id]} alt={`Progress ${r.log_date}`} className="aspect-[3/4] w-full rounded-xl object-cover" />
                    <figcaption className="mt-1 text-center text-[10px] text-slate-500">{r.log_date.slice(5)}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BodyForm({ userId, today, onSaved }: { userId: string; today: string; onSaved: () => void }) {
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setSaved(false), [weight, bodyFat, file]);

  async function save() {
    if (!weight && !bodyFat && !file) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();

    let photoPath: string | null = null;
    if (file) {
      const ext = file.name.split(".").pop() || "jpg";
      photoPath = `${userId}/${today}-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("photos").upload(photoPath, file, { contentType: file.type || "image/jpeg", upsert: true });
      if (upErr) { setError(upErr.message); setSaving(false); return; }
    }

    const payload: Record<string, unknown> = { user_id: userId, log_date: today };
    if (weight) payload.weight_kg = Number(weight);
    if (bodyFat) payload.body_fat_pct = Number(bodyFat);
    if (photoPath) payload.photo_path = photoPath;

    const { error: e } = await supabase.from("body_logs").upsert(payload, { onConflict: "user_id,log_date" });
    if (e) setError(e.message);
    else { setSaved(true); setFile(null); onSaved(); }
    setSaving(false);
  }

  return (
    <div className="card space-y-4 p-5">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="field-label">Weight (kg)</span>
          <input type="number" step="0.1" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} className="field" placeholder="e.g. 75.5" />
        </label>
        <label className="block">
          <span className="field-label">Body fat (%)</span>
          <input type="number" step="0.1" inputMode="decimal" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} className="field" placeholder="optional" />
        </label>
      </div>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/15 px-4 py-4 text-center text-sm text-slate-300 transition hover:border-pitch-400/50">
        📸 {file ? file.name : "Add a progress photo (optional)"}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {error && <p className="text-sm text-readiness-red">{error}</p>}
      <button onClick={save} disabled={saving} className="btn-primary">{saving ? "Saving…" : saved ? "Saved ✓" : "Save today"}</button>
    </div>
  );
}
