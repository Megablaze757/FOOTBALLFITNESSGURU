"use client";

import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";

interface Invite { id: string; coachId: string; coachName: string }

export function CoachRequests() {
  const user = useCurrentUser();

  const { data, reload } = useAsync(async () => {
    const supabase = createClient();
    const { data: links } = await supabase
      .from("coach_athletes").select("id, coach_id").eq("athlete_id", user.id).eq("status", "pending");
    if (!links?.length) return [] as Invite[];
    const coachIds = links.map((l) => l.coach_id);
    const { data: coaches } = await supabase.from("profiles").select("id, full_name").in("id", coachIds);
    const nameById = new Map((coaches ?? []).map((c) => [c.id, c.full_name ?? "A coach"]));
    return links.map((l) => ({ id: l.id, coachId: l.coach_id, coachName: nameById.get(l.coach_id) ?? "A coach" }));
  }, [user.id]);

  const invites = data ?? [];
  if (!invites.length) return null;

  async function respond(id: string, status: "accepted" | "declined") {
    const supabase = createClient();
    await supabase.from("coach_athletes").update({ status }).eq("id", id);
    reload();
  }

  return (
    <div className="mb-4 space-y-2">
      {invites.map((inv) => (
        <div key={inv.id} className="card flex items-center justify-between gap-2 p-4">
          <div className="text-sm">
            <span className="font-semibold text-slate-100">{inv.coachName}</span>
            <span className="text-slate-400"> wants to coach you</span>
            {/* Say what a coach can ACTUALLY see. This read "your readiness &
                training", while the policies also grant them body logs —
                progress photos and measurements — and biometrics: HRV, resting
                heart rate, sleep. Neither is "readiness & training" by any
                ordinary reading, and agreeing to a narrower description isn't
                agreeing to the wider thing. Someone deciding whether to let
                their coach in should be told the truth before they tap Accept,
                not discover it later. */}
            <div className="text-[11px] leading-relaxed text-slate-500">
              They&apos;ll see your daily check-ins — sleep, fatigue, pain and{" "}
              <b className="text-slate-400">weight</b> — plus your readiness, training, programs,
              benchmark tests, any wearable data you import, and your body log{" "}
              <b className="text-slate-400">including progress photos</b>. They won&apos;t see your
              food diary or your uploaded videos.
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => respond(inv.id, "accepted")} className="min-h-[44px] rounded-xl bg-gradient-to-br from-pitch-400 to-pitch-600 px-3 py-1.5 text-xs font-semibold text-ink-900">Accept</button>
            <button onClick={() => respond(inv.id, "declined")} className="min-h-[44px] rounded-xl border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5">Decline</button>
          </div>
        </div>
      ))}
    </div>
  );
}
