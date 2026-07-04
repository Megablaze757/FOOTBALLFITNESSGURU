// Builds a shareable 1080×1080 progress card as SVG and rasterises it to PNG in
// the browser (no dependencies — works on GitHub Pages). Offers native share or
// download.

export interface ShareStat {
  label: string;
  value: string;
}

export interface ShareStats {
  name: string;
  headlineValue: string;
  headlineLabel: string;
  accent?: string; // hex
  stats: ShareStat[]; // up to 3
  caption?: string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildShareSvg(s: ShareStats): string {
  const accent = s.accent ?? "#e3b53f";
  const stats = s.stats.slice(0, 3);
  const colW = 1080 / (stats.length || 1);
  const statCols = stats
    .map((st, i) => {
      const cx = colW * i + colW / 2;
      return `
        <text x="${cx}" y="820" text-anchor="middle" fill="#ffffff" font-size="72" font-weight="800" font-family="Arial, sans-serif">${esc(st.value)}</text>
        <text x="${cx}" y="864" text-anchor="middle" fill="#8a94a6" font-size="26" font-weight="700" letter-spacing="2" font-family="Arial, sans-serif">${esc(st.label.toUpperCase())}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
    <defs>
      <radialGradient id="bg" cx="50%" cy="0%" r="90%">
        <stop offset="0%" stop-color="#241d0b"/>
        <stop offset="55%" stop-color="#111010"/>
        <stop offset="100%" stop-color="#0a0a0b"/>
      </radialGradient>
      <linearGradient id="acc" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f0d68a"/>
        <stop offset="100%" stop-color="${accent}"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1080" fill="url(#bg)"/>
    <rect x="40" y="40" width="1000" height="1000" rx="48" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
    <text x="80" y="150" fill="url(#acc)" font-size="52" font-weight="800" font-family="Arial, sans-serif">APEX</text>
    <text x="1000" y="150" text-anchor="end" fill="#8a94a6" font-size="34" font-weight="600" font-family="Arial, sans-serif">${esc(s.name)}</text>

    <text x="540" y="470" text-anchor="middle" fill="url(#acc)" font-size="300" font-weight="800" font-family="Arial, sans-serif">${esc(s.headlineValue)}</text>
    <text x="540" y="560" text-anchor="middle" fill="#c7d0dd" font-size="42" font-weight="700" letter-spacing="4" font-family="Arial, sans-serif">${esc(s.headlineLabel.toUpperCase())}</text>

    <line x1="80" y1="700" x2="1000" y2="700" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
    ${statCols}

    <text x="540" y="980" text-anchor="middle" fill="#6b7686" font-size="28" font-weight="600" font-family="Arial, sans-serif">${esc(s.caption ?? "Train smarter. Recover faster.")}</text>
  </svg>`;
}

async function svgToPngBlob(svg: string): Promise<Blob> {
  const img = new Image();
  img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png")
  );
}

/** Share the card via the Web Share API when available, else download the PNG. */
export async function exportShareCard(stats: ShareStats): Promise<void> {
  const blob = await svgToPngBlob(buildShareSvg(stats));
  const file = new File([blob], "apex-progress.png", { type: "image/png" });

  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean; share?: (d: unknown) => Promise<void> };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: "My progress" });
      return;
    } catch {
      /* user cancelled — fall through to download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "apex-progress.png";
  a.click();
  URL.revokeObjectURL(url);
}
