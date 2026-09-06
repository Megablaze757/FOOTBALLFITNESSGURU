/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CAROUSEL, WHICH IS A DIFFERENT JOB FROM A REEL.
 *
 * The reel's numbers said the reel was being skipped — and also that share
 * rate and SAVE rate were both 0.0%. Those are the two signals that carry a
 * post beyond the people who already follow, and a reel is a poor way to earn
 * either: nobody saves a video to look something up later.
 *
 * A ranked table of what 30g of protein costs in a UK supermarket is reference
 * material. Reference material is what gets saved, and a carousel is how you
 * post reference material: the reader sets their own pace, can go back, and
 * the saved post is still useful a week later in the shop.
 *
 * So this is not the reel's script as pictures. It is the LIST — the thing
 * worth keeping — with a hook in front of it and one ask at the end.
 *
 * Pure, because the interesting decisions are all about what goes on which
 * slide, and a rendered PNG is an expensive place to discover a bad one.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * 1080x1350 — 4:5, the tallest a feed post may be.
 *
 * Instagram crops anything taller. Taller is better: a 4:5 post occupies about
 * a quarter more of a phone screen than a square one, and how much screen a
 * post takes is how long it is looked at.
 */
export const SLIDE_W = 1080;
export const SLIDE_H = 1350;

/** The platform's ceiling. Nobody reaches the twentieth slide anyway. */
export const MAX_SLIDES = 10;

/**
 * Rows per list slide.
 *
 * Eight at this size leaves a row about 90px tall, which is readable in the
 * feed at a glance. More rows means smaller type, and a table nobody can read
 * without opening the image is a table nobody saves.
 */
export const ROWS_PER_SLIDE = 8;

export interface Row {
  rank: number;
  name: string;
  /** Already formatted — "£0.31". */
  cost: string;
  /** "120g" — how much of the food that takes. */
  portion: string;
}

export type Slide =
  | { kind: "hook"; headline: string; sub: string; swipe: string }
  | { kind: "list"; title: string; note: string; rows: Row[] }
  | { kind: "cta"; headline: string; sub: string; action: string };

export interface CarouselInput {
  /** Every ranked row, cheapest first. */
  rows: Row[];
  /** "10x", from the real spread. */
  spread: string;
  cheapestName: string;
  cheapestCost: string;
  dearestCost: string;
}

/**
 * The slides, in order.
 *
 * SLIDE ONE IS A THUMBNAIL FIRST and a slide second — it is what appears in
 * the feed, and it is the only one most people ever see. It carries the
 * contrast and an explicit swipe cue, because a carousel that does not look
 * like a carousel is read as a single image.
 *
 * THE LAST SLIDE ASKS FOR THE SAVE. Save rate was 0.0%, and the single
 * best-evidenced way to raise it is to ask — people do not think of saving a
 * post unless the post mentions that it is worth keeping.
 */
export function carouselSlides(input: CarouselInput): Slide[] {
  const rows = input.rows.slice();
  if (rows.length === 0) return [];

  const slides: Slide[] = [
    {
      kind: "hook",
      headline: `Same protein.\n${input.spread} the price.`,
      sub: `What 30g of protein costs in a UK supermarket — all ${rows.length} foods, ranked.`,
      swipe: "Swipe →",
    },
  ];

  /**
   * How many list slides there is room for, once the hook and the CTA have
   * taken one each. Truncating the LIST is right and truncating the ask is
   * not: a carousel that runs out of slides before the CTA is a post that did
   * all the work and never said where to go.
   */
  const roomForLists = MAX_SLIDES - 2;
  const chunks: Row[][] = [];
  for (let i = 0; i < rows.length && chunks.length < roomForLists; i += ROWS_PER_SLIDE) {
    chunks.push(rows.slice(i, i + ROWS_PER_SLIDE));
  }

  const shown = chunks.reduce((n, c) => n + c.length, 0);
  chunks.forEach((chunk, i) => {
    slides.push({
      kind: "list",
      title: i === 0 ? "Cheapest first" : `${chunk[0].rank}–${chunk[chunk.length - 1].rank}`,
      // The unit is stated once per slide rather than in every row: repeating
      // "for 30g of protein" 23 times is 23 chances to stop reading.
      note: i === 0 ? "Cost of 30g of protein, and how much you'd eat" : "",
      rows: chunk,
    });
  });

  slides.push({
    kind: "cta",
    headline: "Save this for your next shop.",
    sub: shown < rows.length
      ? `All ${rows.length} foods, priced from real pack sizes, are free on the site.`
      : `Every recipe is costed the same way, from real pack sizes.`,
    action: "PocketAthlete — sign up for free today",
  });

  return slides;
}
