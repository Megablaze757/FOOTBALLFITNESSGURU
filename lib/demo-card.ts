// =============================================================================
// App demo cards — a phone-framed screenshot of a real app screen, as a post.
//
// "Show it" is the strongest pre-launch content there is: a picture of the
// product doing the thing beats any claim about it. But taking, cropping and
// framing screenshots by hand is the sort of chore that quietly stops happening
// after week two.
//
// So the screens are drawn, not photographed — from the same numbers and copy
// the app itself would render. That means they can never drift into showing a
// feature that doesn't exist, and they never leak a real athlete's data, which
// a genuine screenshot very easily can.
// =============================================================================

import { sizeOf, type PostSize } from "./post-size";

const W = 1080;
const GOLD = "#e3b53f";
const INK = "#0a0a0b";
const GREEN = "#34d399";
const AMBER = "#fbbf24";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type DemoScreen = "readiness" | "program" | "checkin" | "nutrition";

export const DEMO_SCREENS: { id: DemoScreen; label: string; caption: string }[] = [
  { id: "readiness", label: "Readiness score", caption: "It knows you played 90 minutes yesterday." },
  { id: "program", label: "Today's session", caption: "Built for your position, not just your sport." },
  { id: "checkin", label: "Daily check-in", caption: "60 seconds. That's the whole ask." },
  { id: "nutrition", label: "Nutrition", caption: "One bag of rice. Three meals." },
];

export interface DemoCardOptions {
  /** Feed square, feed portrait or story. Width is 1080 either way. */
  size?: PostSize;
  screen: DemoScreen;
  headline?: string;
  handle?: string;
}

