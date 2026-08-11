/**
 * The app's own icon set.
 *
 * WHY NOT EMOJI, which is what these replace in 300-odd places:
 *
 *  - They are a different picture on every device. Apple, Google, Samsung and
 *    Windows each draw their own, so the screen you designed is not the screen
 *    most people see, and you cannot check it from your own phone.
 *  - They ignore the theme. This app has a calibrated palette down to measured
 *    contrast ratios, and a full-colour bitmap glyph sits on top of it taking
 *    none of it — it cannot inherit a colour, dim for a disabled state, or go
 *    red when something is wrong.
 *  - They sit on a different optical grid from a 2px stroked line icon, so a
 *    row mixing the two never quite lines up. The tab bar was already a proper
 *    SVG set; the tiles directly above it were emoji.
 *  - Several were rendering wrong outright. An emoji in the older Unicode
 *    blocks needs a U+FE0F variation selector to be drawn in colour; without
 *    it many platforms fall back to a monochrome TEXT glyph. 31 in this
 *    codebase were missing it, including every trend arrow on Progress.
 *
 * WHY NOT A FREE ICON LIBRARY. Lucide and Feather are MIT and would be fine
 * legally, but the point of the request was to look like nobody else, and every
 * fitness app on the store uses those exact glyphs. This is also a static
 * export where the whole shared bundle is 87 kB — adding an icon package to use
 * twenty glyphs is a poor trade. These are drawn here, so there is no licence
 * to honour and no dependency to keep up to date.
 *
 * HOUSE STYLE, matched to components/nav-items.tsx so the two sets read as one:
 * 24x24 box, no fill, 2px stroke, round caps and joins, `currentColor` so an
 * icon takes the colour of whatever it sits in.
 *
 * Decorative by default: `aria-hidden` unless given a `title`. These sit beside
 * a text label almost everywhere, and a screen reader announcing "person
 * lifting weights, My plan" is worse than silence.
 */
export type IconName =
  | "barbell" | "book" | "video" | "plate" | "target" | "chart" | "plaster"
  | "squad" | "stretch" | "flame" | "trophy" | "bolt" | "warning" | "run"
  | "ball" | "brain" | "watch" | "leg" | "trend-up" | "trend-down" | "check"
  | "clock" | "scales" | "sleep";

const PATHS: Record<IconName, React.ReactNode> = {
  // A loaded bar, read end-on: two plates each side of a knurled shaft.
  barbell: <><path d="M3 9v6M6 7v10M18 7v10M21 9v6" /><path d="M6 12h12" /></>,
  book: <><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v14H5.5A1.5 1.5 0 0 0 4 18.5Z" /><path d="M4 18.5A1.5 1.5 0 0 0 5.5 20H19v-3" /><path d="M8 7h7" /></>,
  video: <><rect x="2.5" y="6" width="13" height="12" rx="2.5" /><path d="m15.5 12 6-3.5v11l-6-3.5Z" /></>,
  // A plate with a fork and knife, rather than a full dinner service.
  plate: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="0.8" /></>,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="m7 15 3.5-4 3 2.5L19 7" /></>,
  // A plaster on the diagonal. Reads as "something hurts" faster than a cross.
  plaster: <><rect x="2.6" y="8.5" width="18.8" height="7" rx="3.5" transform="rotate(-35 12 12)" /><path d="m10.4 10.4 3.2 3.2M13.6 10.4l-3.2 3.2" /></>,
  squad: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20v-1.5A4.5 4.5 0 0 1 7.5 14h3a4.5 4.5 0 0 1 4.5 4.5V20" /><path d="M16 5.5a3.2 3.2 0 0 1 0 6M18 14h.5a4.5 4.5 0 0 1 4.5 4.5V20" /></>,
  // A figure mid-stretch — one arm overhead, one leg extended.
  stretch: <><circle cx="12" cy="4.2" r="2" /><path d="M12 7v6" /><path d="M12 8.5 8 6M12 8.5l4-3.5" /><path d="m12 13-3 8M12 13l3.5 8" /></>,
  flame: <><path d="M12 21c3.3 0 6-2.4 6-5.5 0-4-3-5.5-3-9C13 8 12 9.8 12 11c-1.2-1-1.5-2.6-1.5-4C8 9 6 11.6 6 15.5 6 18.6 8.7 21 12 21Z" /></>,
  trophy: <><path d="M8 4h8v4a4 4 0 0 1-8 0Z" /><path d="M8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3" /><path d="M12 12v4M9 20h6M10 20l.5-4M14 20l-.5-4" /></>,
  bolt: <><path d="M13 2 5 13h6l-1 9 8-11h-6Z" /></>,
  warning: <><path d="M12 3.5 21 19H3Z" /><path d="M12 9.5v4.5M12 16.6v.2" /></>,
  // A runner: head, driving arm, split legs.
  run: <><circle cx="14.5" cy="4.5" r="2" /><path d="M13 8.5 9.5 11l2 3.5" /><path d="m13 8.5 3.5 2 1 3.5" /><path d="m11.5 14.5-2 6M11.5 14.5l4 2 1 4.5" /><path d="M4 10h3" /></>,
  ball: <><circle cx="12" cy="12" r="8.5" /><path d="m12 7.5 3.2 2.4-1.2 3.8h-4l-1.2-3.8Z" /><path d="M12 3.5v4M19.8 9.4l-3.6 2.7M16 20.2l-2-4.5M8 20.2l2-4.5M4.2 9.4l3.6 2.7" /></>,
  brain: <><path d="M12 5.5a3 3 0 0 0-5.7 1.3A3 3 0 0 0 5 12a3 3 0 0 0 1.7 4.6A3 3 0 0 0 12 18.5Z" /><path d="M12 5.5a3 3 0 0 1 5.7 1.3A3 3 0 0 1 19 12a3 3 0 0 1-1.7 4.6A3 3 0 0 1 12 18.5Z" /><path d="M12 5.5v13" /></>,
  watch: <><rect x="6.5" y="6.5" width="11" height="11" rx="3" /><path d="M9 6.5 9.5 3h5l.5 3.5M9 17.5l.5 3.5h5l.5-3.5" /><path d="M12 10v2.2l1.5 1" /></>,
  // A leg: hip, knee, ankle. Used wherever the app talks about lower-body load.
  leg: <><path d="M10 3v6.5l-2.5 5" /><path d="M10 9.5 14 13l-1 5" /><path d="M6 20h4M11.5 20h4" /></>,
  "trend-up": <><path d="M4 17 10 11l3.5 3L20 7" /><path d="M20 12V7h-5" /></>,
  "trend-down": <><path d="M4 7l6 6 3.5-3L20 17" /><path d="M20 12v5h-5" /></>,
  check: <><path d="m4 12.5 5.5 5.5L20 6.5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.2l3.2 2" /></>,
  scales: <><path d="M12 4v16" /><path d="M5 8h14" /><path d="M5 8 2.5 14a3.2 3.2 0 0 0 5 0Z" /><path d="M19 8l-2.5 6a3.2 3.2 0 0 0 5 0Z" /></>,
  sleep: <><path d="M19 14.5A8 8 0 0 1 9.5 5a8.2 8.2 0 1 0 9.5 9.5Z" /><path d="M15 4h4l-4 4h4" /></>,
};

export function Icon({
  name,
  size = 22,
  className = "",
  title,
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  className?: string;
  /** Give one only when the icon is the ONLY thing conveying the meaning. */
  title?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {PATHS[name]}
    </svg>
  );
}
