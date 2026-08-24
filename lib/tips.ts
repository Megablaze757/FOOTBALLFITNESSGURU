/**
 * Pointing at a feature somebody has not found yet.
 *
 * THE PROBLEM IS REAL AND THIS APP HAS HAD IT REPEATEDLY. The strength
 * calculator lived behind a 24px icon next to an already-logged exercise for
 * months. The "add your own exercise" form was only rendered on a coaches-only
 * page while the library merged custom entries into search and offered no route
 * to making one. Both were built, tested, shipped and invisible. A feature
 * nobody can find is a feature nobody has.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT MAKES THIS DIFFERENT FROM A PRODUCT TOUR, which is the version that
 * makes people hate an app:
 *
 * 1. A TIP IS EARNED, NOT SCHEDULED. Each one names what the athlete must
 *    already have done for it to be useful. Telling somebody on day one that
 *    they can rank their bench is noise; telling them after they have logged
 *    three sessions is an answer to a question they now have. Preconditions
 *    are usage, not elapsed time.
 *
 * 2. A TIP FOR A LOCKED FEATURE IS NOT A TIP. Pointing a free athlete at the
 *    injury planner teaches them the app is a shop. Capability is checked
 *    before anything is offered.
 *
 * 3. THREE DISMISSALS IS AN ANSWER. Somebody who has waved away three of these
 *    without once tapping through has told you what they think of them, and
 *    continuing is the app not listening. Tips mute themselves permanently.
 *
 * 4. ONE AT A TIME, AND NEVER AGAIN ONCE SEEN. Two tooltips on one screen is a
 *    tour, and nobody asked for a tour.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure and tested. The component does the pointing; this decides whether there
 * is anything worth pointing at.
 */

import { can, type Capability } from "@/lib/subscription";
import type { Tier } from "@/lib/types";

/** What the athlete has actually done. Everything a precondition may read. */
export interface TipContext {
  tier: Tier;
  /** Days they have logged anything at all. */
  checkIns: number;
  /** Programme sessions ticked off. */
  sessionsDone: number;
  hasProgram: boolean;
  /** Dated bodyweight entries, from either table — see lib/bodyweight.ts. */
  weightEntries: number;
  /** Exercises they have added themselves. */
  customExercises: number;
  /** A wearable that is actually syncing. */
  hasWearable: boolean;
}

export interface Tip {
  id: string;
  /** The route this tip's anchor lives on. Exact match on the pathname. */
  page: string;
  /**
   * The `data-tip` value on the control being pointed at.
   *
   * A STRING RATHER THAN A REF, because the anchor and the tip are written in
   * different files and the pairing has to survive one of them being edited by
   * somebody who has never read the other. The component renders nothing at all
   * when the selector finds nothing — a tooltip floating in the corner pointing
   * at a control that was moved last week is worse than no tooltip.
   */
  anchor: string;
  title: string;
  body: string;
  /** Locked features are never advertised. Null means everyone can use it. */
  needs: Capability | null;
  /** Lower goes first when more than one is eligible. */
  priority: number;
  /** Has the athlete done enough for this to answer a question they have? */
  when: (ctx: TipContext) => boolean;
}

/**
 * Every tip, in one list.
 *
 * Deliberately short. The temptation is to write one for each feature, and a
 * dozen tips is a tour by instalments — these are the handful that were
 * genuinely built and genuinely missed.
 */
export const TIPS: Tip[] = [
  {
    id: "customise-session",
    page: "/coach",
    anchor: "customise-session",
    title: "This session is yours to rearrange",
    body: "Tap Edit to reorder the exercises, swap one you cannot do today, or take something out. Reset puts the original back whenever you want it.",
    needs: "program",
    priority: 1,
    // Three sessions in, they have met the parts of it they want to change.
    when: (c) => c.hasProgram && c.sessionsDone >= 3,
  },
  {
    id: "strength-calculator",
    page: "/library",
    anchor: "strength-calculator",
    title: "What is that lift actually worth?",
    body: "A weight and the reps you got it for, and this tells you your one-rep max and where it ranks for your bodyweight.",
    needs: "library",
    priority: 2,
    when: (c) => c.sessionsDone >= 2,
  },
  {
    id: "weight-trend",
    page: "/body",
    anchor: "weight-trend",
    title: "The number that matters is the change",
    body: "Two weigh-ins a week apart and this shows what you have actually gained or lost — and lets you fix an entry you typed wrong.",
    needs: null,
    priority: 3,
    when: (c) => c.weightEntries >= 2,
  },
  {
    id: "add-your-own-exercise",
    page: "/library",
    anchor: "add-exercise",
    title: "Missing a movement?",
    body: "Add it and it is in your library for good. The good ones get reviewed and go into the main library for everybody.",
    needs: "library",
    priority: 4,
    // Only once they have been through the catalogue enough to find the gap.
    when: (c) => c.sessionsDone >= 5 && c.customExercises === 0,
  },
  {
    id: "connect-wearable",
    page: "/journal",
    anchor: "connect-wearable",
    title: "Stop typing last night's sleep",
    body: "Connect an Oura ring, or add the Apple Health shortcut, and your sleep and HRV are already here every morning.",
    needs: null,
    priority: 5,
    // A week of typing it by hand is what makes this worth reading.
    when: (c) => c.checkIns >= 7 && !c.hasWearable,
  },
];

// --- what the athlete has been shown ------------------------------------------

/**
 * One seen-record per tip.
 *
 * Two outcomes, kept apart, because the difference is the only signal there is
 * about whether these are wanted at all: "acted" means they tapped through,
 * "dismissed" means they waved it away.
 */
export type SeenMark = string;

export function actedMark(id: string): SeenMark { return `+${id}`; }
export function dismissedMark(id: string): SeenMark { return `-${id}`; }

function idOf(mark: SeenMark): string { return mark.slice(1); }

/** Every tip already shown, however it ended. */
export function seenIds(seen: SeenMark[]): Set<string> {
  return new Set((seen ?? []).map(idOf));
}

/**
 * Three dismissals with nothing acted on, ever.
 *
 * Not "three in a row" — an athlete who acts on one and then dismisses three
 * is still finding them useful sometimes, and order is not reliably preserved
 * in an array the client appends to. Never having tapped through is the clear
 * signal.
 */
export const MUTE_AFTER_DISMISSALS = 3;

export function tipsMuted(seen: SeenMark[]): boolean {
  const marks = seen ?? [];
  const dismissed = marks.filter((m) => m.startsWith("-")).length;
  const acted = marks.filter((m) => m.startsWith("+")).length;
  return acted === 0 && dismissed >= MUTE_AFTER_DISMISSALS;
}

// --- choosing ------------------------------------------------------------------

/**
 * The one tip worth showing here, or null.
 *
 * Null is the overwhelmingly common answer and that is the design working.
 */
export function nextTip(pathname: string, ctx: TipContext, seen: SeenMark[]): Tip | null {
  if (tipsMuted(seen)) return null;

  // Trailing slashes: this app is a static export, so every route is a
  // directory and the pathname arrives with one about half the time.
  const here = (pathname || "").replace(/\/+$/, "") || "/";
  const already = seenIds(seen);

  const eligible = TIPS.filter((t) =>
    t.page === here &&
    !already.has(t.id) &&
    (t.needs === null || can(ctx.tier, t.needs)) &&
    t.when(ctx));

  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => a.priority - b.priority)[0];
}

/** Every anchor a tip can point at, so a test can check they all exist. */
export function tipAnchors(): { id: string; page: string; anchor: string }[] {
  return TIPS.map((t) => ({ id: t.id, page: t.page, anchor: t.anchor }));
}
