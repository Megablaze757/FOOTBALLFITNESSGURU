"use client";

import { useMemo, useState } from "react";
import { SKILL_DRILLS, type SkillDrill } from "@/lib/skills";
import { buildDrillCardSvg, type CardStyle } from "@/lib/drill-card";
import { guideSports, sportLabel } from "@/lib/seo";
import type { SportId } from "@/lib/exercises";

/**
 * Content studio — turn any drill into a 1080×1080 post image.
 *
 * The coaching is already written in lib/skills.ts, so 38 drills is 38 posts
 * and none of them need designing by hand. Client-side only: the SVG is
 * rasterised on a canvas, so this works on a static host with no image service
 * behind it.
 *
 * Not linked from anywhere and noindex'd via robots.txt — it's a tool for
 * whoever runs the account, not a page for visitors.
 */
export default function StudioPage() {
  const [sport, setSport] = useState<SportId>("football");
  const [style, setStyle] = useState<CardStyle>("drill");
  const [handle, setHandle] = useState("pocketathlete.com/drills");
  const [busy, setBusy] = useState<string | null>(null);

  const drills = useMemo(() => SKILL_DRILLS.filter((d) => d.sport === sport), [sport]);

  async function download(drill: SkillDrill) {
    setBusy(drill.id);
    try {
      const svg = buildDrillCardSvg({ drill, sportLabel: sportLabel(sport), style, handle });
      const blob = await rasterise(svg);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${drill.id}-${style}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }

  async function downloadAll() {
    // Sequential, with a beat between each: browsers throttle or silently drop
    // a burst of simultaneous downloads.
    for (const d of drills) {
      await download(d);
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-extrabold tracking-tight">Content studio</h1>
      <p className="mt-2 text-sm text-slate-400">
        Every drill as a ready-to-post 1080×1080 image. Pick a sport, pick a layout, download.
      </p>

      <div className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <div>
          <span className="field-label">Sport</span>
          <div className="flex flex-wrap gap-2">
            {guideSports().map((s) => (
              <button
                key={s}
                onClick={() => setSport(s)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  sport === s ? "border-pitch-400/50 bg-pitch-400/10 text-pitch-400" : "border-white/10 text-slate-300"
                }`}
              >
                {sportLabel(s)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="field-label">Layout</span>
          <div className="flex flex-wrap gap-2">
            {([["drill", "Full drill — setup, steps, cue"], ["cue", "Cue only — big text, travels further"]] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setStyle(id)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  style === id ? "border-pitch-400/50 bg-pitch-400/10 text-pitch-400" : "border-white/10 text-slate-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="field-label">Footer link</span>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} className="field" />
          <span className="mt-1 block text-xs text-slate-500">
            Add your <code>?ref=</code> code here so signups get attributed.
          </span>
        </label>

        <button onClick={downloadAll} disabled={!!busy} className="btn-primary">
          {busy ? "Exporting…" : `Download all ${drills.length}`}
        </button>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {drills.map((d) => {
          const svg = buildDrillCardSvg({ drill: d, sportLabel: sportLabel(sport), style, handle });
          return (
            <div key={d.id}>
              {/* Rendered as an <img> from a data URI so the preview is exactly
                  what the PNG export will be, not a CSS approximation. */}
              <img
                src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
                alt={d.name}
                width={1080}
                height={1080}
                className="w-full rounded-2xl border border-white/10"
              />
              <button
                onClick={() => download(d)}
                disabled={busy === d.id}
                className="mt-2 w-full rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06] disabled:opacity-50"
              >
                {busy === d.id ? "Exporting…" : `Download “${d.name}”`}
              </button>
            </div>
          );
        })}
      </div>
    </main>
  );
}

/** SVG string → PNG blob, via a canvas. No dependencies, no image service. */
async function rasterise(svg: string): Promise<Blob> {
  const img = new Image();
  img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
}
