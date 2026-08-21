"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { clearCoachRoleCache } from "@/lib/coach-role";
import { SPORTS, DIFFICULTIES } from "@/lib/exercises";
import { PositionPicker } from "@/components/PositionPicker";
import { positionList } from "@/lib/positions";
import { validateUsername, USERNAME_MAX } from "@/lib/username";
import { clearAllDrafts } from "@/lib/drafts";
import { recordChanged } from "@/lib/data-events";
import type { Profile } from "@/lib/types";
import { HEALTH_CONSENT_VERSION } from "@/lib/consent";

export function ProfileForm({ profile, email }: { profile: Profile; email: string }) {
  const router = useRouter();

  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [username, setUsername] = useState(profile.username ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [experience, setExperience] = useState(profile.experience_years?.toString() ?? "");
  const [role, setRole] = useState<Profile["role"]>(profile.role);
  const [sport, setSport] = useState<string>(profile.sport ?? "football");
  // The array is the source of truth; `position` is kept in step as the primary
  // so the older readers of that column keep working.
  const [positions, setPositions] = useState<string[]>(
    positionList(profile.positions?.length ? profile.positions : profile.position),
  );
  const [level, setLevel] = useState<string>(profile.level ?? "advanced");
  // Opt-IN in the UI, opt-OUT in the column. Storing it as an opt-out means a
  // new row defaults to visible, which is what makes a leaderboard work at all;
  // showing it as "show me on leaderboards" is what makes the choice legible.
  const [onBoards, setOnBoards] = useState(!profile.leaderboard_opt_out);
  const [emailWeekly, setEmailWeekly] = useState(profile.email_weekly_summary ?? true);
  const [emailCheckins, setEmailCheckins] = useState(profile.email_checkin_reminders ?? true);
  const [emailWorkouts, setEmailWorkouts] = useState(profile.email_workout_reminders ?? true);
  const [emailMilestones, setEmailMilestones] = useState(profile.email_milestones ?? true);
  const [emailPrograms, setEmailPrograms] = useState(profile.email_program_reminders ?? true);
  const [inAppReminders, setInAppReminders] = useState(profile.in_app_training_reminders ?? true);
  const [healthConsent, setHealthConsent] = useState(!!profile.health_data_consent_at);
  const [healthConsentAt, setHealthConsentAt] = useState(profile.health_data_consent_at ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    const supabase = createClient();

    // Validate before writing so the person gets "at least 3 characters" rather
    // than a database constraint name.
    const check = validateUsername(username);
    if (!check.ok) {
      setError(check.error ?? "That username won't work.");
      setSaving(false);
      return;
    }

    // Checked separately from the unique index so a clash reads as "taken"
    // instead of a raw 23505.
    if (check.value !== profile.username) {
      const { data: free } = await supabase.rpc("username_available", { p_name: check.value });
      if (free === false) {
        setError(`“${check.value}” is taken — try another.`);
        setSaving(false);
        return;
      }
    }

    const consentTimestamp = healthConsent ? (healthConsentAt ?? new Date().toISOString()) : null;
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName || null, bio: bio || null,
        username: check.value,
        experience_years: experience ? Number(experience) : null,
        role, sport, positions, position: positions[0] ?? null, level,
        leaderboard_opt_out: !onBoards,
        email_weekly_summary: emailWeekly,
        email_checkin_reminders: emailCheckins,
        email_workout_reminders: emailWorkouts,
        email_milestones: emailMilestones,
        email_program_reminders: emailPrograms,
        in_app_training_reminders: inAppReminders,
        health_data_consent_at: consentTimestamp,
        health_data_consent_version: healthConsent ? HEALTH_CONSENT_VERSION : null,
      })
      .eq("id", profile.id);

    if (error) {
      // The unique index is the real guard; the check above just races it.
      setError(error.code === "23505" ? "That username was just taken — try another." : error.message);
    } else {
      setHealthConsentAt(consentTimestamp);
      setUsername(check.value); // show the normalised form back
      setSaved(true);
      // The nav caches the role for the tab's lifetime. Without this, ticking
      // "Coach" and saving leaves the Squad entry missing until a reload — which
      // reads as the setting not having taken.
      clearCoachRoleCache();
      recordChanged("profile", "goals");
    }
    setSaving(false);
  }

  async function handleSignOut() {
    const supabase = createClient();
    // Leaving a half-written check-in on a shared phone for whoever signs in
    // next is exactly the kind of thing nobody thinks about until it happens.
    clearAllDrafts(profile.id);
    recordChanged("profile", "goals");
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
        <span className="field-label">Username</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={USERNAME_MAX}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="field"
          placeholder="striker99"
        />
        <span className="mt-1 block text-xs text-slate-400">
          This is what leaderboards show — your real name never appears there.
          Letters, numbers and underscores.
        </span>
      </label>

      <label className="block">
        <span className="field-label">Full name</span>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="field" />
        <span className="mt-1 block text-xs text-slate-400">
          Only your coach sees this.
        </span>
      </label>

      <label className="block">
        <span className="field-label">Sport</span>
        <select value={sport} onChange={(e) => { setSport(e.target.value); setPositions([]); }} className="field [color-scheme:dark]">
          {SPORTS.map((s) => (
            <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>
          ))}
        </select>
      </label>

      <PositionPicker sport={sport} value={positions} onChange={setPositions} />

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

      <div className="rounded-2xl bg-white/[0.03] p-4">
        <label className="flex cursor-pointer items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-slate-200">Show me on leaderboards</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Your <b>username</b> and weekly activity — check-ins, sleep score, minutes trained.
              Never your real name, injuries, weight or body composition. Turn this off and you
              disappear from every board, including your squad&apos;s.
            </span>
          </span>
          <input
            type="checkbox"
            checked={onBoards}
            onChange={(e) => setOnBoards(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-pitch-500"
          />
        </label>
      </div>

      <fieldset className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
        <legend className="field-label px-1">Notifications</legend>
        <p className="mb-3 text-xs text-slate-500">Choose what is useful. Essential account, security and billing notices are unaffected.</p>
        <div className="space-y-3">
          <EmailChoice label="Training reminders in the app" checked={inAppReminders} onChange={setInAppReminders} />
          <div className="border-t border-white/[0.07] pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Email</div>
          <EmailChoice label="Daily check-in reminder" checked={emailCheckins} onChange={setEmailCheckins} />
          <EmailChoice label="Workout logging reminder" checked={emailWorkouts} onChange={setEmailWorkouts} />
          <EmailChoice label="Weekly training summary" checked={emailWeekly} onChange={setEmailWeekly} />
          <EmailChoice label="Streaks and goal milestones" checked={emailMilestones} onChange={setEmailMilestones} />
          <EmailChoice label="Program deadline reminders" checked={emailPrograms} onChange={setEmailPrograms} />
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
        <legend className="field-label px-1">Health-data consent</legend>
        <label className="flex cursor-pointer items-start justify-between gap-3">
          <span className="min-w-0 text-xs leading-relaxed text-slate-400">
            I explicitly consent to PocketAthlete processing the health and fitness data I enter
            to personalise readiness, recovery, nutrition and training. Turn this off to withdraw
            consent; personalised processing stops until you opt in again. Delete your account below
            to erase its data, or email support for a narrower request.
          </span>
          <input
            type="checkbox"
            checked={healthConsent}
            onChange={(event) => {
              setHealthConsent(event.target.checked);
              if (!event.target.checked) setHealthConsentAt(null);
            }}
            className="mt-0.5 h-5 w-5 shrink-0 accent-pitch-500"
          />
        </label>
      </fieldset>

      {error && <p className="text-sm text-readiness-red">{error}</p>}
      {saved && <p className="text-sm text-pitch-400">Saved.</p>}

      <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save profile"}</button>
      <button type="button" onClick={handleSignOut} className="btn-ghost">Sign out</button>
    </form>
  );
}

function EmailChoice({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-slate-300">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-pitch-500" />
    </label>
  );
}
