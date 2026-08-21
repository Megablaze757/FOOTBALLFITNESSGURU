"use client";

import { BackLink } from "@/components/BackLink";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync, invalidate } from "@/lib/use-async";
import { MiniBars } from "@/components/MiniBars";
import type { BodyLog } from "@/lib/types";
import { daysAgoLocal, todayLocal } from "@/lib/day";
import { weightSeries, weightProvenance } from "@/lib/bodyweight";

export default function BodyPage() {
  const user = useCurrentUser();
  const today = todayLocal();

  const { data, loading, reload } = useAsync(async () => {
    const supabase = createClient();
    const since = daysAgoLocal(120);
    const { data: logs } = await supabase
      .from("body_logs").select("*").eq("user_id", user.id).gte("log_date", since).order("log_date", { ascending: true });
    const rows = (logs ?? []) as BodyLog[];

    /**
     * THE WEIGHTS THIS PAGE WAS MISSING.
     *
     * The chart plotted body_logs and nothing else, so somebody who answers the
     * weight question in their daily check-in — the quicker of the two, and the
     * one the app asks them for every morning — opened this page and saw a trend
     * that stopped at whenever they last visited it. The number was never lost;
     * it was in the other table, and every other reader in the app has looked in
     * both since lib/bodyweight.ts existed. This one did not.
     */
    const { data: checkIns } = await supabase
      .from("daily_check_ins").select("check_in_date, weight_kg").eq("user_id", user.id)
      .not("weight_kg", "is", null).gte("check_in_date", since).order("check_in_date", { ascending: true });
    // Sign photo URLs for the gallery.
    const withPhotos = rows.filter((r) => r.photo_path);
    const signed: Record<string, string> = {};
    for (const r of withPhotos.slice(-6)) {
      const { data: s } = await supabase.storage.from("photos").createSignedUrl(r.photo_path!, 600);
      if (s) signed[r.id] = s.signedUrl;
    }
    return {
      rows, signed,
      checkIns: (checkIns ?? []).map((r) => ({ date: r.check_in_date as string, kg: r.weight_kg as number })),
    };
  }, [user.id], `body:${user.id}`);

  const rows = data?.rows ?? [];
  // Both tables, one point per day, freshest last — the same resolver the
  // headline number, the calorie target and the strength ranks all read.
  const weights = weightSeries({
    checkIns: data?.checkIns,
    weighIns: rows.map((r) => ({ date: r.log_date, kg: r.weight_kg })),
  });
  const current = weights.length > 0 ? weights[weights.length - 1] : null;
  const bars = weights.map((w) => ({ date: w.date!, value: w.kg }));
  const bfSeries = rows.filter((r) => r.body_fat_pct != null).map((r) => ({ date: r.log_date, value: Number(r.body_fat_pct) }));
  const photos = rows.filter((r) => r.photo_path && data?.signed[r.id]);

  return (
    <div className="animate-fade-up mx-auto max-w-3xl space-y-5">
      <header className="flex flex-col">
        <BackLink href="/dashboard" label="Progress" />
        <h1 className="text-3xl font-extrabold tracking-tight">Body</h1>
        <p className="mt-1 text-sm text-slate-400">Weight, body fat and photos over time. Feeds your calorie targets.</p>
      </header>

      <BodyForm userId={user.id} today={today} onSaved={reload} />

      {loading ? (
        <div className="card h-40 animate-pulse" />
      ) : (
        <>
          <div className="card p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="field-label">Weight over time</h2>
              {/* WHICH NUMBER IS CURRENT, AND WHERE IT CAME FROM. Two places
                  record a weight and the athlete cannot be expected to hold
                  which one was last. */}
              {current && (
                <span className="text-xs text-slate-400">
                  <span className="font-bold text-slate-100">{current.kg} kg</span>{" "}
                  {weightProvenance(current, today)}
                </span>
              )}
            </div>
            <MiniBars data={bars} color="#e3b53f" unit=" kg" emptyLabel="Add a weight below and this fills in. Two entries a week is enough to see a trend." />
          </div>
          {bfSeries.length > 0 && (
            <div className="card p-5">
              <h2 className="field-label">Body fat over time</h2>
              <MiniBars data={bfSeries} color="#fbbf24" unit="%" height={72} emptyLabel="Optional — only if you measure body fat. Weight alone is plenty." />
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
    else { setSaved(true); setFile(null); invalidate(); onSaved(); }
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
