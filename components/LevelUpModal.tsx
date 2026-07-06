"use client";

import { useEffect } from "react";
import { Confetti } from "@/components/Confetti";

// Celebration shown when the athlete crosses a level threshold.
export function LevelUpModal({ level, rank, emoji, onClose }: { level: number; rank: string; emoji: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <Confetti count={70} />
      <div
        className="card-premium animate-scale-in relative w-full max-w-sm overflow-hidden p-8 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-pitch-400">Level up</div>
        <div className="mx-auto mt-4 grid h-24 w-24 place-items-center rounded-3xl bg-gradient-to-br from-pitch-400 to-pitch-600 text-5xl shadow-glow">{emoji}</div>
        <h2 className="mt-4 text-3xl font-extrabold">Level {level}</h2>
        <p className="mt-1 text-sm text-slate-300">You&apos;ve reached <span className="font-bold text-pitch-400">{rank}</span>. Keep the momentum going!</p>
        <button onClick={onClose} className="btn-primary mx-auto mt-6 max-w-[12rem]">Let&apos;s go 🔥</button>
      </div>
    </div>
  );
}
