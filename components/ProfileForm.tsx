"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SPORTS, DIFFICULTIES } from "@/lib/exercises";
import { positionsForSport } from "@/lib/coach";
import type { Profile } from "@/lib/types";

export function ProfileForm({ profile, email }: { profile: Profile; email: string }) {
  const router = useRouter();

  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [experience, setExperience] = useState(profile.experience_years?.toString() ?? "");
  const [role, setRole] = useState<Profile["role"]>(profile.role);
  const [sport, setSport] = useState<string>(profile.sport ?? "football");
  const [position, setPosition] = useState<string>(profile.position ?? "");
  const [level, setLevel] = useState<string>(profile.level ?? "advanced");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    const supabase = createClient();

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName || null, bio: bio || null, experience_years: experience ? Number(experience) : null, role, sport, position: position || null, level })
      .eq("id", profile.id);

    if (error) setError(error.message);
    else setSaved(true);
    setSaving(false);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <form onSubmit={handleSave} className="card space-y-5 p-5">
      <label className="block">
        <span className="field-label">Email</span>
        <input value={email} disabled className="field opacity-60" />
      </label>

      <label className="block">
        <span className="field-label">Full name</span>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="field" />
      </label>

      <label className="block">
        <span className="field-label">Sport</span>
        <select value={sport} onChange={(e) => { setSport(e.target.value); setPosition(""); }} className="field [color-scheme:dark]">
          {SPORTS.map((s) => (
            <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="field-label">Position / event</span>
        <select value={position} onChange={(e) => setPosition(e.target.value)} className="field [color-scheme:dark]">
          <option value="">— none —</option>
          {[...new Set([position, ...positionsForSport(sport)].filter(Boolean))].map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="field-label">Training level</span>
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="field [color-scheme:dark]">
          {DIFFICULTIES.map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="field-label">Role</span>
        <select value={role} onChange={(e) => setRole(e.target.value as Profile["role"])} className="field [color-scheme:dark]">
          <option value="athlete">Athlete</option>
          <option value="coach">Coach</option>
        </select>
      </label>

      <label className="block">
        <span className="field-label">Experience (years)</span>
        <input type="number" min={0} value={experience} onChange={(e) => setExperience(e.target.value)} className="field" />
      </label>

      <label className="block">
        <span className="field-label">Bio</span>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className="field resize-none" />
      </label>

      {error && <p className="text-sm text-readiness-red">{error}</p>}
      {saved && <p className="text-sm text-pitch-400">Saved.</p>}

      <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save profile"}</button>
      <button type="button" onClick={handleSignOut} className="btn-ghost">Sign out</button>
    </form>
  );
}
