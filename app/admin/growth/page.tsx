"use client";

import { FunnelReport } from "@/components/FunnelReport";
import { ChurnReport } from "@/components/ChurnReport";
import { AdminShell, AdminArea } from "@/components/admin/AdminShell";

/**
 * Arrivals and departures, together.
 *
 * Knowing where people arrive is only useful next to why they leave, which is
 * why these two sit on one page and not next to the billing screens.
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
