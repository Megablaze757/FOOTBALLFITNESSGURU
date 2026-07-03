"use client";

import { useEffect, useRef } from "react";
import type { HeatPoint } from "@/lib/types";

// Renders the video with a static heatmap canvas overlaid. Points are in
// normalised [0,1] frame coordinates; intensity drives colour/alpha.
export function HeatmapVideo({ src, points }: { src: string; points: HeatPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    function draw() {
      const w = wrap!.clientWidth;
      const h = wrap!.clientHeight;
      if (!w || !h) return;
      canvas!.width = w;
      canvas!.height = h;
      const ctx = canvas!.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);

      for (const p of points) {
        const cx = p.x * w;
        const cy = p.y * h;
        const r = 26 + 30 * p.intensity;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        const a = 0.15 + 0.5 * p.intensity;
        // green (low) -> red (high) by intensity
        const hue = Math.round(120 * (1 - p.intensity));
        grad.addColorStop(0, `hsla(${hue}, 90%, 50%, ${a})`);
        grad.addColorStop(1, `hsla(${hue}, 90%, 50%, 0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [points]);

  return (
    <div ref={wrapRef} className="relative overflow-hidden rounded-xl bg-black">
      <video src={src} controls playsInline className="block w-full" />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  );
}
