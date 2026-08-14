/**
 * Builds lib/body-outline.ts — the figure the strength map is drawn on.
 *
 * SOURCE: "Male musculature" by OpenClipart, via freesvg.org/male-musculature.
 * Licence: CC0 1.0 (public domain dedication). No attribution is required and
 * commercial use is explicitly permitted; recorded anyway, because knowing
 * where an asset came from is the difference between using it and hoping.
 *
 * WHAT COMES OUT: the body's silhouette, and one outline per muscle region —
 * all TRACED FROM THE ANATOMY rather than drawn by hand.
 *
 * WHY TRACED. Three things were tried first and each failed the same way.
 * Shipping the source's 584 paths cost 274KB, needed a runtime fetch, and its
 * striation fought the region colour. Hand-drawn muscle shapes never aligned
 * with the body. Rectangles clipped to the silhouette aligned perfectly and
 * read as bars laid over a person — and they both overflowed and underflowed
 * the muscle they claimed to be, because a rectangle is not a deltoid.
 *
 * Tracing gives the real boundary of each muscle group for a few KB: the
 * highlight lands exactly on the muscle, and the same outlines drawn faintly
 * are the figure's definition, so nothing about the anatomy is guesswork.
 *
 * HOW. Rasterise, label connected components, walk each boundary with
 * Moore-neighbour tracing, simplify with Douglas-Peucker. Tracing rather than
 * unioning the paths because SVG has no union operator and the alpha channel
 * already knows the answer.
 *
 * Run: node scripts/gen-body-figure.mjs
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const SOURCE = "https://freesvg.org/download/61125";

const res = await fetch(SOURCE, {
  headers: { "User-Agent": "Mozilla/5.0", Referer: "https://freesvg.org/male-musculature" },
});
if (!res.ok) throw new Error(`source fetch failed: ${res.status}`);
const raw = (await res.text()).replace(/<\?xml[\s\S]*?\?>/, "").replace(/<!DOCTYPE[\s\S]*?>/, "");

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 900, height: 1750 } });
await page.setContent(`<body style="margin:0">${raw.replace("<svg ", '<svg id="src" ')}</body>`);

const out = await page.evaluate(async () => {
  const src = document.getElementById("src");
  const vb = src.getAttribute("viewBox").split(/\s+/).map(Number);
  const W = 430, H = Math.round((W * vb[3]) / vb[2]);
  const scale = vb[2] / W;

  /** Where a path sits decides which muscle it belongs to. */
  const zoneOf = (cx, cy) => {
    const off = Math.abs(cx - 430);
    if (cy < 235) return "head";
    if (off > 132) return cy < 430 ? "shoulders" : cy < 640 ? "biceps" : "forearms";
    if (cy < 335) return "shoulders";
    if (cy < 480) return "chest";
    if (cy < 760) return "core";
    if (cy < 1225) return "quads";
    return "calves";
  };

  const byZone = new Map();
  for (const el of src.querySelectorAll("path")) {
    const b = el.getBBox();
    const zone = zoneOf(b.x + b.width / 2, b.y + b.height / 2);
    if (!byZone.has(zone)) byZone.set(zone, []);
    byZone.get(zone).push(el.getAttribute("d"));
  }

  /** Paint a set of paths and hand back the alpha mask. */
  const maskOf = async (paths) => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(" ")}">`
      + paths.map((d) => `<path d="${d}" fill="#000"/>`).join("") + "</svg>";
    const img = new Image();
    await new Promise((ok, no) => {
      img.onload = ok; img.onerror = no;
      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(markup)));
    });
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;
    const on = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) on[i] = data[i * 4 + 3] > 40 ? 1 : 0;
    return on;
  };

  const simplify = (ps, eps) => {
    if (ps.length < 3) return ps;
    let worst = 0, at = 0;
    const [ax, ay] = ps[0], [bx, by] = ps[ps.length - 1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = 1; i < ps.length - 1; i++) {
      const d = Math.abs((bx - ax) * (ay - ps[i][1]) - (ax - ps[i][0]) * (by - ay)) / len;
      if (d > worst) { worst = d; at = i; }
    }
    if (worst <= eps) return [ps[0], ps[ps.length - 1]];
    return [...simplify(ps.slice(0, at + 1), eps).slice(0, -1), ...simplify(ps.slice(at), eps)];
  };

  /**
   * Chaikin corner-cutting: replace each corner with two points a quarter in
   * from either side. Two passes turn a simplified polygon's angular, spiky
   * outline into something that reads as drawn rather than as traced, which is
   * the difference between a muscle and a sawblade.
   */
  const smooth = (ps, passes) => {
    let out = ps;
    for (let n = 0; n < passes; n++) {
      const next = [];
      for (let i = 0; i < out.length; i++) {
        const [ax, ay] = out[i];
        const [bx, by] = out[(i + 1) % out.length];
        next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
        next.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
      }
      out = next;
    }
    return out;
  };

  const dirs = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];

  /**
   * Every separate blob in a mask, as a simplified outline. Separate, because a
   * muscle group is usually two of them — you have two arms.
   */
  const traceAll = (on, eps, minArea) => {
    const seen = new Uint8Array(W * H);
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : on[y * W + x]);
    const shapes = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!at(x, y) || seen[y * W + x]) continue;
        // Flood the blob so it is only traced once, and to measure it.
        const stack = [[x, y]];
        let area = 0;
        seen[y * W + x] = 1;
        while (stack.length) {
          const [px, py] = stack.pop();
          area++;
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = px + dx, ny = py + dy;
            if (at(nx, ny) && !seen[ny * W + nx]) { seen[ny * W + nx] = 1; stack.push([nx, ny]); }
          }
        }
        if (area < minArea) continue;

        const pts = [];
        let cx = x, cy = y, dir = 6, guard = 0;
        do {
          pts.push([cx, cy]);
          let moved = false;
          for (let i = 0; i < 8; i++) {
            const d = (dir + 6 + i) % 8;
            const nx = cx + dirs[d][0], ny = cy + dirs[d][1];
            if (at(nx, ny)) { cx = nx; cy = ny; dir = d; moved = true; break; }
          }
          if (!moved) break;
        } while (!(cx === x && cy === y) && ++guard < 120000);

        // Simplify hard, round the corners, then drop the points smoothing
        // added back where the line is straight anyway.
        const kept = simplify(simplify(pts, eps), 0.01);
        if (kept.length < 8) continue;
        const rounded = simplify(smooth(kept, 2), 0.5);
        shapes.push("M" + rounded.map(([px, py]) => `${(px * scale).toFixed(1)},${(py * scale).toFixed(1)}`).join("L") + "Z");
      }
    }
    return shapes;
  };

  // The whole body: everything painted at once.
  const all = [...byZone.values()].flat();
  const body = traceAll(await maskOf(all), 1.4, 400)[0];

  // Each muscle region, from its own paths only.
  const regions = {};
  for (const [zone, paths] of byZone) {
    if (zone === "head") continue;
    // A coarser epsilon and a much bigger minimum: these are read at 220px, so
    // anything smaller than a thumbnail is a spike of striation rather than a
    // muscle, and it shows up as a jagged edge on the highlight.
    regions[zone] = traceAll(await maskOf(paths), 3.0, 700);
  }
  return { vb, body, regions };
});
await browser.close();

