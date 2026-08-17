import type { TrainingLog } from "./types";

/** Exact duration where available, with old minute-only rows kept compatible. */
export function durationSeconds(log: Pick<TrainingLog, "duration_seconds" | "total_minutes">): number {
  if (log.duration_seconds != null && Number.isFinite(Number(log.duration_seconds)) && Number(log.duration_seconds) >= 0) {
    return Number(log.duration_seconds);
  }
  return Math.max(0, Number(log.total_minutes) || 0) * 60;
}

export function durationMinutes(log: Pick<TrainingLog, "duration_seconds" | "total_minutes">): number {
  return durationSeconds(log) / 60;
}

export function formatElapsed(seconds: number | null | undefined): string {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function isActivity(log: Pick<TrainingLog, "session_type">): boolean {
  return log.session_type !== "rest_day";
}
