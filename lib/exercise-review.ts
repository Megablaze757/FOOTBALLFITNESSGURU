/**
 * Turning something an athlete typed into a library entry.
 *
 * People add their own movements — the library page has had the form for a
 * while — and what they type is a name and not much else. "Copenhagen plank",
 * category Strength, no cues, no how-to, no video. That is enough for the
 * person who wrote it and not enough to put in front of everybody, which is
 * exactly the gap this module is about: an admin picks the ones worth keeping,
 * the AI drafts the detail, and a human reads it before it ships.
 *
 * WHY THE VALIDATION LIVES HERE rather than in the component. Two callers have
 * to agree about what a publishable exercise is — the review panel that greys
 * out the button and the row that gets written — and a rule that exists in the
 * UI only is a rule the database does not have. Keeping it pure also means it
 * can be tested without a browser, which is what these rules need: they are
 * about a model's output, and a model's output is the part that surprises you.
 */

import {
  EXERCISES, EXERCISE_CATEGORIES, DEMO_PATTERNS, DIFFICULTIES,
  type ExerciseCategory, type DemoPattern, type Difficulty,
} from "@/lib/exercises";

/** What a review produces. Every field is optional until it isn't — see publishBlockers. */
export interface ExerciseDraft {
  category: ExerciseCategory;
  demo: DemoPattern;
  difficulty: Difficulty | null;
  equipment: string;
  muscles: string[];
  cues: string[];
  tempo: string;
  why: string;
  description: string;
  youtubeId: string | null;
  /** A query worth running on YouTube. NOT a link — see below. */
  videoSearch: string;
}

export const EMPTY_DRAFT: ExerciseDraft = {
  category: "Strength", demo: "squat", difficulty: null, equipment: "", muscles: [],
  cues: [], tempo: "", why: "", description: "", youtubeId: null, videoSearch: "",
};

// --- videos -------------------------------------------------------------------

/**
 * A YOUTUBE ID IS NEVER TAKEN FROM THE MODEL, and this is the reason.
 *
 * An eleven-character video id is exactly the kind of thing a language model
 * will produce on demand and get wrong: the shape is trivial to imitate and the
 * content is unguessable, so a hallucinated one looks completely real right up
 * until it 404s in front of an athlete. There is no prompt that fixes that.
 *
 * So the model is asked for a SEARCH, a human runs it, watches the clip, and
 * pastes the URL. This function is the only route an id takes into the app, and
 * the review panel plays it back before anything is published — which is a
 * stronger check than any API call: somebody watched it.
 */
