"use client";

import { FunnelReport } from "@/components/FunnelReport";
import { ChurnReport } from "@/components/ChurnReport";
import { ContentEngine } from "@/components/ContentEngine";
import { AdminShell, AdminArea } from "@/components/admin/AdminShell";

/**
 * Arrivals and departures, together.
 *
 * Knowing where people arrive is only useful next to why they leave, which is
 * why these two sit on one page and not next to the billing screens.
 *
 * The content engine is here for the same reason: it is the thing you reach
 * for when the funnel says nobody is arriving. It was written, wired to a live
 * Worker endpoint, and then never mounted on any route — see the test in
 * lib/backend-routes.test.ts that now checks a screen can actually reach it.
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
      <AdminArea title="Content" note="A plan, image cards, and a writer that may only use verified facts">
        <ContentEngine />
      </AdminArea>
    </AdminShell>
  );
}
