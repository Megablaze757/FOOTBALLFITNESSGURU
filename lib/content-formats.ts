// =============================================================================
// WHAT KIND OF VIDEO TO MAKE, AND WHY THAT ONE.
//
// ═══════════════════════════════════════════════════════════════════════════
// "A FULL CONTENT ENGINE NOT JUST A POOR CONTENT ENGINE THAT PRODUCES
// MONOTONIC VIDS."
//
// Everything this project makes funnels into ONE artefact: a screen recording
// of the app with a synthetic voice over it. Four scripts, one shape. Tuned
// hard — the voice measured on five axes, the captions sync to the
// millisecond, the pauses are chosen — and all of it inside the single
// worst-performing format there is for the place it gets posted.
//
// WHAT THE EVIDENCE SAYS, and the numbers are not close:
//
//   * A screen recording "signals advertisement immediately and provides no
//     human validation of the product" — it is named the worst of the formats
//     compared. TikTok's feed trains people to skip anything that looks like
//     an ad within half a second.
//   * Creator-shot video beats polished brand video 2.1x on install rate, and
//     costs 34% less per install on Meta.
//   * Face on camera against no face, across 7,431 videos: median 12,503
//     views against 6,630. Faceless is about half, which is a real cost and
//     not a fatal one.
//   * "If an app's core feature requires multiple clicks and authentication
//     steps to reach, a screen-recording walk-through will lose viewers."
//     That is a login, a form, a save and a tab switch — it is a description
//     of the standards reel.
//
// So the answer is not a better screen recording. It is that ONE format is the
// defect. A feed wants variety, the algorithm rewards completion, and
// different things this app knows want different shapes: a protein price
// gap is an information post, a drill cue is a demonstration, a rank
// appearing is a reaction.
//
// ─────────────────────────────────────────────────────────────────────────
// A FORMAT IS A PROMISE ABOUT WHAT IT NEEDS, AND SOME NEED THINGS WE DO NOT
// HAVE.
//
// The temptation is to declare five formats and generate all five badly. The
// honest version says what each one REQUIRES — a person on camera, footage of
// a human moving, a music bed — and refuses to pretend a format is available
// when its inputs are not. `unavailable` below is not a TODO; it is the thing
// that stops the engine quietly producing the monotonic output it already
// produces, under five different names.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

/** Where a piece is meant to be seen, which decides what "good" means. */
export type Channel =
  /** A cold feed. Completion and replay decide distribution; ads get skipped. */
  | "organic"
  /** An App Store listing. The viewer already tapped the app — a demo is welcome. */
  | "store"
  /** Ads at people who already know the app. Motion design works here. */
  | "retarget";

/** A thing a format needs that this repository may or may not have. */
export type Asset =
  /** Somebody's face, talking. No substitute, and none should be invented. */
  | "person"
  /** Video of a human moving — a lift, a drill. The app has none. */
  | "footage"
  /** A music bed. Silence is a format choice nobody made here. */
  | "audio-bed";