export function parseYouTubeId(input: string): string | null {
  const raw = (input || "").trim();
  if (!raw) return null;

  // A bare id, pasted from anywhere.
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const id = (value: string | null) =>
    value && /^[A-Za-z0-9_-]{11}$/.test(value) ? value : null;

  if (host === "youtu.be") return id(url.pathname.slice(1).split("/")[0]);
  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "music.youtube.com") return null;

  if (url.pathname === "/watch") return id(url.searchParams.get("v"));
  const path = /^\/(?:embed|shorts|v|live)\/([^/?#]+)/.exec(url.pathname);
  return path ? id(path[1]) : null;
}

/** What to search for when nobody has chosen a clip yet. */
export function videoSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

// --- the model's answer, clamped ----------------------------------------------

const CATEGORY = new Set<string>(EXERCISE_CATEGORIES);
const DEMO = new Set<string>(DEMO_PATTERNS.map((d) => d.id));
const DIFF = new Set<string>(DIFFICULTIES.map((d) => d.id));

function line(value: unknown, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function list(value: unknown, max: number, each: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => line(v, each)).filter(Boolean).slice(0, max);
}

/**
 * Whatever came back, in the shape the rest of the app expects.
 *
 * NOTHING HERE TRUSTS THE MODEL'S ENUMS. It is asked for one of nine
 * categories and it will occasionally answer "Conditioning", which is a
 * reasonable word and not a value this app has — and an out-of-range category
 * does not fail loudly, it just makes the exercise invisible to every filter.
 * An unrecognised value falls back rather than passing through.
 */
export function normaliseDraft(raw: unknown, fallback: Partial<ExerciseDraft> = {}): ExerciseDraft {
  const r = (raw ?? {}) as Record<string, unknown>;
  const base = { ...EMPTY_DRAFT, ...fallback };

  const category = line(r.category, 24);
  const demo = line(r.demo, 16).toLowerCase();
  const difficulty = line(r.difficulty, 16).toLowerCase();

  return {
    category: CATEGORY.has(category) ? (category as ExerciseCategory) : base.category,
    demo: DEMO.has(demo) ? (demo as DemoPattern) : base.demo,
    difficulty: DIFF.has(difficulty) ? (difficulty as Difficulty) : base.difficulty,
    equipment: line(r.equipment, 60) || base.equipment,
    muscles: list(r.muscles, 6, 28).length ? list(r.muscles, 6, 28) : base.muscles,
    cues: list(r.cues, 4, 90).length ? list(r.cues, 4, 90) : base.cues,
    tempo: line(r.tempo, 40) || base.tempo,
    why: line(r.why, 160) || base.why,
    // The only multi-line field: a how-to is paragraphs, and flattening it to
    // one line is what made the old descriptions unreadable.
    description: String(r.description ?? "").trim().slice(0, 1500) || base.description,
    // Deliberately ignored from the model. See parseYouTubeId.
    youtubeId: base.youtubeId,
    videoSearch: line(r.videoSearch, 100) || base.videoSearch,
  };
}

// --- is it fit to publish -----------------------------------------------------

/**
 * What is still missing, in words an admin can act on.
 *
 * A disabled button that does not say why is the same as a broken one. These
 * are the fields that make the difference between a library card and a name in
 * a list — an entry published without cues or a how-to is worse than no entry,
 * because it looks answered.
 */
export function publishBlockers(draft: ExerciseDraft, name: string): string[] {
  const missing: string[] = [];
  if (line(name, 80).length < 3) missing.push("It needs a name.");
  /**
   * PUBLISHING A NAME THE CATALOGUE ALREADY HAS PRODUCES TWO CARDS, and it is
   * not obvious from this screen that it would: an admin reading a queue of
   * things athletes typed has no reason to remember all 500-odd compiled
   * entries. Two "Bulgarian split squat" rows, one of them thinner than the
   * other, is a library that looks broken.
   */
  if (nameTaken(name)) missing.push("The library already has an exercise with this name.");
  if (draft.cues.length < 2) missing.push("At least two coaching cues.");
  if (draft.why.length < 20) missing.push("One line on why it helps.");
  if (draft.description.trim().length < 80) missing.push("A how-to somebody could follow.");
  if (draft.muscles.length < 1) missing.push("At least one muscle worked.");
  if (!draft.equipment.trim()) missing.push("What equipment it needs (or “None”).");
  /**
   * A VIDEO IS NOT OPTIONAL HERE, and it is the one rule people will want to
   * skip. The app answers "how does this go?" with a clip and nothing else —
   * the drawings were deleted for good reasons — so a published exercise with
   * no video is a card that opens onto a search box. Curated entries have one.
   * These have to as well.
   */
  if (!draft.youtubeId) missing.push("A video guide you have watched.");
  return missing;
}

/**
 * Is this name already in the compiled catalogue?
 *
 * Compared loosely — case, punctuation and spacing all vary in something
 * somebody typed on a phone, and "Bulgarian Split-Squat" is not a second
 * exercise. Only the compiled list: a published custom entry is checked in the
 * review panel, which has both lists in front of it anyway.
 */
export function nameTaken(name: string): boolean {
  const key = normaliseName(name);
  if (!key) return false;
  return EXERCISES.some((e) => normaliseName(e.name) === key);
}

function normaliseName(value: string): string {
  return (value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function canPublish(draft: ExerciseDraft, name: string): boolean {
  return publishBlockers(draft, name).length === 0;
}

/**
 * The row shape written to custom_exercises on publish.
 *
 * Separate from the draft because the column names are the database's and the
 * field names are the app's, and one of those two changes more often.
 */
export function publishRow(draft: ExerciseDraft, adminId: string) {
  return {
    published: true,
    published_at: new Date().toISOString(),
    published_by: adminId,
    category: draft.category,
    demo: draft.demo,
    difficulty: draft.difficulty,
    equipment: draft.equipment.trim(),
    muscles: draft.muscles,
    cues: draft.cues,
    tempo: draft.tempo.trim() || null,
    why: draft.why.trim(),
    description: draft.description.trim(),
    youtube_id: draft.youtubeId,
  };
}