const lines = Object.entries(out.regions)
  .map(([zone, shapes]) => `  ${zone}: [\n${shapes.map((d) => `    "${d}",`).join("\n")}\n  ],`)
  .join("\n");

const file = `// GENERATED by scripts/gen-body-figure.mjs — do not hand-edit.
//
// The body the strength map is drawn on, traced from a CC0 anatomical figure.
// See the generator for the source, the licence, and why only outlines survive.
//
// BODY_OUTLINE is the silhouette. MUSCLE_SHAPES is the real boundary of each
// muscle group, which is what makes a highlight land on the muscle instead of
// near it — and, drawn faintly, is the figure's definition.

/** The source illustration's coordinate space. */
export const BODY_VIEWBOX = { width: ${out.vb[2]}, height: ${out.vb[3]} } as const;

/** The whole body, as one closed path. */
export const BODY_OUTLINE =
  "${out.body}";

/** Traced muscle boundaries, keyed by region. Several shapes each — you have two arms. */
export const MUSCLE_SHAPES: Record<string, string[]> = {
${lines}
};
`;
writeFileSync(new URL("../lib/body-outline.ts", import.meta.url), file);
const counts = Object.entries(out.regions).map(([z, s]) => `${z}:${s.length}`).join(" ");
console.log(`lib/body-outline.ts — ${(file.length / 1024).toFixed(1)}KB · ${counts}`);
