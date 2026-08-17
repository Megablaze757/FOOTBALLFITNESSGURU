export type ExerciseMeasure = "reps" | "seconds" | "minutes" | "metres";

/** The unit written at the start of a structured programme prescription. */
function prescribedUnit(prescription: string): ExerciseMeasure | null {
  const text = prescription.trim();
  const match = /^(?:\d+\s*[x×]\s*)?\d+(?:\s*[–-]\s*\d+)?\s*(minutes?|mins?|min|seconds?|secs?|sec|s|metres?|meters?|m)\b/i.exec(text);
  if (!match) return null;
  const unit = match[1].toLowerCase();
  if (/^m(in|ins|inute)/.test(unit)) return "minutes";
  if (/^m(et|$)/.test(unit)) return "metres";
  return "seconds";
}

/**
 * What the athlete actually completes per set.
 *
 * Programme prescriptions win. Name rules cover library/custom entries that
 * have no engine metadata and old saved plans. They are deliberately limited
 * to unmistakably static work: a "World's greatest stretch" is repetitions,
 * while a couch stretch or plank is a hold.
 */
export function exerciseMeasure(name: string, prescription?: string | null): ExerciseMeasure {
  const prescribed = prescription ? prescribedUnit(prescription) : null;
  if (prescribed) return prescribed;

  const value = name.toLowerCase().replace(/[’]/g, "'");
  if (/\b(farmer'?s carry|suitcase carry|loaded carry)\b/.test(value)) return "metres";
  if (/\b(plank|isometric|iso[- ]?hold|wall sit|dead hang|balance)\b/.test(value)) return "seconds";
  if (/\b(couch|sleeper|supine hamstring|static|calf|hip flexor|quad|piriformis) stretch\b/.test(value)) return "seconds";
  return "reps";
}

export function measureLabel(measure: ExerciseMeasure): string {
  if (measure === "seconds") return "seconds";
  if (measure === "minutes") return "minutes";
  if (measure === "metres") return "metres";
  return "reps";
}

/** Additive JSON fields for carrying a programme dose into a training log. */
export function measuredTrainingFields(name: string, amount: number, prescription?: string | null): {
  measure: ExerciseMeasure;
  reps: number;
  duration_seconds?: number;
  distance_m?: number;
  prescription?: string | null;
} {
  const measure = exerciseMeasure(name, prescription);
  if (measure === "seconds") return { measure, reps: 0, duration_seconds: amount, prescription };
  if (measure === "minutes") return { measure, reps: 0, duration_seconds: amount * 60, prescription };
  if (measure === "metres") return { measure, reps: 0, distance_m: amount, prescription };
  return { measure, reps: amount, prescription };
}

/** Per-set duration in seconds, including a legacy numeric dose when needed. */
export function durationPerSet(drill: {
  name: string; reps: number; prescription?: string | null; duration_seconds?: number | null;
}): number | null {
  const measure = exerciseMeasure(drill.name, drill.prescription);
  if (measure !== "seconds" && measure !== "minutes") return null;
  if (Number(drill.duration_seconds) >= 0 && drill.duration_seconds != null) return Number(drill.duration_seconds);
  return Math.max(0, Number(drill.reps) || 0) * (measure === "minutes" ? 60 : 1);
}

export function formatMeasuredDose(drill: {
  name: string; sets: number; reps: number; prescription?: string | null;
  duration_seconds?: number | null; distance_m?: number | null;
}): string {
  const measure = exerciseMeasure(drill.name, drill.prescription);
  if (measure === "seconds" || measure === "minutes") {
    const seconds = durationPerSet(drill) ?? 0;
    const amount = measure === "minutes" ? +(seconds / 60).toFixed(1) : seconds;
    return `${drill.sets} × ${amount}${measure === "minutes" ? " min" : "s"}`;
  }
  if (measure === "metres") return `${drill.sets} × ${drill.distance_m ?? drill.reps}m`;
  return `${drill.sets} × ${drill.reps}`;
}
