"use client";

import { createClient } from "@/lib/supabase/client";
import { useAsync } from "@/lib/use-async";
import { MessageThread } from "@/components/MessageThread";

// Athlete-side view of their coach threads: one thread per accepted coach.
export function CoachMessages({ athleteId }: { athleteId: string }) {
  const { data } = useAsync(async () => {
    const supabase = createClient();
    const { data: links } = await supabase
      .from("coach_athletes").select("coach_id, status").eq("athlete_id", athleteId).eq("status", "accepted");
    const coachIds = (links ?? []).map((l) => l.coach_id as string);
    if (!coachIds.length) return [] as { id: string; name: string }[];
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", coachIds);
    return (profiles ?? []).map((p) => ({ id: p.id as string, name: (p.full_name as string) ?? "Coach" }));
  }, [athleteId]);

  const coaches = data ?? [];
  if (!coaches.length) return null;

  return (
    <div className="mb-4 space-y-4">
      {coaches.map((c) => (
        <MessageThread key={c.id} coachId={c.id} athleteId={athleteId} meId={athleteId} otherName={c.name.split(" ")[0]} />
      ))}
    </div>
  );
}
