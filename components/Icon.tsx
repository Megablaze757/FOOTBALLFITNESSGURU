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
  | "clock" | "scales" | "sleep"
  // Second batch, covering the rest of the head of the emoji distribution.
  | "muscle" | "hourglass" | "clipboard" | "ruler" | "camera" | "document"
  | "note" | "person" | "building" | "medal" | "basketball" | "rugby"
  | "signal" | "calendar" | "chat" | "droplet" | "lock" | "pan" | "confetti"
  | "swimmer" | "bike" | "shield"
  // Third batch: the guides and the programme templates. Body areas are their
  // own icons because "🦵" was doing knee AND calf, and a rehab page that shows
  // the same picture for two different injuries is worse than no picture.
  | "bowl" | "snack" | "shake" | "walk" | "bath" | "foot" | "knee" | "hamstring"
  | "spine" | "shoulder" | "hip" | "lungs" | "impact" | "battery" | "jump"
  | "split" | "dumbbell";

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

  // A flexed arm, read as the outline the emoji is famous for — shoulder,
  // biceps peak, forearm — without the skin tone the emoji forces on you.
  muscle: <><path d="M4 16.5V13a4 4 0 0 1 4-4h3.5" /><path d="M11.5 9a5 5 0 0 1 5-5 3.5 3.5 0 0 1 3.5 3.5c0 4-2.5 5.5-2.5 8A4.5 4.5 0 0 1 13 20H8a4 4 0 0 1-4-3.5" /><path d="M11.5 9v3.5" /></>,
  hourglass: <><path d="M7 3h10M7 21h10" /><path d="M8 3v3.5L12 11l4-4.5V3M8 21v-3.5L12 13l4 4.5V21" /></>,
  clipboard: <><rect x="5" y="4.5" width="14" height="16" rx="2" /><path d="M9 4.5a3 3 0 0 1 6 0" /><path d="M9 11h6M9 15h4" /></>,
  ruler: <><rect x="2.5" y="8" width="19" height="8" rx="1.5" transform="rotate(-20 12 12)" /><path d="m8.2 8.2 1 2.6M11.6 6.9l1 2.6M15 5.7l1 2.6" /></>,
  camera: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><circle cx="12" cy="13.5" r="3.5" /><path d="M8.5 7 10 4h4l1.5 3" /></>,
  document: <><path d="M6 3h7l5 5v13H6Z" /><path d="M13 3v5h5" /><path d="M9 13h6M9 17h4" /></>,
  note: <><path d="M4 20.5 4.8 16 16 4.8a2 2 0 0 1 3 3L7.8 19Z" /><path d="M14 6.5 17.5 10" /></>,
  person: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  building: <><path d="M4 21V6.5L12 3l8 3.5V21" /><path d="M2.5 21h19" /><path d="M9 21v-5h6v5" /><path d="M9 10h.01M15 10h.01" /></>,
  // A medal on a ribbon. One icon for all three places, coloured by the caller
  // — which is the whole advantage over three separate emoji.
  medal: <><circle cx="12" cy="14.5" r="5.5" /><path d="M8.5 9.4 6 2h5l2 4.5M15.5 9.4 18 2h-5" /><path d="M12 12.2v4.6" /></>,
  basketball: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5v17" /><path d="M6 5.8c2.6 2.4 2.6 10 0 12.4M18 5.8c-2.6 2.4-2.6 10 0 12.4" /></>,
  rugby: <><ellipse cx="12" cy="12" rx="9" ry="6" transform="rotate(-40 12 12)" /><path d="m9 15 6-6" /><path d="m10.4 11.4 1.4 1.4M12.2 9.6l1.4 1.4" /></>,
  signal: <><path d="M12 20v-6" /><circle cx="12" cy="11.5" r="1.6" /><path d="M8.2 7.7a5.5 5.5 0 0 0 0 7.6M15.8 7.7a5.5 5.5 0 0 1 0 7.6" /><path d="M5.4 4.9a9.5 9.5 0 0 0 0 13.2M18.6 4.9a9.5 9.5 0 0 1 0 13.2" /></>,
  calendar: <><rect x="3.5" y="5.5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3.5v4M16 3.5v4" /></>,
  chat: <><path d="M20 15.5a2.5 2.5 0 0 1-2.5 2.5H8l-4 3V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5Z" /><path d="M8.5 9h7M8.5 13h4" /></>,
  droplet: <><path d="M12 3s6 6.4 6 10.2A6 6 0 0 1 6 13.2C6 9.4 12 3 12 3Z" /></>,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" /><path d="M12 14.5v2" /></>,
  pan: <><ellipse cx="10" cy="13" rx="7" ry="5" /><path d="M17 13h4.5" /><path d="M10 8V5.5" /></>,
  // Three streamers, not a party popper — it has to read at 16px.
  confetti: <><path d="M4 20.5 8.5 8l7.5 7.5Z" /><path d="M14 4.5v2M18.5 6l-1.4 1.4M20 11h-2" /><path d="M11 11.5 12.5 13" /></>,
  swimmer: <><circle cx="16" cy="6.5" r="1.9" /><path d="m5 11 4.5-2.5L13 11l2.5-2" /><path d="M2.5 17c1.6 0 1.6 1.5 3.2 1.5S7.3 17 8.9 17s1.6 1.5 3.2 1.5S13.7 17 15.3 17s1.6 1.5 3.2 1.5S20.1 17 21.7 17" /></>,
  bike: <><circle cx="5.5" cy="17" r="3.5" /><circle cx="18.5" cy="17" r="3.5" /><path d="m5.5 17 4-8h5l-3 8h7" /><path d="M13 5.5h3" /></>,
  shield: <><path d="M12 3 4.5 6v6c0 4.4 3.1 7.9 7.5 9 4.4-1.1 7.5-4.6 7.5-9V6Z" /></>,

  // --- Fuel timeline ---------------------------------------------------------
  bowl: <><path d="M3 11h18a9 9 0 0 1-9 9 9 9 0 0 1-9-9Z" /><path d="M8.5 7.5c0-1.5 1.2-2 1.2-3M12 7c0-1.8 1.4-2.4 1.4-3.6M15.5 7.5c0-1.2 1-1.7 1-2.6" /></>,
  // A piece of fruit, not a specific one — this slot is "small snack".
  snack: <><path d="M12 8.5c-3.2-2.4-7 .4-7 4.3 0 3.4 2.9 7.2 5.4 7.2.9 0 1.1-.5 1.6-.5s.7.5 1.6.5c2.5 0 5.4-3.8 5.4-7.2 0-3.9-3.8-6.7-7-4.3Z" /><path d="M12 8.5V5.5M12 5.5c1.6 0 2.6-1 2.8-2.5-1.6-.2-2.8.8-2.8 2.5Z" /></>,
  shake: <><path d="M7 8h10l-1 12.5a1.5 1.5 0 0 1-1.5 1.4h-5A1.5 1.5 0 0 1 8 20.5Z" /><path d="M6.5 8 8 3.5h8L17.5 8" /><path d="M12 3.5V8" /></>,
  // --- Recovery --------------------------------------------------------------
  walk: <><circle cx="13" cy="4" r="2" /><path d="m11 8 3.5 2 .5 4" /><path d="M14.5 14 17 20M14.5 14l-4 2.5L9 21" /><path d="m11 8-3 2.5" /></>,
  bath: <><path d="M3.5 12h17v3.5a4 4 0 0 1-4 4h-9a4 4 0 0 1-4-4Z" /><path d="M6 12V5.8A2.3 2.3 0 0 1 10.3 5" /><path d="M6.5 21l-1 1.5M17.5 21l1 1.5" /></>,
  // --- Body areas. One picture per area, which is the point. ------------------
  foot: <><path d="M8 4.5c3.5 0 5.5 2.5 5.5 6 0 2.2-.6 3.3-.6 5 0 2.2 1.4 3 1.4 4.5s-1.6 2.5-4 2.5-4.3-1.4-4.3-3.6c0-3.4.8-4.4.8-7.4 0-2.6-1-4-1-5.4 0-1 .8-1.6 2.2-1.6Z" /></>,
  knee: <><path d="M9 3v5.5c0 2 1.5 2.8 3 4" /><circle cx="13.5" cy="12.5" r="3" /><path d="M13.5 15.5c-1 2-1.5 3.5-1.5 5.5" /></>,
  hamstring: <><path d="M8 3.5c2.6 0 4 1.8 4 4.4 0 3-1.4 4.4-1.4 7 0 2.4 1.4 3.6 1.4 5.6" /><path d="M12 8.5c2 .4 3.4 1.6 3.8 3.4M11.6 14.5c2.2.3 3.6 1.4 4.2 3" /></>,
  spine: <><path d="M12 3v18" /><path d="M9 5.5h6M8.5 9h7M8.5 12.5h7M9 16h6M10 19h4" /></>,
  shoulder: <><circle cx="9" cy="7" r="3" /><path d="M5 20v-3a4 4 0 0 1 4-4h1.5" /><path d="M11.5 13c3 0 5 1.6 6.5 4M14 9.5c2.4 0 4 1 5 2.5" /></>,
  hip: <><path d="M6 4v5.5A3.5 3.5 0 0 0 9.5 13h5A3.5 3.5 0 0 0 18 9.5V4" /><path d="M9.5 13 8 21M14.5 13l1.5 8" /></>,
  // --- Programme templates ---------------------------------------------------
  lungs: <><path d="M12 3v9" /><path d="M12 8c-1-2.5-2.5-3.5-4-3.5S5 6 5 9.5c0 4 .8 6.5 1.6 8 .6 1.2 2.4 1.2 3.2 0 .8-1.2 2.2-3.6 2.2-6.5" /><path d="M12 8c1-2.5 2.5-3.5 4-3.5S19 6 19 9.5c0 4-.8 6.5-1.6 8-.6 1.2-2.4 1.2-3.2 0-.8-1.2-2.2-3.6-2.2-6.5" /></>,
  impact: <><path d="m12 2 2.2 5.2L20 6l-3 4.6L21 15l-5.6.3L14 21l-3.4-4.2L6 20l.6-5.4L2 12l5-2.3L5.5 4l5.3 2.4Z" /></>,
  battery: <><rect x="2.5" y="7" width="16" height="10" rx="2.5" /><path d="M21 10.5v3" /><path d="M6 10.5v3M9.5 10.5v3M13 10.5v3" /></>,
  jump: <><circle cx="12" cy="4" r="2" /><path d="M12 7v5" /><path d="m12 8-4-2.5M12 8l4-2.5" /><path d="m12 12-3 4M12 12l3 4" /><path d="M5.5 20h13" /></>,
  split: <><rect x="3" y="4" width="7" height="16" rx="1.6" /><rect x="14" y="4" width="7" height="16" rx="1.6" /></>,
  dumbbell: <><path d="M5 9v6M8 7.5v9M16 7.5v9M19 9v6" /><path d="M8 12h8" /></>,
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
