// =============================================================================
// HOW LONG A SCREEN IS A LOADING SCREEN, MEASURED RATHER THAN ASSUMED.
//
// ═══════════════════════════════════════════════════════════════════════════
// THIS EXISTS BECAUSE THE PROJECT HAS GUESSED AT IT THREE TIMES AND TWICE WAS
// WRONG.
//
// lib/reel-script.ts has DATA_ROUTE_PAINT_MS = 2_300, arrived at by stepping
// through frames of a finished file twice — the first attempt was half of it —
// and its own comment ends: "Nothing enforces this: a beat that needs it and
// does not have it records a black screen and passes every check in the
// pipeline, which is exactly how it shipped."
//
// Then the recorder was changed to click the app's own link instead of
// reloading the document. Every argument for it was true and it made the reel
// worse; the explanation written into the code afterwards was also wrong, and
// the local timings refuted it. What actually happened is that the soft
// navigation WAITED for the page to be ready, and the caption clock could not
// absorb the truth — 2025ms, which is DATA_ROUTE_PAINT_MS to within noise.
//
// Every one of those was an argument about a number nobody had measured on the
// screens that matter. So this measures it, on the real run, on the real
// authenticated routes, and prints it.
//
// ───────────────────────────────────────────────────────────────────────────
// IT REPORTS AND CHANGES NOTHING, ON PURPOSE.
//
// The three ways out of the blank frame — hold before speaking, stop visiting
// data routes mid-reel, make the pages paint faster — are product decisions
// with different costs, and one of them breaks the thirty-second ceiling. A
// module that picked one would be a fourth guess. This one hands over the
// numbers the choice needs and stops.
//
// It also costs the recording nothing. The measurement is taken by an observer
// inside the page that stamps a timestamp when the screen stops being a
// loading screen; the recorder reads the stamp after the beat is over. Nothing
// waits on it, so a slow route cannot make the reel longer — which matters,
// because a measurement that changes what it measures is how the last two
// attempts went wrong.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

import { DATA_ROUTE_PAINT_MS } from "./reel-script";
import type { PlanStep, ReelPlan } from "./reel-plan";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TELLING A SKELETON FROM A PULSING DOT, WHICH ARE THE SAME CLASS.
 *
 * Every data route in this app builds its loading state out of Tailwind's
 * `animate-pulse`: `<div className="card h-44 animate-pulse" />` and a dozen
 * like it. Counting that class is therefore the cheapest possible "is this
 * still a loading screen".
 *
 * Except the class is also on a live status dot — `h-1.5 w-1.5 animate-pulse
 * rounded-full` next to "AI Coach" on /home, and the same next to the
 * revalidating notice. Those never go away, so a naive count never reaches
 * zero and every route would measure as never painting.
 *
 * SIZE IS WHAT SEPARATES THEM, and not narrowly: the dots are six css pixels
 * and the smallest skeleton block in the app is a 12px-tall bar. Twenty-four
 * is comfortably between, which is the only property this threshold needs —
 * it is not a judgement about what counts as big, it is a gap in a bimodal
 * distribution with an order of magnitude between the two clusters.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const SKELETON_MIN_PX = 24;

/**
 * A screen with nothing on it is not a painted screen.
 *
 * The document exists before React mounts, and at that instant there are no
 * skeletons — because there is nothing at all. Without this, every route would
 * report painting in under a frame, which is both wrong and the most flattering
 * possible answer, which is how it would survive review.
 */
export const MIN_PAINTED_CHARS = 40;

/**
 * How long to wait for a skeleton to turn up before deciding there isn't one.
 *
 * A static route — the front page, the pricing page — renders its real content
 * immediately and never shows a skeleton at all. Waiting for one to clear on a
 * page that never has one would report every static route as never painting.
 *
 * MEASURED FROM WHEN THE SCREEN FIRST LOOKED READY, not from the navigation.
 * Counted from the navigation, every route without a skeleton reports exactly
 * this number — which is what the first version did, giving three different
 * pages the same 1001ms — and a route that renders text at 900ms and its
 * skeleton at 1100ms would be called painted before its loading screen
 * appeared.
 *
 * A second is long against the paint times this is measuring and short against
 * the ones it is looking for. A data route that has not put a skeleton up
 * within a second of looking finished did not have one.
 */
export const SKELETON_GRACE_MS = 1_000;

/** Past this, stop waiting and report it as unknown rather than as a number. */
export const PAINT_TIMEOUT_MS = 8_000;

