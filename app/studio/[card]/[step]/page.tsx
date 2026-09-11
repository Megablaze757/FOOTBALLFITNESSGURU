import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cardById, contentCards, CARD_STAGES } from "@/lib/content-cards";

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
    <main className="flex min-h-screen flex-col justify-center gap-5 px-6 py-10">
      {shown.map((face, i) => (
        <section key={i} className="card px-6 py-8 text-center">
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
          <p className="mt-2 text-[76px] font-extrabold leading-none tracking-tight">
            {face.figure}
          </p>
          <p className="mt-3 text-xl font-semibold text-slate-400">{face.caption}</p>
        </section>
      ))}
      {stage === CARD_STAGES && (
        <p className="px-2 text-center text-base text-slate-400">{card.footer}</p>
      )}
    </main>
  );
}
