"use client";

import { AdminShell, AdminArea } from "@/components/admin/AdminShell";
import { ContentEngine } from "@/components/ContentEngine";
import { ReelStudio } from "@/components/ReelStudio";
import { ShareLoop } from "@/components/admin/ShareLoop";

/**
 * Everything that leaves this building, on one screen.
 *
 * The content engine was filed under Growth, next to the funnel and churn, and
 * Reels had a page of its own. Both are the same job — putting the product in
 * front of somebody who has not seen it — and splitting them across two tabs
 * meant the posting plan lived away from the tools that make the posts.
 *
 * The share loop leads, because it is the only one of these that scales
 * without somebody sitting here doing it.
 */
export default function AdminSocial() {
  return (
    <AdminShell title="Social" note="What goes out, and what comes back.">
      <AdminArea title="The share loop" note="Athletes posting, which is the channel that scales on its own">
        <ShareLoop />
      </AdminArea>

      <AdminArea title="Reels" note="Vertical video, recorded here, from content that already exists">
        <ReelStudio />
      </AdminArea>

      <AdminArea title="Posts, plan and captions" note="Images, app demos, and a writer held to verified facts">
        <ContentEngine />
      </AdminArea>
    </AdminShell>
  );
}
