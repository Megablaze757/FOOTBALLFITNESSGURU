import Link from "next/link";
import type { BiometricSignal } from "@/lib/biometrics";

function recommendation(adj: number): { label: string; color: string } {
  if (adj <= -8) return { label: "Ease off — recovery-weighted today", color: "#fb5d6b" };
  if (adj <= -3) return { label: "Keep it moderate today", color: "#fbbf24" };
  if (adj >= 3) return { label: "Green light — you're primed to push", color: "#34d399" };
  return { label: "Steady — train as planned", color: "#94a3b8" };
}

export function BiometricSignalCard({ signal }: { signal: BiometricSignal }) {
  const has = signal.hrv != null || signal.restingHr != null || signal.sleepHours != null;
  if (!has) {
    return (
      <Link href="/journal" className="card card-hover flex items-center justify-between p-4">
        <div>
          <div className="stat-label">⌚ Wearable</div>
          <div className="mt-0.5 text-sm font-bold text-slate-100">Connect HRV, sleep &amp; resting HR</div>
        </div>
        <span className="text-pitch-400">→</span>
      </Link>
    );
  }
  const rec = recommendation(signal.adjustment);
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="field-label !mb-0">⌚ Biometrics</h2>
        <span className="chip" style={{ color: rec.color }}>{signal.adjustment >= 0 ? "▲" : "▼"} readiness {signal.adjustment >= 0 ? "+" : ""}{signal.adjustment}</span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="HRV" value={signal.hrv != null ? `${Math.round(signal.hrv)}ms` : "—"} sub={signal.hrvDeviationPct != null ? `${signal.hrvDeviationPct > 0 ? "+" : ""}${signal.hrvDeviationPct}%` : undefined} subColor={signal.hrvDeviationPct != null && signal.hrvDeviationPct < 0 ? "#fb5d6b" : "#34d399"} />
        <Stat label="Rest HR" value={signal.restingHr != null ? `${signal.restingHr}` : "—"} />
        <Stat label="Sleep" value={signal.sleepHours != null ? `${signal.sleepHours}h` : "—"} />
      </div>
      <p className="mt-3 text-sm font-semibold" style={{ color: rec.color }}>{rec.label}</p>
      {signal.note && <p className="mt-1 text-xs text-slate-400">{signal.note}</p>}
    </div>
  );
}

function Stat({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-3">
      <div className="text-lg font-extrabold text-slate-100">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="text-[10px] font-semibold" style={{ color: subColor }}>{sub}</div>}
    </div>
  );
}