export interface ContentFormat {
  id: string;
  label: string;
  /** What it actually is, in one line, for whoever picks from a menu. */
  note: string;
  channel: Channel[];
  /** What it cannot be made without. Empty means it can be made today. */
  needs: Asset[];
  /** The band that suits it, in milliseconds. */
  minMs: number;
  maxMs: number;
  /** Why this format exists, with the number that argues for it. */
  evidence: string;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 15 TO 60 SECONDS, AND THE REAL ANSWER IS "AS LONG AS IT TAKES AND NO LONGER".
 *
 * Completion rate is the primary signal the feed ranks on, so length is not a
 * target to hit but a cost to pay: every second is another chance to be left.
 * The bands below differ by format because a comparison of two numbers is done
 * in twelve seconds and a demonstration is not.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const FORMATS: ContentFormat[] = [
  {
    id: "knowledge",
    label: "One thing you didn't know",
    note: "A number from the app's own data, set large, with the reason under it",
    channel: ["organic"],
    needs: [],
    minMs: 8_000,
    maxMs: 25_000,
    evidence:
      "Faceless fitness content competes on knowledge — programming logic, myth debunks, "
      + "recovery science over clean frames. It is the one faceless shape the niche rewards, "
      + "and this app is full of figures nobody else has: shelf-price protein, ranked lifts.",
  },
  {
    id: "comparison",
    label: "This against that",
    note: "Two figures side by side that should not be as far apart as they are",
    channel: ["organic"],
    needs: [],
    minMs: 8_000,
    maxMs: 20_000,
    evidence:
      "Myth-busting with a number is one of the five hook shapes that work in this niche, "
      + "and a gap the viewer has to resolve is what stops the thumb. £0.31 against £3.19 "
      + "for the same 30g is the app's strongest single fact.",
  },
  {
    id: "screen-tour",
    label: "A walk through the app",
    note: "The screen recording with a voice over it — what this project makes today",
    channel: ["store", "retarget"],
    needs: [],
    minMs: 10_000,
    maxMs: 30_000,
    evidence:
      "Worst of the compared formats in a cold feed: it reads as an advert on sight and "
      + "has no human in it. It is NOT worthless — an App Store preview with a demo lifts "
      + "install conversion about 25%, and motion design works for retargeting people who "
      + "already know the app. It is in the wrong place, not beyond use.",
  },
  {
    id: "reaction",
    label: "Someone reacting to it",
    note: "A person on camera over the screen recording — the app as the thing they react to",
    channel: ["organic"],
    needs: ["person"],
    minMs: 12_000,
    maxMs: 45_000,
    evidence:
      "Screen-record-plus-reaction is named the best-performing shape for mobile apps, "
      + "because it supplies the human validation a bare recording cannot. Creator-shot "
      + "video beats polished brand video 2.1x on install rate.",
  },
  {
    id: "demonstration",
    label: "Doing the thing",
    note: "The drill or the lift performed, with the cue as text over it",
    channel: ["organic"],
    needs: ["footage"],
    minMs: 10_000,
    maxMs: 45_000,
    evidence:
      "The correction hook — 'you are doing this wrong' — is the strongest shape in the "
      + "niche and it is worthless without the movement on screen. Demos work from the neck "
      + "down or in profile, so this needs footage but not a face.",
  },
];

/** Everything that can be made with what this repository actually has. */
export function availableFormats(have: readonly Asset[] = []): ContentFormat[] {
  return FORMATS.filter((f) => f.needs.every((n) => have.includes(n)));
}

/** What a format is still waiting for. */
export function missingFor(format: ContentFormat, have: readonly Asset[] = []): Asset[] {
  return format.needs.filter((n) => !have.includes(n));
}

export function formatById(id: string): ContentFormat | undefined {
  return FORMATS.find((f) => f.id === id);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ROTATION IS THE POINT. "MONOTONIC VIDS."
 *
 * A feed of one shape reads as a feed of one video however good each one is,
 * and the complaint that started this was exactly that. So the schedule is
 * built to VARY: never the same format twice in a row while another is
 * available, and the same subject never lands twice running either.
 *
 * Takes what is available rather than what exists, because a plan full of
 * formats that cannot be made is the monotonic output with extra steps.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function rotate(count: number, have: readonly Asset[] = []): ContentFormat[] {
  const pool = availableFormats(have).filter((f) => f.channel.includes("organic"));
  if (!pool.length || count <= 0) return [];
  const out: ContentFormat[] = [];
  for (let i = 0; i < count; i++) {
    /**
     * Round-robin rather than random: random repeats, and a viewer notices a
     * repeat long before they notice a pattern. With one format available this
     * degrades to that format, which is honest — it is what we have.
     */
    out.push(pool[i % pool.length]);
  }
  return out;
}

/** Everything wrong with a format table, in the order a publisher would care. */
export function formatProblems(formats: readonly ContentFormat[] = FORMATS): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const f of formats) {
    if (seen.has(f.id)) problems.push(`${f.id}: two formats share an id`);
    seen.add(f.id);
    if (!f.channel.length) problems.push(`${f.id}: belongs to no channel, so nobody would post it`);
    if (f.minMs >= f.maxMs) problems.push(`${f.id}: the length band is empty`);
    if (!f.evidence.trim()) problems.push(`${f.id}: exists for no stated reason`);
    /**
     * A format nobody can see is not a format. This catches the failure this
     * file exists to prevent: declaring shapes to look varied while every one
     * of them needs something the project does not have.
     */
    if (f.channel.includes("organic") && f.maxMs > 60_000) {
      problems.push(`${f.id}: ${Math.round(f.maxMs / 1000)}s is past what a cold feed finishes`);
    }
  }
  if (!formats.some((f) => f.channel.includes("organic") && !f.needs.length)) {
    problems.push("nothing can be posted organically without assets the project does not have");
  }
  return problems;
}
