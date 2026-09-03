// =============================================================================
// When to ask an athlete to share, and what to put on the card.
//
// ═══════════════════════════════════════════════════════════════════════════
// A SHARE BUTTON NOBODY IS ASKED TO PRESS IS NOT A CHANNEL.
//
// The card existed, on two screens, behind a button captioned "Share my
// progress". People do not open a progress page in order to post; they post
// when something just happened — a rank came up, a lift crossed a standard, a
// streak hit a round number. Ask then and a share is a reflex. Ask at any other
// time and it is a chore, which is why the button was pressed by almost nobody.
//
// So: no new screen and no new button. One prompt, at the moment, once.
// ═══════════════════════════════════════════════════════════════════════════
//
// Pure and separate from the component because the interesting part is which
// moment wins and when it stops being offered — and getting that wrong turns
// the best feature in the app into a nag.
// =============================================================================

import type { ShareStats } from "./share-card";

export interface MomentInput {
  name: string;
  /** Full rank label, e.g. "Gold II". */
  rank?: string | null;
  tier?: string | null;
  /** Consecutive days checked in. */
  streak?: number;
  /** A lift that just crossed a standard. */
  lift?: { name: string; tier: string; weightKg: number } | null;
  /** Badges earned, by id — the newest last. */
  achievements?: string[];
}

export interface ShareMoment {
  /** Stable across renders: the same achievement always produces the same id. */
  id: string;
  /** What the prompt says. Specific, and about them. */
  headline: string;
  stats: ShareStats;
}

/**
 * The streaks worth a word.
 *
 * Round numbers only. A prompt on day 4 and again on day 5 is the app
 * congratulating itself; a week, a month and a hundred days are things a person
 * would actually tell somebody.
 */
export const STREAK_MILESTONES = [7, 30, 100, 365];

/**
 * The one moment worth asking about, or null.
 *
 * ONE. Not a list, not a queue: two prompts is a notification centre, and the
 * second one always arrives when the first has already used up the goodwill.
 * Ordered by how much a person would want to tell somebody — a lift crossing a
 * standard beats a rank, which beats a streak.
 */
export function shareMoment(input: MomentInput): ShareMoment | null {
  const name = input.name || "Athlete";

  if (input.lift) {
    const { name: lift, tier, weightKg } = input.lift;
    return {
      id: `lift:${lift.toLowerCase()}:${tier.toLowerCase()}:${Math.round(weightKg)}`,
      headline: `${tier} ${lift.toLowerCase()} — worth telling someone.`,
      stats: {
        name,
        headlineValue: `${Math.round(weightKg)}kg`,
        headlineLabel: lift,
        stats: [{ label: "Standard", value: tier }],
        caption: "Ranked against lifters at my bodyweight.",
      },
    };
  }

  if (input.rank && input.tier) {
    return {
      id: `rank:${input.rank.toLowerCase()}`,
      headline: `${input.rank}. That took work.`,
      stats: {
        name,
        headlineValue: input.tier,
        headlineLabel: input.rank,
        stats: [
          ...(input.streak ? [{ label: "Day streak", value: String(input.streak) }] : []),
        ],
        caption: "Earned by turning up, not by paying for it.",
      },
    };
  }

  const streak = input.streak ?? 0;
  const milestone = [...STREAK_MILESTONES].reverse().find((m) => streak === m);
  if (milestone) {
    return {
      id: `streak:${milestone}`,
      headline: `${milestone} days without missing one.`,
      stats: {
        name,
        headlineValue: String(milestone),
        headlineLabel: "days in a row",
        stats: [],
        caption: "Every day logged. No skipped weeks.",
      },
    };
  }

  return null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASKED ONCE, AND NEVER AGAIN FOR THE SAME THING.
 *
 * The moment is derived from state, so it is TRUE for as long as the state
 * holds — a Gold II athlete is Gold II tomorrow too. Without a record of what
 * has been offered, the prompt reappears on every load of every page for as
 * long as the rank lasts, which is the definition of a nag and would get the
 * feature switched off within a week.
 *
 * The record is local because it is a UI preference, not data: it belongs to
 * the device somebody is looking at, and syncing it would be a table and a
 * round trip to remember that a card was dismissed.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const SEEN_KEY = "pa-shared-moments";

export interface MomentStore {
  seen(): string[];
  remember(id: string): void;
}

export function browserStore(): MomentStore {
  return {
    seen() {
      try {
        const raw = localStorage.getItem(SEEN_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
      } catch {
        // Private mode, cleared storage, or something else in the key. An
        // athlete who is asked twice is a smaller problem than a crash.
        return [];
      }
    },
    remember(id: string) {
      try {
        const next = [...new Set([...this.seen(), id])].slice(-40);
        localStorage.setItem(SEEN_KEY, JSON.stringify(next));
      } catch { /* nothing to do, and nothing worth telling them */ }
    },
  };
}

/** The moment to show right now: the best one they have not been offered. */
export function pendingMoment(input: MomentInput, store: MomentStore): ShareMoment | null {
  const moment = shareMoment(input);
  if (!moment) return null;
  return store.seen().includes(moment.id) ? null : moment;
}
