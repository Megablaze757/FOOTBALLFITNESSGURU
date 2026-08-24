"use client";

import { createClient } from "@/lib/supabase/client";
import { useAsync } from "@/lib/use-async";
import { LaunchToggle } from "@/components/admin/LaunchToggle";
import { WaitlistAnnounce } from "@/components/admin/WaitlistAnnounce";
import { EmailOps } from "@/components/admin/EmailOps";
import { CustomExerciseLog } from "@/components/admin/DataLogs";
import { ExerciseReview } from "@/components/admin/ExerciseReview";
import { AdminShell, AdminArea, Drawer } from "@/components/admin/AdminShell";
import type { Video } from "@/lib/types";

/**
 * The controls that change what the outside world sees, plus the job queue.
 *
 * Grouped because they share a property nothing else here has: pressing them
 * does something irreversible to people outside this screen. Keeping them off
 * the overview means you cannot hit one while glancing at revenue.
 */
export default function AdminOps() {
  const { data } = useAsync(async () => {
    const { data: failed } = await createClient()
      .from("videos").select("*").eq("status", "failed")
      .order("created_at", { ascending: false }).limit(10);
    return { failed: (failed ?? []) as Video[] };
  }, []);

  const failed = data?.failed ?? [];

  return (
    <AdminShell title="Ops" note="Launch controls and the job queue.">
      <AdminArea title="Launch" note="What the public can see, and who has been told">
        <LaunchToggle />
        <WaitlistAnnounce />
      </AdminArea>

      {/* EMAIL SITS ABOVE THE JOB QUEUE because it is the one that fails
          silently. A failed video job is visible to the person who uploaded it;
          an email that never sent is visible to nobody at all. */}
      <AdminArea title="Email" note="Whether it can send, what it sent, and why">
        <EmailOps />
      </AdminArea>

      {/* NO BODYWEIGHT HERE, DELIBERATELY.
          This used to carry a table of every athlete's weight against their
          name. It was built to answer "my weight is wrong" and it answered it —
          but the cost of being able to answer that question was an admin screen
          that listed what every user in the app weighs, which is not ours to
          look at. Support can ask the athlete. See migration 0096: the read
          policy behind this table is dropped too, because a removed component
          and a live grant is a privacy fix in appearance only. */}
      {/* THE LIBRARY GREW FROM THE PEOPLE USING IT, and until now it could not.
          Athletes have been adding their own movements for months; every one of
          them stayed visible to one squad because promoting it meant editing a
          TypeScript array, building and deploying. It is a decision, not a code
          change, so it belongs on a screen. */}
      <AdminArea title="Library" note="What athletes added, and what is worth keeping">
        <Drawer summary="Review and publish exercises">
          <ExerciseReview />
        </Drawer>
      </AdminArea>

      <AdminArea title="Data" note="Read-only, for answering 'my number is wrong'">
        <Drawer summary="What athletes have added, by demand">
          <CustomExerciseLog />
        </Drawer>
      </AdminArea>

      <AdminArea title="Jobs" note="Only worth opening when something looks wrong">
        <Drawer summary={`Failed video jobs · ${failed.length}`}>
          {failed.length === 0 ? (
            <p className="py-2 text-center text-sm text-slate-500">No failed jobs. 🎉</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2">Video</th><th className="pb-2">User</th><th className="pb-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {failed.map((v) => (
                  <tr key={v.id}>
                    <td className="py-2 font-mono text-xs text-slate-300">{v.id.slice(0, 8)}…</td>
                    <td className="py-2 font-mono text-xs text-slate-300">{v.user_id.slice(0, 8)}…</td>
                    <td className="py-2 text-slate-400">{v.created_at.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Drawer>
      </AdminArea>
    </AdminShell>
  );
}