/** What the page looks like right now. */
export interface PaintObservation {
  /** Elements carrying the skeleton class that are bigger than a status dot. */
  skeletons: number;
  /** Characters of rendered text on the page. */
  textLength: number;
  /** Milliseconds since this document started loading. */
  sinceMs: number;
}

/** What the observer has seen so far. Carried frame to frame. */
export interface PaintMemory {
  /** A skeleton has been up at some point, ie. this is a data route. */
  sawSkeleton: boolean;
  /** When the screen FIRST looked finished, if it has. */
  readyAt: number | null;
}

export const NOTHING_SEEN: PaintMemory = { sawSkeleton: false, readyAt: null };

export type PaintVerdict = "painted" | "wait" | "gave-up";

export interface PaintStep {
  memory: PaintMemory;
  verdict: PaintVerdict;
  /** When it painted — not when that was noticed. Null unless painted. */
  at: number | null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONE FRAME OF THE DECISION, AS A REDUCER, AND WHY IT IS SHAPED LIKE THIS.
 *
 * The first version was a predicate — `paintVerdict(state)` — with the
 * observer keeping the bookkeeping around it. Run against real pages it
 * reported /home, /nutrition and /pricing as painting at 1001ms, 1016ms and
 * 1002ms. Three different pages, three times the same number, and that number
 * is SKELETON_GRACE_MS: none of them showed a skeleton, so each was declared
 * painted at the instant the grace period expired rather than when it had
 * actually finished. A static page that paints in 80ms measured as 1000ms.
 *
 * The bug was the predicate shape. "Has it painted" and "when did it paint"
 * are different questions, and a function that only answers the first leaves
 * the caller to answer the second with the only timestamp it has — now.
 *
 * So this returns the moment, and the grace runs from when the screen first
 * LOOKED ready rather than from the navigation. That also fixes a case the
 * old shape could not express at all: a route that renders text at 900ms and
 * puts its skeleton up at 1100ms was, under a grace counted from navigation,
 * called painted a hundred milliseconds before its loading screen appeared.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function paintStep(memory: PaintMemory, now: PaintObservation): PaintStep {
  const sawSkeleton = memory.sawSkeleton || now.skeletons > 0;

  // A skeleton on screen is the definition of still loading, and it also
  // cancels any earlier moment that looked finished — the shell rendering
  // before the skeleton does is not the screen being ready.
  if (now.skeletons > 0) {
    const memoryNext = { sawSkeleton: true, readyAt: null };
    return { memory: memoryNext, verdict: now.sinceMs >= PAINT_TIMEOUT_MS ? "gave-up" : "wait", at: null };
  }

  // Nothing rendered yet. Not painted, whatever else is true — the document
  // exists before React mounts, and at that instant there are no skeletons
  // because there is nothing at all.
  if (now.textLength < MIN_PAINTED_CHARS) {
    const memoryNext = { sawSkeleton, readyAt: null };
    return { memory: memoryNext, verdict: now.sinceMs >= PAINT_TIMEOUT_MS ? "gave-up" : "wait", at: null };
  }

  const readyAt = memory.readyAt ?? now.sinceMs;
  const next: PaintMemory = { sawSkeleton, readyAt };

  /**
   * A skeleton was up and is now gone. That is unambiguous: the loading screen
   * ended at the moment it stopped being on screen, and no grace is needed to
   * tell it apart from anything else.
   */
  if (sawSkeleton) return { memory: next, verdict: "painted", at: readyAt };

  // No skeleton has ever appeared. Either this route does not have one, or it
  // has not got there yet, and only waiting tells them apart. The wait runs
  // from when it first looked ready, so the answer is that moment and not the
  // moment the waiting finished.
  if (now.sinceMs - readyAt >= SKELETON_GRACE_MS) {
    return { memory: next, verdict: "painted", at: readyAt };
  }
  return { memory: next, verdict: now.sinceMs >= PAINT_TIMEOUT_MS ? "gave-up" : "wait", at: null };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE OBSERVER, BUILT FROM THE FUNCTION ABOVE RATHER THAN WRITTEN AGAIN.
 *
 * paintVerdict has to run inside the browser, where it cannot be imported. The
 * obvious thing is to write a second copy of it in the init script — and a
 * second copy of a rule is the exact defect the last two commits were about:
 * two implementations, one of them the copy nobody would notice breaking.
 *
 * So the real function is serialised and the constants it reads are inlined
 * beside it. There is one implementation; the browser gets a photocopy of it.
 * reel-paint.test.ts evaluates the photocopy and checks it answers identically
 * across a grid of states, so a transpiler that mangled it would be caught.
 *
 * THAT HAZARD IS NOT THEORETICAL HERE. scripts/record-reel.mts has a comment
 * about an init script that was transpiled on its way in and failed with
 * "__name is not defined" before its first line ran, surfacing one step later
 * as an unrelated-looking "window.__reelHook is not a function". The function
 * above was checked against exactly that: it serialises to plain ES5-shaped
 * source with no helper references, which is why this approach is available
 * at all.
 *
 * NOTHING BLOCKS ON THE RESULT. The loop stamps a number on `window` and the
 * recorder reads it after the beat is over. A measurement that made the
 * recording wait would change the thing it is measuring, which is how two of
 * the three previous attempts at this went wrong.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function observerSource(): string {
  return `(() => {
  var PAINT_TIMEOUT_MS = ${PAINT_TIMEOUT_MS};
  var MIN_PAINTED_CHARS = ${MIN_PAINTED_CHARS};
  var SKELETON_GRACE_MS = ${SKELETON_GRACE_MS};
  var SKELETON_MIN_PX = ${SKELETON_MIN_PX};
  var step = ${paintStep.toString()};

  var out = { ms: null, sawSkeleton: false, gaveUp: false };
  window.__reelPaint = out;
  var memory = ${JSON.stringify(NOTHING_SEEN)};

  function skeletons() {
    var n = 0;
    var all = document.querySelectorAll(".animate-pulse");
    for (var i = 0; i < all.length; i++) {
      var r = all[i].getBoundingClientRect();
      if (r.width >= SKELETON_MIN_PX && r.height >= SKELETON_MIN_PX) n++;
    }
    return n;
  }

  function tick() {
    if (out.ms !== null || out.gaveUp) return;
    var body = document.body;
    var result = step(memory, {
      skeletons: skeletons(),
      textLength: body ? (body.innerText || "").trim().length : 0,
      sinceMs: performance.now()
    });
    memory = result.memory;
    out.sawSkeleton = memory.sawSkeleton;
    if (result.verdict === "painted") { out.ms = result.at; return; }
    if (result.verdict === "gave-up") { out.gaveUp = true; return; }
    requestAnimationFrame(tick);
  }

  // rAF rather than an interval: it is free when the tab is busy painting,
  // which is precisely when this is running, and it stops the moment the
  // answer is known rather than leaving a timer alive for the whole recording.
  requestAnimationFrame(tick);
})();`;
}

/** What the observer inside the page reports back for one navigation. */
export interface Paint {
  route: string;
  /** Milliseconds from navigation to the screen being real. Null if it never was. */
  ms: number | null;
  /** True when the route showed a skeleton, ie. it is a data route. */
  hadSkeleton: boolean;
}

/**
 * How much of a beat happens before its screen exists.
 *
 * TWO NUMBERS, BECAUSE THEY ARE TWO DIFFERENT COMPLAINTS. `blackMs` is how
 * long the viewer looks at a loading screen. `spokenBlindMs` is how much of
 * the narration is delivered over it — a line about a number, playing while
 * the number is a grey rectangle.
 *
 * The second is the one that matters and is always the smaller: a beat opens
 * with LEAD_MS of silence before the first word, so a short paint is absorbed
 * entirely and costs nothing. That is exactly why the fix is not obvious, and
 * why counting only the black frames overstates it.
 */
export interface BlindBeat {
  index: number;
  route: string;
  blackMs: number;
  spokenBlindMs: number;
  /** All the narration in this beat, so the share can be read off. */
  spokenMs: number;
}

export function blindBeat(step: PlanStep, paintMs: number): BlindBeat {
  const paint = Math.max(0, paintMs);
  const clips = step.clips ?? [];
  let spokenBlind = 0;
  let spoken = 0;
  for (const clip of clips) {
    spoken += clip.ms;
    // The clip's place is measured from the start of the beat, and so is the
    // paint, because the recorder navigates as the beat opens.
    const overlap = Math.min(clip.atMs + clip.ms, paint) - clip.atMs;
    if (overlap > 0) spokenBlind += overlap;
  }
  return {
    index: step.index,
    route: step.route,
    blackMs: Math.min(paint, step.ms),
    spokenBlindMs: Math.round(spokenBlind),
    spokenMs: Math.round(spoken),
  };
}

/**
 * Every beat that opens on a route it just navigated to, with what it cost.
 *
 * ONLY BEATS THAT CHANGE ROUTE. The recorder navigates when `step.route`
 * differs from the previous beat's and not otherwise — three consecutive beats
 * on one screen navigate once — so a beat that inherited an already-painted
 * screen has no paint to wait for and is not a finding.
 */
export function blindBeats(plan: ReelPlan, paints: readonly Paint[]): BlindBeat[] {
  const byRoute = new Map<string, Paint[]>();
  for (const paint of paints) byRoute.set(paint.route, [...(byRoute.get(paint.route) ?? []), paint]);
  const taken = new Map<string, number>();

  const out: BlindBeat[] = [];
  let onRoute: string | null = null;
  for (const step of plan.steps ?? []) {
    const changed = step.route !== onRoute;
    onRoute = step.route;
    if (!changed) continue;

    // Routes can be visited more than once in a reel and the second visit is
    // warm. Taking them in order keeps each beat with its own measurement
    // rather than with the first one recorded for that path.
    const n = taken.get(step.route) ?? 0;
    taken.set(step.route, n + 1);
    const paint = (byRoute.get(step.route) ?? [])[n];
    if (!paint || paint.ms === null) continue;
    out.push(blindBeat(step, paint.ms));
  }
  return out;
}

const ms = (n: number) => `${(n / 1000).toFixed(2)}s`;

/**
 * The report, written for whoever has to make the decision this refuses to.
 *
 * It leads with the comparison against DATA_ROUTE_PAINT_MS, because that
 * constant is the project's current belief and the first useful thing a
 * measurement can do is say whether the belief is right. Until now nothing
 * read that constant at all — it was declared, documented as a standard, and
 * referenced by nothing, which is how it came to be a rule that had never been
 * applied.
 */
export function paintReport(plan: ReelPlan, paints: readonly Paint[]): string[] {
  const lines: string[] = [];
  const measured = paints.filter((p) => p.ms !== null);
  if (!measured.length) {
    return ["No route painted inside the timeout, so there is nothing to report."];
  }

  lines.push("Route paint, measured on this run:");
  for (const paint of paints) {
    const kind = paint.hadSkeleton ? "data" : "static";
    lines.push(paint.ms === null
      ? `  ${paint.route.padEnd(24)} never painted inside ${ms(PAINT_TIMEOUT_MS)} (${kind})`
      : `  ${paint.route.padEnd(24)} ${ms(paint.ms).padStart(6)}  (${kind})`);
  }

  const data = measured.filter((p) => p.hadSkeleton);
  if (data.length) {
    const worst = Math.max(...data.map((p) => p.ms as number));
    const mean = Math.round(data.reduce((t, p) => t + (p.ms as number), 0) / data.length);
    lines.push("");
    lines.push(`Data routes: ${data.length}, worst ${ms(worst)}, mean ${ms(mean)}.`);
    /**
     * The constant is the belief. Saying which way it is wrong is more useful
     * than saying that it is, because too HIGH means beats are holding for
     * time they did not need and too LOW means they are talking over a
     * loading screen — opposite fixes.
     */
    const verdict = worst > DATA_ROUTE_PAINT_MS
      ? `above DATA_ROUTE_PAINT_MS (${ms(DATA_ROUTE_PAINT_MS)}), so a beat holding for it still speaks early`
      : `inside DATA_ROUTE_PAINT_MS (${ms(DATA_ROUTE_PAINT_MS)}), so the constant is not too small`;
    lines.push(`The worst is ${verdict}.`);
  }

  const blind = blindBeats(plan, paints).filter((b) => b.spokenBlindMs > 0 || b.blackMs > 0);
  lines.push("");
  if (!blind.length) {
    lines.push("No beat speaks before its screen exists.");
    return lines;
  }

  lines.push("Beats that open on a screen that is not there yet:");
  for (const beat of blind) {
    const share = beat.spokenMs > 0 ? ` (${Math.round((beat.spokenBlindMs / beat.spokenMs) * 100)}% of its narration)` : "";
    lines.push(
      `  beat ${beat.index} on ${beat.route}: ${ms(beat.blackMs)} of loading screen`
      + (beat.spokenBlindMs > 0 ? `, ${ms(beat.spokenBlindMs)} of it spoken over${share}` : ", none of it spoken over"),
    );
  }

  const spoken = blind.reduce((t, b) => t + b.spokenBlindMs, 0);
  lines.push("");
  lines.push(spoken > 0
    ? `${ms(spoken)} of narration in this reel plays over a loading screen.`
    : "Every loading screen in this reel is covered by the silence between beats.");
  return lines;
}
