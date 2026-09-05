"use client";

import { AdminShell, AdminArea } from "@/components/admin/AdminShell";
import { ContentEngine } from "@/components/ContentEngine";
import { ReelStudio } from "@/components/ReelStudio";
import { ReelRecorder } from "@/components/ReelRecorder";
import { ReelLibrary } from "@/components/admin/ReelLibrary";
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
      {/* ═══════════════════════════════════════════════════════════════════
          ONE BUTTON, FIRST, BECAUSE IT IS THE ONE ANYBODY WANTS.

          Making a reel used to mean opening GitHub, finding Actions, running a
          workflow, waiting, finding the run and unzipping an artefact —
          reported as "too complex" and then, plainly, "I want it in admin
          dashboard not github".

          This does the whole thing: press a button, wait three minutes, watch
          the video here. The studio below still exists for a take you want to
          perform yourself, which is a different job and a rarer one — so it is
          no longer the first thing on the page.
          ═══════════════════════════════════════════════════════════════════ */}
      <AdminArea title="Make a reel" note="One button. Filmed, narrated and captioned for you — no editing, nothing to install">
        <ReelLibrary />
      </AdminArea>

      <AdminArea title="Film it yourself" note="Screen recording with your own voice over it, for a take you want to perform">
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
