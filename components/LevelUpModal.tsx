"use client";

import { useEffect } from "react";
import { Confetti } from "@/components/Confetti";
import { Portal } from "@/components/Portal";

// Celebration shown when the athlete crosses a level threshold.
export function LevelUpModal({ level, rank, emoji, color = "#e3b53f", onClose }: {
  level: number; rank: string; emoji: string; color?: string; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
        <Confetti count={70} />
        <div
          className="card-premium animate-scale-in relative w-full max-w-sm overflow-hidden p-8 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-pitch-400">Level up</div>
          <div
            className="mx-auto mt-4 grid h-24 w-24 place-items-center rounded-3xl text-5xl shadow-glow"
            style={{ background: `linear-gradient(135deg, ${color}, ${color}88)` }}
          >
            {emoji}
          </div>
          <h2 className="mt-4 text-3xl font-extrabold" style={{ color }}>{rank}</h2>
          <p className="mt-1 text-sm text-slate-300">Level {level} — keep the momentum going!</p>
          <button onClick={onClose} className="btn-primary mx-auto mt-6 max-w-[12rem]">Let&apos;s go 🔥</button>
        </div>
      </div>
    </Portal>
  );
}
