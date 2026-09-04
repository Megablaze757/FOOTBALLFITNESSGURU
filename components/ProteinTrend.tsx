import { history, latest, changeSince, chartPoints, MIN_POINTS } from "@/lib/protein-history";
import { money, REFERENCE_PROTEIN } from "@/lib/protein-index";

const W = 720;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 44 };

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A NUMBER IS A PAGE. A NUMBER WITH A HISTORY IS A REFERENCE.
 *
 * The index answers "what is the cheapest 30g of protein" from real shelf
 * prices, which nobody can copy without doing the same work. But a single
 * figure is read once. "31p, up from 27p in March" is quoted, linked to, and
 * checked again — and food prices are something people already follow.
 *
 * AN SVG DRAWN BY HAND, not a chart library. It is six numbers on a static
 * page; a charting dependency would be more code than the page and would need
 * JavaScript to draw something that is identical for every visitor. This is in
 * the HTML that arrives, which is also the only version a crawler sees.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function ProteinTrend() {
  const points = chartPoints("cheapest");
  const change = changeSince("cheapest");
  const now = latest();
  const all = history();
  if (!now) return null;

  return (
    <section className="mt-12">
      <h2 className="text-2xl font-extrabold tracking-tight">Tracked over time</h2>

      {points ? (
        <>
          <p className="mt-2 max-w-2xl text-slate-400">
            {REFERENCE_PROTEIN}g of protein from the cheapest qualifying food, at every reading since{" "}
            {longDate(all[0].date)}.{" "}
            {change && change.direction !== "flat" && (
              <>
                It is <b className="text-slate-200">
                  {Math.abs(change.pence)}p {change.direction}
                </b>{" "}
                on the first reading — {change.percent > 0 ? "+" : ""}{change.percent}%.
              </>
            )}
          </p>
          <div className="mt-5 overflow-x-auto">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="h-auto w-full min-w-[420px]"
              role="img"
              aria-label={
                `Cost of ${REFERENCE_PROTEIN}g of protein from the cheapest food, `
                + all.map((s) => `${longDate(s.date)}: ${money(s.cheapest)}`).join("; ")
              }
            >
              <Axis top={topOf(all.map((s) => s.cheapest))} />
              <polyline
                fill="none"
                // stroke-accent-400, not an inline var(--accent). There is no
                // --accent token — only --accent-400 and friends, and they hold
                // space-separated RGB triples — so `var(--accent, #4ade80)`
                // silently fell through to a green that is not this app's
                // colour, in both themes, with nothing to notice. The utility
                // goes through the same tailwind mapping as every other colour
                // here and follows the light theme's darker gold.
                className="stroke-accent-400"
                strokeWidth={2.5}
                strokeLinejoin="round"
                points={points.map((p) => `${px(p.x)},${py(p.y)}`).join(" ")}
              />
              {points.map((p) => (
                <g key={p.date}>
                  <circle cx={px(p.x)} cy={py(p.y)} r={4} className="fill-accent-400" />
                  <text
                    x={px(p.x)} y={H - 8} textAnchor="middle"
                    className="fill-slate-500" fontSize={11}
                  >
                    {shortDate(p.date)}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </>
      ) : (
        /* ═══════════════════════════════════════════════════════════════════
           WHAT IT IS DOING, RATHER THAN A LINE IT CANNOT DRAW.

           There is no way to know what these foods cost last year — the prices
           live in one file and each edit overwrites the last. Drawing a flat
           line back to January would imply a year of stability nobody
           measured, on a page whose entire value is that its numbers are real.
           ═══════════════════════════════════════════════════════════════════ */
        <p className="mt-2 max-w-2xl text-slate-400">
          Readings start {longDate(all[0].date)}, at {money(now.cheapest)} for{" "}
          {REFERENCE_PROTEIN}g from {now.cheapestName.toLowerCase()}. A chart appears here once
          there are {MIN_POINTS} — the history is recorded as prices change rather than
          reconstructed afterwards, so it starts the day it starts.
        </p>
      )}

      <dl className="mt-6 grid gap-3 sm:grid-cols-3">
        <Fact label="Cheapest now" value={money(now.cheapest)} sub={now.cheapestName} />
        <Fact label="Middle of the list" value={money(now.median)} sub={`${now.count} foods qualify`} />
        <Fact label="Dearest" value={money(now.dearest)} sub={now.dearestName} />
      </dl>
    </section>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-white/10 p-4">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-2xl font-extrabold tracking-tight">{value}</dd>
      <dd className="mt-0.5 text-xs text-slate-500">{sub}</dd>
    </div>
  );
}

/** The same headroom chartPoints uses, so the labels and the line agree. */
function topOf(values: number[]): number {
  return Math.max(...values) * 1.15 || 1;
}

const px = (x: number) => PAD.left + x * (W - PAD.left - PAD.right);
const py = (y: number) => PAD.top + (1 - y) * (H - PAD.top - PAD.bottom);

/**
 * Four gridlines from ZERO.
 *
 * A price chart scaled to its own minimum turns a 2p move into a cliff, which
 * is the single most common way one misleads — and this page is published as a
 * reference for people who will not check the axis.
 */
function Axis({ top }: { top: number }) {
  const lines = [0, 0.25, 0.5, 0.75, 1];
  return (
    <g>
      {lines.map((f) => (
        <g key={f}>
          <line
            x1={PAD.left} x2={W - PAD.right} y1={py(f)} y2={py(f)}
            stroke="currentColor" strokeWidth={1} className="text-white/[0.07]"
          />
          <text
            x={PAD.left - 8} y={py(f) + 4} textAnchor="end"
            className="fill-slate-500" fontSize={11}
          >
            {money(top * f)}
          </text>
        </g>
      ))}
    </g>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Parsed as UTC, so a label never slips a day west of Greenwich. */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}

function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
