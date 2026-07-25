// =============================================================================
// Free-text training constraints — "I don't train legs", "no running", "avoid
// squats" — parsed into something the program builder can actually act on.
//
// Until this existed, the athlete's notes were passed to the LLM and dropped
// entirely by the local engine, so anyone who fell back to on-device generation
// got a plan that ignored what they'd just said. That reads as the coach not
// listening, which is worse than not asking.
//
// Deliberately a small, documented vocabulary rather than a pretend-NLP layer:
// it recognises a negation next to a body region or movement, and reports what
// it understood so the UI can show it back. Anything it doesn't recognise is
// left for the LLM path, which handles open-ended notes far better.
// Pure + dependency-free, so it runs in the browser and is unit-tested.
// =============================================================================

/** Coarse training regions a drill can belong to. */
export type Region =
  | "legs" | "chest" | "back" | "shoulders" | "arms" | "core"
  | "conditioning" | "impact" | "skill";

export interface Constraints {
  /** Regions the athlete does not want trained at all. */
  excludeRegions: Region[];
  /** Specific movement keywords to avoid (e.g. "squat", "deadlift"). */
  excludeMovements: string[];
  /** Human-readable lines describing what was understood, for the UI. */
  summary: string[];
}

export const EMPTY_CONSTRAINTS: Constraints = { excludeRegions: [], excludeMovements: [], summary: [] };

// A clause is treated as an exclusion when it contains one of these.
const NEGATIONS = /\b(no|not|don'?t|do not|doesn'?t|avoid|skip|skipping|without|exclude|excluding|never|can'?t|cannot|unable to|hate|dislike|off limits|stay away from)\b/i;

// Region keywords. Order matters only for the summary label.
const REGION_WORDS: { region: Region; label: string; words: RegExp }[] = [
  { region: "legs", label: "legs", words: /\b(leg|legs|leg day|lower body|quad|quads|hamstring|hamstrings|glute|glutes|calf|calves|squat|squats|lunge|lunges|deadlift|deadlifts)\b/i },
  { region: "chest", label: "chest", words: /\b(chest|pec|pecs|bench|bench press|fly|flyes|flies)\b/i },
  { region: "back", label: "back", words: /\b(back|lat|lats|row|rows|pulldown|pull-?up|pull ?ups|chin-?up)\b/i },
  { region: "shoulders", label: "shoulders", words: /\b(shoulder|shoulders|delt|delts|overhead press|ohp|lateral raise)\b/i },
  { region: "arms", label: "arms", words: /\b(arm|arms|bicep|biceps|tricep|triceps|curl|curls)\b/i },
  { region: "core", label: "core", words: /\b(core|ab|abs|abdominal|abdominals|plank|planks)\b/i },
  { region: "conditioning", label: "cardio & conditioning", words: /\b(cardio|conditioning|running|run|runs|jog|jogging|sprint|sprints|sprinting|bike|cycling|endurance|aerobic)\b/i },
  { region: "impact", label: "jumping & high-impact work", words: /\b(jump|jumps|jumping|plyo|plyos|plyometric|plyometrics|impact|box jump|hop|hops|hopping)\b/i },
];

// Named movements worth excluding on their own, independent of region.
const MOVEMENT_WORDS = [
  "squat", "deadlift", "bench press", "overhead press", "lunge", "pull-up",
  "power clean", "burpee", "box jump", "running", "sprint",
];

/**
 * Splits notes into clauses so "I train legs but no running" doesn't exclude
 * legs. Each clause is judged on its own.
 */
function clauses(text: string): string[] {
  return text
    .split(/[.;,\n]|\bbut\b|\bhowever\b|\bthough\b|\balthough\b/i)
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Parse athlete notes into structured exclusions. Safe on null/empty input. */
export function parseConstraints(notes: string | null | undefined): Constraints {
  const text = (notes ?? "").trim();
  if (!text) return { excludeRegions: [], excludeMovements: [], summary: [] };

  const regions = new Set<Region>();
  const movements = new Set<string>();
  const labels = new Map<Region, string>();

  for (const clause of clauses(text)) {
    if (!NEGATIONS.test(clause)) continue;
    for (const { region, label, words } of REGION_WORDS) {
      if (words.test(clause)) {
        regions.add(region);
        labels.set(region, label);
      }
    }
    for (const m of MOVEMENT_WORDS) {
      // Match the movement's first word so "no squats" catches "squat".
      const head = m.split(" ")[0];
      if (new RegExp(`\\b${head}s?\\b`, "i").test(clause)) movements.add(m);
    }
  }

  const excludeRegions = [...regions];
  const summary = excludeRegions.map((r) => `Leaving out ${labels.get(r) ?? r} — you asked not to train it.`);

  return { excludeRegions, excludeMovements: [...movements], summary };
}

/** True when a drill in `region` (named `name`) is ruled out by `c`. */
export function isExcluded(c: Constraints, region: Region | undefined, name: string): boolean {
  if (region && c.excludeRegions.includes(region)) return true;
  const n = name.toLowerCase();
  return c.excludeMovements.some((m) => n.includes(m.split(" ")[0]));
}

/** True when the parser found nothing to act on. */
export function isEmpty(c: Constraints): boolean {
  return c.excludeRegions.length === 0 && c.excludeMovements.length === 0;
}
