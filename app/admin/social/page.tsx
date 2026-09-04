"use client";

import { AdminShell, AdminArea } from "@/components/admin/AdminShell";
import { ContentEngine } from "@/components/ContentEngine";
import { ReelStudio } from "@/components/ReelStudio";
import { ReelRecorder } from "@/components/ReelRecorder";
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
 *
 * Then the recorder, then the generator. The reels here were slideshows —
 * every figure on them true and the whole thing skippable — and the fix was not
 * a better card, it was pointing the camera at the app.
 */
export default function AdminSocial() {
  return (
    <AdminShell title="Social" note="What goes out, and what comes back.">
      <AdminArea title="The share loop" note="Athletes posting, which is the channel that scales on its own">
        <ShareLoop />
      </AdminArea>

      {/* ═══════════════════════════════════════════════════════════════════
          THE SCREEN RECORDER LEADS, AND THE CARD GENERATOR STAYS.

          They are not the same tool doing the same job better. Filming the app
          is the footage nobody else can fake — a readiness score moving because
          of a bad night is a moving picture of something happening. A generated
          card is text sliding over a gradient, which is what people scroll past
          fastest, and it is still the right answer when there is no screen to
          film: a price table, a strength standard, a fact.

          Recording first because that is the one worth reaching for by default.
          ═══════════════════════════════════════════════════════════════════ */}
      <AdminArea title="Film the app" note="Screen recording with your voice over it — the footage a competitor cannot fake">
        <ReelRecorder />
      </AdminArea>

      <AdminArea title="Generated cards" note="Vertical video built from content that already exists, for what has no screen to film">
        <ReelStudio />
      </AdminArea>

      <AdminArea title="Posts, plan and captions" note="Images, app demos, and a writer held to verified facts">
        <ContentEngine />
      </AdminArea>
    </AdminShell>
  );
}
