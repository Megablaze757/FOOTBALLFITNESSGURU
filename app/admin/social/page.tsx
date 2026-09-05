"use client";

import { AdminShell, AdminArea, AdminTabs, Drawer } from "@/components/admin/AdminShell";
import { REEL_ANCHOR } from "@/lib/reel-link";
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
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THREE JOBS, NOT FIVE SECTIONS.
 *
 * Reported as "make the social page easier to navigate" against a screenshot
 * of the whole thing on one scroll: the share loop, three ways of making a
 * video, and the posting schedule. Reaching the fourth meant scrolling past
 * three you did not come for, on a phone.
 *
 * They group cleanly, and the grouping is by INTENT rather than by feature:
 *
 *   MAKE   — I want a video. Three ways of getting one, easiest first.
 *   PLAN   — I want to know what to post, and something written for it.
 *   REACH  — I want to know whether any of it worked.
 *
 * MAKE leads because it is what anybody opens this page to do.
 *
 * `reel-studio` is claimed by MAKE, and that is load-bearing rather than
 * tidiness: lib/reel-link.ts builds "#reel-studio" so a planned post can send
 * you straight to the thing that builds it. Without the claim that link would
 * land on a panel this page had chosen not to render.
 */
const TABS = [
  { id: "make", label: "🎬 Make", anchors: [REEL_ANCHOR] },
  { id: "plan", label: "🗓 Plan" },
  { id: "reach", label: "📈 Reach" },
];

export default function AdminSocial() {
  return (
    <AdminShell title="Social" note="What goes out, and what comes back.">
      <AdminTabs tabs={TABS} storageKey="pa:admin:social-tab">
        {(active) => (
          <>
            {active === "make" && (
              <>
                {/* ═══════════════════════════════════════════════════════════
                    ONE BUTTON FIRST, BECAUSE IT IS THE ONE ANYBODY WANTS.

                    Making a reel used to mean opening GitHub, finding Actions,
                    running a workflow, waiting, finding the run and unzipping
                    an artefact — reported as "too complex" and then, plainly,
                    "I want it in admin dashboard not github".

                    The two below are not worse versions of it. Filming it
                    yourself is for a take you want to perform; a generated card
                    is the right answer when there is no screen to film — a price
                    table, a strength standard, a fact. Both are rarer, so both
                    are folded away.
                    ═══════════════════════════════════════════════════════════ */}
                <AdminArea title="Make a reel" note="One button. Filmed, narrated and captioned for you — no editing, nothing to install">
                  <ReelLibrary />
                </AdminArea>

                <Drawer summary="Film it yourself — your own voice, your own take">
                  <ReelRecorder />
                </Drawer>

                <Drawer summary="Generated cards — for what has no screen to film">
                  <ReelStudio />
                </Drawer>
              </>
            )}

            {active === "plan" && (
              <AdminArea title="Posts, plan and captions" note="Images, app demos, and a writer held to verified facts">
                <ContentEngine />
              </AdminArea>
            )}

            {active === "reach" && (
              <AdminArea title="The share loop" note="Athletes posting, which is the channel that scales on its own">
                <ShareLoop />
              </AdminArea>
            )}
          </>
        )}
      </AdminTabs>
    </AdminShell>
  );
}
