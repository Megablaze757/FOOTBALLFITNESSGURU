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
import { equipBucket } from "./exercise-catalog";

export type Region =
  | "legs" | "chest" | "back" | "shoulders" | "arms" | "core"
  | "conditioning" | "impact" | "skill"
  // Running as a CATEGORY, distinct from "conditioning". Needed once actual
  // runs entered the library: the movement-word rule below drops anything with
  // "run" in its name, which catches "Easy run" and misses "Fartlek",
  // "Strides" and "Hill repeats" — all unmistakably running. Someone with
  // shins who says "no running" must lose all of them and keep the bike, and
  // only a region can express that.
  | "running";

export interface Constraints {
  /** Regions the athlete does not want trained at all. */
  excludeRegions: Region[];
  /** Specific movement keywords to avoid (e.g. "squat", "deadlift"). */
  excludeMovements: string[];
  /** Human-readable lines describing what was understood, for the UI. */
  summary: string[];
  /**
   * EQUIPMENT BUCKETS THE ATHLETE ACTUALLY HAS, or empty for "no restriction".
   *
   * The engine anchors sessions on a barbell back squat, a barbell row and a
   * bench press — the right lifts, and useless to somebody training in a
   * bedroom with two dumbbells. Nothing in the app asked, and nothing in the
   * plan could express the answer, so "I only have dumbbells at home" in the
   * notes was read for regions and movements and then thrown away.
   *
   * Buckets rather than exact equipment strings, matching `equipBucket` in
   * lib/exercise-catalog.ts, because "EZ bar" and "trap bar" are a barbell for
   * this purpose and an athlete does not enumerate their gym.
   *
   * Bodyweight is never excluded by this. Push-ups need nothing and there is no
   * gym so poorly stocked that they are unavailable, so a bodyweight movement
   * is always eligible whatever the list says.
   */
  equipment: string[];
}

export const EMPTY_CONSTRAINTS: Constraints = { excludeRegions: [], excludeMovements: [], summary: [], equipment: [] };

/**
 * What somebody has to train with, from how they'd actually say it.
 *
 * Two shapes, because people describe this both ways: "I've only got
 * dumbbells" names what they HAVE, and "no barbell" names what they lack.
 * Reading only one of them would silently ignore half the athletes who told
 * us — and an instruction the parser does not see is one the athlete believes
 * was followed.
 *
 * EVERY WORD HERE TAKES A PLURAL, and it is not optional: nobody writes "I only
 * have dumbbell". The first version of this closed each alternation with \b,
 * so "dumbbells" failed to match "dumbbell" — the single most likely sentence
 * an athlete types parsed to nothing at all.
 */
const EQUIPMENT_WORDS: { bucket: string; words: RegExp }[] = [
  { bucket: "Barbell", words: /\b(barbells?|bar bells?|olympic bars?|squat racks?|power racks?|ez bars?|trap bars?|hex bars?)\b/i },
  { bucket: "Dumbbell", words: /\b(dumbbells?|dumb bells?|dbs?|free weights?)\b/i },
  { bucket: "Kettlebell", words: /\b(kettlebells?|kettle bells?|kbs?)\b/i },
  { bucket: "Cable", words: /\b(cables?|pulleys?|crossovers?)\b/i },
  { bucket: "Machine", words: /\b(machines?|smith|leg press|selectorised)\b/i },
  { bucket: "Bodyweight", words: /\b(bodyweight|body weight|calisthenics|no equipment|no kit|nothing)\b/i },
];

/** "only", "just", "all I have" — the athlete is naming what they HAVE. */
const ONLY = /\b(only|just|all i (have|ve got|got)|nothing but|limited to|access to|i have|i've got|ive got|we have)\b/i;

const ALL_BUCKETS = ["Barbell", "Dumbbell", "Kettlebell", "Cable", "Machine", "Bodyweight"];

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
  // Deliberately BEFORE the impact rule and separate from conditioning: this
  // drops every run in the library while leaving the bike, rower and skipping
  // to fill the conditioning slot — which is what someone with shin splints
  // actually wants. The named-movement rule below still fires too; they agree.
  { region: "running", label: "running", words: /\b(running|jogging|jog|runs)\b/i },
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
  if (!text) return { excludeRegions: [], excludeMovements: [], summary: [], equipment: [] };

  const regions = new Set<Region>();
  const movements = new Set<string>();
  const labels = new Map<Region, string>();
  /** Named as available; null until a clause says so. */
  let have: Set<string> | null = null;
  const lack = new Set<string>();

  for (const clause of clauses(text)) {
    /**
     * EQUIPMENT IS READ BEFORE THE NEGATION GATE, because "I only have
     * dumbbells" is a restriction with no negation word in it at all. Every
     * other rule here is a thing to leave out; this one is often a thing to
     * keep, and gating it behind NEGATIONS would drop exactly the phrasing
     * most people use.
     */
    const negated = NEGATIONS.test(clause);
    for (const { bucket, words } of EQUIPMENT_WORDS) {
      if (!words.test(clause)) continue;
      if (negated) lack.add(bucket);
      else if (ONLY.test(clause)) (have ??= new Set()).add(bucket);
    }

    if (!negated) continue;
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

  /**
   * "Only dumbbells" wins over "no barbell" when both appear, because naming
   * what you have is the more complete statement. Bodyweight is added to any
   * explicit list: it costs nothing and is always available.
   */
  let equipment: string[] = [];
  if (have && have.size) {
    equipment = [...new Set([...have, "Bodyweight"])];
  } else if (lack.size) {
    equipment = ALL_BUCKETS.filter((b) => !lack.has(b) || b === "Bodyweight");
  }
  if (equipment.length) {
    const named = equipment.filter((b) => b !== "Bodyweight");
    summary.push(
      named.length
        ? `Built around ${listOf(named.map((b) => `${b.toLowerCase()}s`))} — that is the kit you said you have.`
        : "Built from bodyweight movements — no kit needed.",
    );
  }

  return { excludeRegions, excludeMovements: [...movements], summary, equipment };
}

/** "dumbbells", "dumbbells and cables", "dumbbells, cables and machines". */
function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * True when an exercise cannot be done with the kit the athlete has.
 *
 * Bodyweight is always allowed — see the note on `Constraints.equipment`. An
 * empty list means no restriction was expressed, which is most athletes, and
 * must not be read as "they have nothing".
 */
export function hasEquipmentFor(c: Constraints, equipment: string | null | undefined): boolean {
  if (!c.equipment?.length) return true;
  const bucket = equipBucket(String(equipment ?? ""));
  if (bucket === "Bodyweight" || bucket === "Other") return true;
  return c.equipment.includes(bucket);
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
