import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cardById, contentCards, CARD_STAGES } from "@/lib/content-cards";
import { FILMABLE_FRACTION } from "@/lib/safe-zone";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A PAGE THAT EXISTS TO BE FILMED, NOT READ.
 *
 * The recorder in scripts/record-reel.mts films a ROUTE. Nothing about it
 * requires that route to be the app — so the knowledge and comparison formats
 * are pages, and filming them inherits the voice, the caption sync measured to
 * the millisecond, the loudness chain and the upload without a line of it
 * being rebuilt.
 *
 * ONE ROUTE PER STAGE, which is the whole design. A single page with a ring
 * moving around it is the slideshow this project already abandoned, and
 * lib/reel-retention.ts says so: more than 60% of a reel on one route is "a
 * screenshot with captions over it, whatever its beats say". Three stages,
 * three routes, and the reveal is a cut.
 *
 * NOT INDEXED. These are render targets with no reader, and an exported route
 * that nobody disallows becomes an empty page competing with the homepage for
 * its own name — see public/robots.txt, which records that happening to three
 * routes already.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function generateStaticParams() {
  return contentCards().flatMap((c) =>
    Array.from({ length: CARD_STAGES }, (_, i) => ({ card: c.id, step: String(i + 1) })));
}

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** The biggest the figure is ever set, which suits a price. */
const FIGURE_MAX_PX = 104;

/**
 * How many characters fit at that size, measured rather than guessed: the
 * card's content box is 478px and this face runs about 0.478em a character,
 * so nine is the honest answer and "Exceptional" is eleven.
 */
const FIGURE_FITS_CHARS = 9;

function figurePx(figure: string): number {
  const length = figure.trim().length;
  if (length <= FIGURE_FITS_CHARS) return FIGURE_MAX_PX;
  return Math.floor((FIGURE_MAX_PX * FIGURE_FITS_CHARS) / length);
}

export default function StudioCard({ params }: { params: { card: string; step: string } }) {
  const card = cardById(params.card);
  const stage = Number(params.step);
  if (!card || !Number.isInteger(stage) || stage < 1 || stage > CARD_STAGES) notFound();

  /**
   * Stage one shows the first figure, stage two shows them all, stage three
   * adds the line that says why any of it is true. A comparison that shows
   * both sides at once has given the answer away in its first shot.
   */
  const shown = stage === 1 ? card.faces.slice(0, 1) : card.faces;

  return (
    /*
      ═══════════════════════════════════════════════════════════════════════
      FILLS THE PART OF THE FRAME THE CAPTION DOES NOT USE.

      The rule was right and the execution left a hole. Captions are drawn
      across the lower part of the frame — which is also where a platform puts
      the username, the description and the action buttons — so a card centred
      in the viewport puts its figure exactly where all of that lands. This
      answered that with `justify-start` and `pb-40`, which pinned the card to
      the TOP and left everything below it black.

      Filmed and measured: the card ran 48..257 of a 960px viewport and the
      caption began at 583, so 326px — a third of the frame — was empty. On a
      reel whose whole subject is one number, a third of the picture was
      nothing at all, and it read exactly like a page that had run out.

      FILMABLE_FRACTION is what the caption leaves, derived in lib/safe-zone.ts
      from the caption's own lift and line ceiling rather than guessed at here.
      The faces share it, so one face fills the band and three divide it, and
      the bottom of the last one still clears the words.
      ═══════════════════════════════════════════════════════════════════════
    */
    <main
      className="flex flex-col justify-center gap-4 px-4 pt-8"
      style={{ height: `${(FILMABLE_FRACTION * 100).toFixed(2)}vh` }}
    >
      {shown.map((face, i) => (
        <section key={i} className="card flex flex-1 flex-col justify-center px-4 py-6 text-center">
          {face.kicker && (
            <p className="text-sm font-semibold uppercase tracking-widest text-slate-400">
              {face.kicker}
            </p>
          )}
          {/*
            THE FIGURE IS THE PICTURE. Set to fill the frame rather than to sit
            in a paragraph — a number at this size is the thing a thumb stops
            for, and lib/content-cards.ts refuses a "figure" long enough to be
            a sentence precisely so this stays legible.
          */}
          {/*
            BIG ENOUGH TO BE THE PICTURE. 76px filled about a quarter of the
            frame's width and read as a number inside a layout rather than as
            the subject of the shot — which is the one thing this format is for.
            Sized against the 540px-wide viewport the recorder films at.
          */}
          {/*
            ═══════════════════════════════════════════════════════════════
            SIZED TO THE FIGURE, BECAUSE "Exceptional" IS NOT "£0.31".

            104px was chosen against a price and never checked against a
            word. Measured on the real page: "Exceptional" needs 547px of a
            478px card — 69px clipped — so the bodyweight-gap card reel
            showed "Exceptiona" as its entire subject, on both stages.

            cardProblems() already refuses a figure longer than three words,
            which catches prose and says nothing about width. One long word
            is still one word.
            ═══════════════════════════════════════════════════════════════
          */}
          <p
            className="mt-1 font-extrabold leading-[0.95] tracking-tighter"
            style={{ fontSize: `${figurePx(face.figure)}px` }}
          >
            {face.figure}
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-400">{face.caption}</p>
        </section>
      ))}
      {/*
        THE MIDDLE STAGE HAS TO SHOW SOMETHING NEW. A comparison reveals its
        second figure here; a knowledge card has only one, so without this its
        stage two was pixel-identical to stage one and the reel sat on an
        unchanging number for twenty-two seconds. Set large enough to be the
        reveal rather than a caption under it.
      */}
      {stage >= 2 && card.context && (
        <p className="shrink-0 px-2 text-center text-2xl font-bold leading-tight text-slate-200">
          {card.context}
        </p>
      )}
      {stage === CARD_STAGES && (
        <p className="shrink-0 px-2 text-center text-base text-slate-400">{card.footer}</p>
      )}
    </main>
  );
}
