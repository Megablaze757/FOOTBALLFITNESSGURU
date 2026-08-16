// =============================================================================
// WHEN THE DELOAD SHOULD FALL.
//
// It was always week four. Every block, every athlete, whatever state they
// arrived in — which makes it a calendar entry rather than a decision. The
// athlete who finishes a hard block, takes no break and starts the next one
// carrying a load spike and a run of amber mornings gets three more weeks of
// accumulation before anything comes down, and that is the athlete a deload
// exists for.
//
// The app measures everything this needs and has never used any of it here.
// ACWR is on the home page. Readiness is scored on every check-in and stored.
// Both were being shown to the athlete as facts about their week and then
// ignored by the thing that decides how long the next one runs.
//
// WHAT THIS DOES NOT DO. It does not move a deload inside a block somebody is
// already part-way through. They planned around those weeks, and a session
// disappearing out from under them mid-block is its own kind of wrong — see
// adjustForReadiness in lib/engine.ts, which is how a single bad DAY is
// handled. This decides the shape of the NEXT block only.
//
// Pure + tested.
// =============================================================================

import type { ReadinessStatus } from "./types";

/** Above this, weekly load has climbed faster than the tissue adapts. */
const ACWR_SPIKE = 1.5;

/** Reds in the recent window that on their own justify a shorter block. */
const RED_LIMIT = 2;
/** …and how many amber-or-worse mornings do the same. */
const AMBER_LIMIT = 4;

/** How many recent check-ins to look at. */
export const WINDOW = 10;

export interface BlockShape {
  /** How many weeks the next block should run, including its deload. */
  weeks: number;
  /** Which week is the deload — always the last one. */
  deloadWeek: number;
  /** Null when the standard block is right, so nothing is said unnecessarily. */
  reason: string | null;
}

const STANDARD = 4;
const SHORT = 3;

/**
 * The shape of the next block, from how the athlete is arriving at it.
 *
 * A SHORTER BLOCK IS NOT A SMALLER ONE. Three weeks of accumulation and a
 * deload is a complete block — it is the same work arriving sooner at the point
 * where it gets absorbed. Somebody reading "3 weeks" should understand they are
 * getting a block built for the state they are in, not a punishment.
 */
export function blockShape(input: {
  acwr?: number | null;
  /** Most recent first or last — order does not matter, only the counts. */
  recentReadiness?: (ReadinessStatus | null | undefined)[];
}): BlockShape {
  const recent = (input.recentReadiness ?? []).filter(Boolean).slice(0, WINDOW) as ReadinessStatus[];
  const reds = recent.filter((r) => r === "Red").length;
  const ambers = recent.filter((r) => r === "Red" || r === "Yellow").length;
  const acwr = input.acwr ?? null;

  const reasons: string[] = [];
  if (acwr != null && acwr > ACWR_SPIKE) {
    reasons.push(`your weekly load is ${Math.round((acwr - 1) * 100)}% above your four-week average`);
  }
  if (reds >= RED_LIMIT) {
    reasons.push(`you have had ${reds} red mornings recently`);
  } else if (ambers >= AMBER_LIMIT) {
    reasons.push(`${ambers} of your last ${recent.length} check-ins came back amber or worse`);
  }

  if (!reasons.length) {
    return { weeks: STANDARD, deloadWeek: STANDARD, reason: null };
  }

  return {
    weeks: SHORT,
    deloadWeek: SHORT,
    reason:
      `Three weeks instead of four, because ${joinReasons(reasons)}. ` +
      `The work is the same — the week where it turns into progress just comes sooner.`,
  };
}

function joinReasons(list: string[]): string {
  return list.length <= 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}
