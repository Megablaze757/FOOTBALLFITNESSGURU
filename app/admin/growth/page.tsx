"use client";

import { FunnelReport } from "@/components/FunnelReport";
import { ChurnReport } from "@/components/ChurnReport";
import { AdminShell, AdminArea } from "@/components/admin/AdminShell";

/**
 * Arrivals and departures, together.
 *
 * Knowing where people arrive is only useful next to why they leave, which is
 * why these two sit on one page and not next to the billing screens.
 *
 * The content engine used to be here — it was the thing you reach for when the
 * funnel says nobody is arriving. It has moved to Social, next to the reels and
 * the share loop, because those are the same job and the plan belongs beside
 * the tools that act on it.
 */
export default function AdminGrowth() {
  return (
    <AdminShell title="Growth" note="Where people arrive, and why they leave.">
      <AdminArea title="The funnel" note="One cohort: who signed up in the window, and how far they got">
        <FunnelReport />
      </AdminArea>
      <AdminArea title="Churn" note="Cancellations, and the reasons given">
        <ChurnReport />
      </AdminArea>
    </AdminShell>
  );
}
