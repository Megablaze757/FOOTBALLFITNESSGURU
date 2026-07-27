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
  // Only words that mean the WHOLE CATEGORY.
  //
  // This used to include running, jogging, sprinting, bike and cycling, which
  // made "no running" ban every piece of conditioning in the programme — bike,
  // rower, skipping, the lot. That is precisely backwards: someone who says no
  // running usually has shins, knees or a pavement problem, and they are
  // exactly the person who still wants the bike. Those words are named
  // movements now (below), so the specific thing is dropped and a substitute
  // survives.
  { region: "conditioning", label: "cardio & conditioning", words: /\b(cardio|conditioning|endurance|aerobic)\b/i },
  { region: "impact", label: "jumping & high-impact work", words: /\b(jump|jumps|jumping|plyo|plyos|plyometric|plyometrics|impact|box jump|hop|hops|hopping)\b/i },
];

// Named movements worth excluding on their own, independent of region.
//
// The cardio entries matter: excluding "running" must leave the bike and the
// rower available, so conditioning can be substituted rather than deleted.
const MOVEMENT_WORDS = [
  "squat", "deadlift", "bench press", "overhead press", "lunge", "pull-up",
  "power clean", "burpee", "box jump",
  "running", "run", "jog", "jogging", "sprint", "sprinting",
  "bike", "cycling", "rowing", "swimming", "skipping",
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
      // Match the movement's first word across its endings, so "no squats",
      // "avoid deadlifting" and "I can't run" all land. Matching only `s?`
      // meant "deadlifting" was recognised as nothing at all — and an
      // instruction the parser doesn't see is one the athlete thinks was
      // followed.
      const head = m.split(" ")[0];
      if (new RegExp(`\\b${head}(s|es|ing|ed)?\\b`, "i").test(clause)) movements.add(m);
    }
  }

  const excludeRegions = [...regions];
  const summary = excludeRegions.map((r) => `Leaving out ${labels.get(r) ?? r} — you asked not to train it.`);

  return { excludeRegions, excludeMovements: [...movements], summary };
}

/** True when a drill in `region` (named `name`) is ruled out by `c`. */
/**
 * Reduce a word to a stem so inflections match.
 *
 * Needed because the note and the drill name rarely agree on grammar: someone
 * writes "no running" and the drill is called "Tempo runs". A plain substring
 * test missed that, so the exclusion silently did nothing — which is worse than
 * over-excluding, because the athlete believes they were listened to.
 */
function stem(word: string): string {
  let s = word.toLowerCase().replace(/[^a-z]/g, "");
  if (s.length <= 3) return s;
  if (s.endsWith("ing")) {
    s = s.slice(0, -3);
    // "running" -> "runn" -> "run". English doubles the consonant before -ing.
    if (/([bdfglmnprt])\1$/.test(s)) s = s.slice(0, -1);
  } else if (s.endsWith("es")) {
    s = s.slice(0, -2);
  } else if (s.endsWith("s")) {
    s = s.slice(0, -1);
  }
  return s;
}

export function isExcluded(c: Constraints, region: Region | undefined, name: string): boolean {
  if (region && c.excludeRegions.includes(region)) return true;
  if (!c.excludeMovements.length) return false;

  // Compare stems word by word rather than testing substrings, so "running"
  // catches "Tempo runs" without "row" also matching "throw" or "crowd".
  const nameStems = new Set(name.toLowerCase().split(/[^a-z]+/i).filter(Boolean).map(stem));
  return c.excludeMovements.some((m) => {
    const head = stem(m.split(" ")[0]);
    return head.length > 2 && nameStems.has(head);
  });
}

/** True when the parser found nothing to act on. */
export function isEmpty(c: Constraints): boolean {
  return c.excludeRegions.length === 0 && c.excludeMovements.length === 0;
}
