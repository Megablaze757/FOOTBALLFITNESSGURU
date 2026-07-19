"use client";

import { useState } from "react";
import type { PainMap } from "@/lib/types";

// Tappable regions positioned on a simple front-facing body silhouette.
const REGIONS: { key: string; label: string; cx: number; cy: number; r: number }[] = [
  { key: "shoulder_left", label: "L shoulder", cx: 58, cy: 70, r: 9 },
  { key: "shoulder_right", label: "R shoulder", cx: 102, cy: 70, r: 9 },
  { key: "lower_back", label: "Lower back", cx: 80, cy: 120, r: 10 },
  { key: "hip_left", label: "L hip", cx: 66, cy: 148, r: 9 },
  { key: "hip_right", label: "R hip", cx: 94, cy: 148, r: 9 },
  { key: "groin", label: "Groin", cx: 80, cy: 158, r: 9 },
  { key: "hamstring_left", label: "L hamstring", cx: 68, cy: 195, r: 9 },
  { key: "hamstring_right", label: "R hamstring", cx: 92, cy: 195, r: 9 },
  { key: "knee_left", label: "L knee", cx: 68, cy: 235, r: 9 },
  { key: "knee_right", label: "R knee", cx: 92, cy: 235, r: 9 },
  { key: "calf_left", label: "L calf", cx: 68, cy: 262, r: 8 },
  { key: "calf_right", label: "R calf", cx: 92, cy: 262, r: 8 },
  { key: "ankle_left", label: "L ankle", cx: 68, cy: 285, r: 8 },
  { key: "ankle_right", label: "R ankle", cx: 92, cy: 285, r: 8 },
  { key: "head", label: "Head / neck", cx: 80, cy: 36, r: 10 },
];

function painColor(level: number): string {
  if (level <= 0) return "#cbd5e1"; // slate-300
  if (level >= 7) return "#dc2626"; // red
  if (level >= 4) return "#eab308"; // yellow
  return "#fb923c"; // orange (mild)
}

export function BodyMap({
  value,
  onChange,
  mode = "pain",
}: {
  value: PainMap;
  onChange: (next: PainMap) => void;
  // "pain" logs a 0-10 severity (daily check-in). "select" is a simple
  // tap-to-toggle for picking an injured area.
  mode?: "pain" | "select";
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedLabel = REGIONS.find((r) => r.key === selected)?.label;

  function setLevel(level: number) {
    if (!selected) return;
    const next = { ...value };
    if (level <= 0) delete next[selected];
    else next[selected] = level;
    onChange(next);
  }

  return (
    <div>
      <svg viewBox="0 0 160 320" className="mx-auto h-72" role="img" aria-label="Body pain map">
        {/* Silhouette */}
        <g fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5">
          <circle cx="80" cy="36" r="18" /> {/* head */}
          <rect x="60" y="56" width="40" height="70" rx="14" /> {/* torso */}
          <rect x="46" y="60" width="12" height="60" rx="6" /> {/* L arm */}
          <rect x="102" y="60" width="12" height="60" rx="6" /> {/* R arm */}
          <rect x="62" y="150" width="14" height="140" rx="7" /> {/* L leg */}
          <rect x="84" y="150" width="14" height="140" rx="7" /> {/* R leg */}
        </g>

        {REGIONS.map((region) => {
          const level = value[region.key] ?? 0;
          const isSel = selected === region.key;
          return (
            <circle
              key={region.key}
              cx={region.cx}
              cy={region.cy}
              r={region.r}
              fill={painColor(level)}
              stroke={isSel ? "#e3b53f" : "rgba(255,255,255,0.25)"}
              strokeWidth={isSel ? 2.5 : 1.5}
              className="cursor-pointer"
              onClick={() => {
                setSelected(region.key);
                if (mode === "select") {
                  const next = { ...value };
                  if (next[region.key]) delete next[region.key];
                  else next[region.key] = 5;
                  onChange(next);
                }
              }}
            >
              <title>{`${region.label}: ${level}/10`}</title>
            </circle>
          );
        })}
      </svg>

      <div className="mt-3 rounded-2xl bg-white/[0.04] p-3">
        {mode === "select" ? (
          <p className="text-center text-sm text-slate-400">
            {Object.keys(value).length
              ? `Selected: ${Object.keys(value).map((k) => REGIONS.find((r) => r.key === k)?.label ?? k).join(", ")}`
              : "Tap where it hurts."}
          </p>
        ) : selected ? (
          <>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-200">{selectedLabel}</span>
              <span className="tabular-nums text-slate-400">{value[selected] ?? 0}/10</span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              value={value[selected] ?? 0}
              onChange={(e) => setLevel(Number(e.target.value))}
              className="w-full"
            />
          </>
        ) : (
          <p className="text-center text-sm text-slate-500">Tap a body part to log pain.</p>
        )}
      </div>
    </div>
  );
}