/** A phone chassis with the screen content drawn inside it. */
export function buildDemoCardSvg({ screen, headline, handle = "pocketathlete.com", size = "square" }: DemoCardOptions): string {
  const meta = DEMO_SCREENS.find((s) => s.id === screen)!;
  const title = headline ?? meta.caption;
  const { h: H } = sizeOf(size);

  /**
   * Phone geometry. Sized so the frame sits in the lower two thirds with room
   * for a headline above it — the layout that reads at thumbnail size.
   *
   * A taller canvas grows the PHONE rather than the margins: this card is a
   * screenshot of the product, and on a story the product should be bigger,
   * not floating in a field of background.
   */
  const scale = Math.min(1.5, H / 1080);
  const pw = Math.round(460 * scale), ph = Math.round(700 * scale);
  const px = Math.round((W - pw) / 2), py = Math.round(330 + (H - 1080) * 0.3);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#141416"/><stop offset="100%" stop-color="${INK}"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f6d365"/><stop offset="100%" stop-color="#c9962f"/>
    </linearGradient>
    <clipPath id="screen">
      <rect x="${px + 12}" y="${py + 12}" width="${pw - 24}" height="${ph - 24}" rx="36"/>
    </clipPath>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="8" fill="url(#gold)"/>

  ${headlineBlock(title)}

  <!-- Phone chassis -->
  <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="48" fill="#1c1c1f" stroke="#2f2f34" stroke-width="2"/>
  <rect x="${px + 12}" y="${py + 12}" width="${pw - 24}" height="${ph - 24}" rx="36" fill="${INK}"/>
  <g clip-path="url(#screen)">
    ${screenBody(screen, px + 12, py + 12, pw - 24)}
  </g>
  <!-- Notch -->
  <rect x="${px + pw / 2 - 55}" y="${py + 22}" width="110" height="26" rx="13" fill="#1c1c1f"/>

  <text x="72" y="${H - 52}" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700" fill="#8391a6">${esc(handle)}</text>
  <text x="${W - 72}" y="${H - 52}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800" fill="${GOLD}">PocketAthlete</text>
</svg>`;
}

function headlineBlock(text: string): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > 26 && line) { lines.push(line); line = w; } else { line = next; }
  }
  if (line) lines.push(line);

  let y = 150 - (lines.length - 1) * 30;
  return lines.slice(0, 3).map((l) =>
    `<text x="72" y="${y += 60}" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="800" fill="#ffffff">${esc(l)}</text>`
  ).join("\n  ");
}

/** Draws one app screen. Numbers are plausible and fixed — never a real user. */
function screenBody(screen: DemoScreen, x: number, y: number, w: number): string {
  const pad = 28;
  const cx = x + w / 2;
  const t = (yy: number, s: string, size: number, fill: string, weight = "400", anchor = "start", xx = x + pad) =>
    `<text x="${xx}" y="${yy}" text-anchor="${anchor}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(s)}</text>`;
  const card = (yy: number, h: number) =>
    `<rect x="${x + pad}" y="${yy}" width="${w - pad * 2}" height="${h}" rx="20" fill="#ffffff" fill-opacity="0.04" stroke="#ffffff" stroke-opacity="0.07"/>`;

  if (screen === "readiness") {
    const r = 92, ccy = y + 250;
    // 78% of the ring, drawn as a dash offset on a circle.
    const circ = 2 * Math.PI * r;
    return [
      t(y + 90, "Good morning, Sam", 30, "#e2e8f0", "800"),
      t(y + 124, "Tuesday · matchday −2", 20, "#8391a6"),
      `<circle cx="${cx}" cy="${ccy}" r="${r}" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="18"/>`,
      `<circle cx="${cx}" cy="${ccy}" r="${r}" fill="none" stroke="${AMBER}" stroke-width="18" stroke-linecap="round"
         stroke-dasharray="${circ * 0.72} ${circ}" transform="rotate(-90 ${cx} ${ccy})"/>`,
      t(ccy + 12, "72", 76, "#ffffff", "800", "middle", cx),
      t(ccy + 46, "MODERATE", 20, AMBER, "700", "middle", cx),
      card(y + 380, 128),
      t(y + 418, "Why it dropped", 22, GOLD, "700"),
      t(y + 452, "5h 20m sleep, and you played", 22, "#cbd5e1"),
      t(y + 480, "78 minutes yesterday.", 22, "#cbd5e1"),
      card(y + 528, 112),
      t(y + 566, "Today", 22, GOLD, "700"),
      t(y + 600, "Technical + mobility. The heavy", 22, "#cbd5e1"),
      t(y + 624, "lower session moves to Thursday.", 22, "#cbd5e1"),
    ].join("\n    ");
  }

  if (screen === "program") {
    const rows = [
      ["Back squat", "4 × 6 @ RPE 7"],
      ["Nordic curl", "3 × 5 slow"],
      ["Crossing off the dribble", "5 × 6 each side"],
      ["Pogo hops", "3 × 20s"],
    ];
    return [
      t(y + 90, "Week 2 · Build", 30, "#e2e8f0", "800"),
      t(y + 124, "Winger · Speed block", 20, "#8391a6"),
      ...rows.flatMap((r, i) => {
        const ry = y + 160 + i * 104;
        const isSkill = i === 2;
        return [
          card(ry, 88),
          t(ry + 38, r[0], 24, "#f1f5f9", "700"),
          t(ry + 68, r[1], 20, "#8391a6"),
          isSkill
            ? `<rect x="${x + w - pad - 96}" y="${ry + 22}" width="76" height="28" rx="14" fill="${GOLD}" fill-opacity="0.16"/>` +
              t(ry + 42, "SKILL", 16, GOLD, "700", "middle", x + w - pad - 58)
            : "",
        ];
      }),
      card(y + 590, 76),
      t(y + 638, "No leg machines — as you asked.", 22, GREEN),
    ].join("\n    ");
  }

  if (screen === "checkin") {
    return [
      t(y + 90, "How are you today?", 30, "#e2e8f0", "800"),
      t(y + 130, "SLEEP QUALITY", 18, "#8391a6", "700"),
      `<rect x="${x + pad}" y="${y + 150}" width="${w - pad * 2}" height="8" rx="4" fill="#ffffff" fill-opacity="0.1"/>`,
      `<rect x="${x + pad}" y="${y + 150}" width="${(w - pad * 2) * 0.55}" height="8" rx="4" fill="${GOLD}"/>`,
      `<circle cx="${x + pad + (w - pad * 2) * 0.55}" cy="${y + 154}" r="16" fill="${GOLD}"/>`,
      t(y + 216, "FATIGUE", 18, "#8391a6", "700"),
      `<rect x="${x + pad}" y="${y + 236}" width="${w - pad * 2}" height="8" rx="4" fill="#ffffff" fill-opacity="0.1"/>`,
      `<rect x="${x + pad}" y="${y + 236}" width="${(w - pad * 2) * 0.7}" height="8" rx="4" fill="${GOLD}"/>`,
      `<circle cx="${x + pad + (w - pad * 2) * 0.7}" cy="${y + 240}" r="16" fill="${GOLD}"/>`,
      t(y + 300, "WHERE DOES IT HURT?", 18, "#8391a6", "700"),
      // Simple body outline with one sore spot.
      `<rect x="${cx - 46}" y="${y + 326}" width="92" height="150" rx="30" fill="#ffffff" fill-opacity="0.05"/>`,
      `<circle cx="${cx}" cy="${y + 306}" r="26" fill="#ffffff" fill-opacity="0.05"/>`,
      `<rect x="${cx - 40}" y="${y + 482}" width="32" height="130" rx="16" fill="#ffffff" fill-opacity="0.05"/>`,
      `<rect x="${cx + 8}" y="${y + 482}" width="32" height="130" rx="16" fill="#fb5d6b" fill-opacity="0.5"/>`,
      `<circle cx="${cx + 24}" cy="${y + 530}" r="22" fill="#fb5d6b" fill-opacity="0.35"/>`,
      t(y + 648, "Right hamstring · 4/10", 22, "#fb5d6b", "700", "middle", cx),
    ].join("\n    ");
  }

  // nutrition
  const items = [
    ["Rice, 1kg bag", "covers 3 meals", "£1.45"],
    ["Chicken thighs, 1kg", "covers 4 meals", "£4.90"],
    ["Frozen veg, 900g", "covers 6 meals", "£1.75"],
  ];
  return [
    t(y + 90, "This week's shop", 30, "#e2e8f0", "800"),
    t(y + 124, "2,900 kcal/day · 165g protein", 20, "#8391a6"),
    ...items.flatMap((it, i) => {
      const ry = y + 170 + i * 108;
      return [
        card(ry, 90),
        t(ry + 38, it[0], 24, "#f1f5f9", "700"),
        t(ry + 68, it[1], 20, GREEN),
        t(ry + 50, it[2], 24, GOLD, "700", "end", x + w - pad - 20),
      ];
    }),
    card(y + 500, 148),
    t(y + 540, "Tuesday", 22, GOLD, "700"),
    t(y + 576, "You said you eat out — so no", 22, "#cbd5e1"),
    t(y + 604, "dinner planned. Targets adjusted", 22, "#cbd5e1"),
    t(y + 632, "around it.", 22, "#cbd5e1"),
  ].join("\n    ");
}
