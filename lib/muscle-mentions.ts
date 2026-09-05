// =============================================================================
// "MENTIONS THE LOWER BACK" IS NOT "TRAINS THE LOWER BACK".
//
// ═══════════════════════════════════════════════════════════════════════════
// THE CHEAPEST SEO WIN IN THE CATALOGUE, AND THE EASIEST ONE TO GET WRONG.
//
// Eight hub pages are short of the entries they need to publish, and 162
// exercises already NAME one of those muscles without being tagged with it.
// Tagging them would close most of the gaps with no new writing at all.
//
// Except that most of those mentions are the opposite of a tag. "Grip" appears
// 43 times and "lower back" 38, and the overwhelming majority are cues telling
// you to KEEP THE LOAD OUT of that place — "keep your lower back neutral",
// "without arching", "the bar, not your grip". Tagging on a bare mention would
// put the deadlift on the lower-back hub as an exercise that trains the lower
// back, which is wrong content on a page built to answer a question. Wrong
// content is worse than a thin page: a thin page disappoints, and a wrong one
// gets somebody hurt.
//
// So the mention is read in context, and the two cases are told apart.
//
// THE BIAS IS DELIBERATE AND ASYMMETRIC. Where both readings are available,
// protective wins. A false "trains" publishes something untrue; a false
// "protects" leaves a gap that was already there. Those costs are nowhere near
// equal, so the rule is not balanced either.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

import type { Exercise } from "./exercises";

export type MentionKind =
  /** The exercise works this muscle. A tag is warranted. */
  | "trains"
  /** The text names it to say keep the load OFF it. A tag would be a lie. */
  | "protects"
  /**
   * The muscle is WHERE THE EQUIPMENT SITS, not what is being worked.
   *
   * "With the bar racked on your upper back" and "bar on the upper back, step
   * forward" both read as training to any rule looking for coaching verbs —
   * the same sentences say "brace your core" — and both are the back squat and
   * the lunge, which do not train the upper back at all. Found by reading what
   * the first version of this file actually produced.
   */
  | "holds"
  /** Named, but nothing says which. A person has to read it. */
  | "unclear";

/**
 * Language that means "keep this out of it".
 *
 * Taken from the cues actually in the catalogue rather than invented: coaching
 * writing is formulaic in exactly this way, which is what makes the split
 * detectable at all.
 */
const PROTECTIVE = [
  /\bkeep\b[^.]*\b(neutral|flat|straight|still|long|braced|out of)\b/i,
  /\bwithout\b/i,
  /\b(avoid|avoiding)\b/i,
  /\b(do ?n[o']t|don't|never|stop|resist)\b/i,
  /\b(protect|protecting|spare|sparing|save|saving)\b/i,
  // NOTE: contrast markers ("rather than", "instead of") are handled
  // separately below — they are protective only for the muscle on the far
  // side of them. See CONTRAST.
  /\b(off|out of) (the|your)\b/i,
  /\b(no|less|minimal|takes? the load off)\b/i,
  /\b(should ?n[o']t|shouldn't|must ?n[o']t|mustn't)\b/i,
  /**
   * Faults, named as faults.
   *
   * "Punishes a rounded upper back" is a warning about a mistake, and the
   * first version read it as training because "punishes" is a verb doing
   * something to a muscle. Every word here only ever appears in this app to
   * describe a position to avoid.
   */
  /\b(punish|punishes|punishing|rounded|rounding|collapse|collapsing|collapses)\b/i,
  /\b(sag|sags|sagging|arch|arches|arching|hyperextend|hyperextends|hyperextending|twist|twisting)\b/i,
  /**
   * Phrases that say the muscle is being REMOVED from the movement, or that
   * feeling it there is the fault to fix. Both read as training to a rule
   * looking for verbs, and both mean the opposite.
   *
   *   "the bench ... takes the lower back out"     — it is not involved
   *   "if you feel it in your lower back, tuck"    — that is the mistake
   */
  /\b(takes?|taking|removes?|removing|keeps?)\b[^.]{0,30}\bout\b/i,
  /\bif you feel it in\b/i,
  /\bflatten(s|ing)?\b/i,
  // "easier on the lower back", "without loading the lower back", "nothing
  // sits on it" — all describe a movement that spares it.
  /\b(easier|easy|gentler|kinder|light) on\b/i,
  /\b(nothing|no load|no weight)\b[^.]{0,20}\b(sits|rests|on)\b/i,
];

/**
 * Words that are a HAND POSITION rather than the muscle of the same name.
 *
 * "Close Grip Bench Press", "Neutral Grip Pull Ups" — thirteen of the grip
 * "candidates" were this, because the name signal treats any occurrence in a
 * title as decisive and a title is where this word is least likely to mean the
 * muscle. It is a real weakness of the name rule rather than a special case:
 * the strongest signal in the file is also the one with no surrounding clause
 * to check.
 */
const NAME_MODIFIER = /\b(close|neutral|wide|narrow|reverse|mixed|overhand|underhand|false|hook|snatch|staggered|split|supinated|pronated)\s+$/i;

/**
 * A contrast is protective for ONE SIDE ONLY.
 *
 * "It puts the load on the glutes rather than the quads" trains the glutes and
 * spares the quads — the same sentence, opposite answers, decided entirely by
 * which side of the marker the muscle sits on. Treating the marker as
 * protective for the whole sentence lost every "works X rather than Y" line in
 * the catalogue, which is a common way to write the most useful sentence there
 * is: what this movement does that its obvious alternative does not.
 */
const CONTRAST = /\b(instead of|rather than|not from|not with|not your|not the)\b/i;

/**
 * Equipment resting somewhere, rather than working it.
 *
 * Deliberately narrow: it requires a named piece of KIT before the
 * preposition, because "the load on the glutes" is a training sentence and
 * "the bar on your upper back" is not, and the only thing separating them is
 * which noun is doing the sitting.
 */
const POSITIONAL = /\b(bar|barbell|dumbbell|dumbbells|weight|kettlebell|bell|pad|rope|band|strap)s?\b[^.]{0,40}?\b(on|across|against|behind|under|over)\s+(the|your)\s+$/i;

/** Language that means "this is what it works". */
const TRAINING = [
  /\b(works?|working|trains?|training|targets?|targeting)\b/i,
  /\b(builds?|building|strengthens?|strengthening|develops?|developing)\b/i,
  /\b(loads?|loading|hits?|hitting|drives? through|through the)\b/i,
  /\bfor (the|your) \w+/i,
  /\b(hold|squeeze|brace|contract|engage)s? (the|your)\b/i,
  /**
   * Mobility counts.
   *
   * "Stretches the lats at the top" is a lats entry — a hub page for a muscle
   * legitimately includes the work that lengthens it, not only the work that
   * loads it. Caught by an existing test in content-gaps, which had a fixture
   * for exactly this and went red when the count became a classified one.
   */
  /\b(stretch|stretches|stretching|lengthen|lengthens|lengthening|mobilise|mobilises|mobilising|mobilize|mobilizes|opens?|opening)\b/i,
];

/** Sentences, roughly. Enough to keep a cue's clause with its own verb. */
export function sentencesAbout(text: string, muscle: string): string[] {
  const needle = escape(muscle.toLowerCase());
  const pattern = new RegExp(`\\b${needle}\\b`, "i");
  return String(text ?? "")
    .split(/(?<=[.!?;])\s+/)
    .map((s) => s.trim())
    .filter((s) => pattern.test(s));
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * What one sentence is saying about this muscle.
 *
 * Protective checked FIRST and returned immediately — see the header. A cue
 * like "keep your lower back flat and drive through the legs" matches both
 * lists, and the honest reading of it is that the lower back is the thing to
 * protect while something else does the work.
 */
export function classifyMention(sentence: string, muscle: string): MentionKind {
  const text = String(sentence ?? "");
  if (!text.trim()) return "unclear";
  if (!new RegExp(`\\b${escape(muscle.toLowerCase())}\\b`, "i").test(text)) return "unclear";

  if (PROTECTIVE.some((p) => p.test(text))) return "protects";

  // Only if the muscle is on the far side of the contrast.
  const contrast = text.search(CONTRAST);
  const mentionAt = text.toLowerCase().indexOf(muscle.toLowerCase());
  if (contrast >= 0 && mentionAt > contrast) return "protects";

  /**
   * Checked BEFORE the training verbs, because these sentences almost always
   * contain one — "with the bar racked on your upper back, brace your core"
   * is a positional clause and a coaching cue in the same breath.
   */
  const at = text.toLowerCase().indexOf(muscle.toLowerCase());
  if (at > 0 && POSITIONAL.test(text.slice(0, at))) return "holds";

  if (TRAINING.some((p) => p.test(text))) return "trains";
  return "unclear";
}

export interface Mention {
  id: string;
  name: string;
  kind: MentionKind;
  /** The sentence it was read from, so a person can judge it in one glance. */
  evidence: string;
}

/**
 * Exercises worth tagging with this muscle, and the ones that only look it.
 *
 * THE NAME IS THE STRONGEST SIGNAL THERE IS. "Glute bridge" trains the glutes;
 * nobody names a movement after the thing they are trying to keep out of it.
 * Checked before any sentence, because a name has no surrounding clause to
 * read and would otherwise fall to "unclear".
 */
export function readMentions(all: readonly Exercise[], muscle: string): Mention[] {
  const needle = muscle.toLowerCase();
  const named = new RegExp(`\\b${escape(needle)}\\b`, "i");
  const out: Mention[] = [];

  for (const exercise of all) {
    if (exercise.muscles.some((m) => m.toLowerCase() === needle)) continue;

    const at = exercise.name.toLowerCase().indexOf(needle);
    if (at >= 0 && !NAME_MODIFIER.test(exercise.name.slice(0, at))) {
      out.push({ id: exercise.id, name: exercise.name, kind: "trains", evidence: exercise.name });
      continue;
    }

    const text = `${exercise.why} ${exercise.description ?? ""} ${exercise.cues.join(" ")}`;
    const sentences = sentencesAbout(text, muscle);
    if (!sentences.length) continue;

    /**
     * ANY protective sentence settles it.
     *
     * An exercise whose text says both "works the glutes" and "keep the lower
     * back flat" is being read for the LOWER BACK here, and the protective
     * sentence is the one about the lower back. Taking the first sentence, or
     * a majority, would let one enthusiastic line outvote the warning.
     */
    const kinds = sentences.map((s) => classifyMention(s, muscle));
    const protective = kinds.indexOf("protects");
    if (protective >= 0) {
      out.push({ id: exercise.id, name: exercise.name, kind: "protects", evidence: sentences[protective] });
      continue;
    }
    /**
     * ORDER: protects, then trains, then holds.
     *
     * "holds" is a FALLBACK, not a veto — unlike a warning. Within a single
     * sentence it beats a training verb, because "with the bar racked on your
     * upper back, brace your core" is a positional clause whose verb is about
     * something else. But an entry that ALSO has a sentence explicitly saying
     * it works that muscle is telling you something the positional clause
     * cannot override: the bar sitting somewhere and the movement training it
     * are not mutually exclusive.
     */
    const trains = kinds.indexOf("trains");
    if (trains >= 0) {
      out.push({ id: exercise.id, name: exercise.name, kind: "trains", evidence: sentences[trains] });
      continue;
    }
    const holds = kinds.indexOf("holds");
    out.push({
      id: exercise.id,
      name: exercise.name,
      kind: holds >= 0 ? "holds" : "unclear",
      evidence: sentences[Math.max(0, holds)],
    });
  }
  return out;
}

/** The ones worth acting on: a tag here is true. */
export function taggable(all: readonly Exercise[], muscle: string): Mention[] {
  return readMentions(all, muscle).filter((m) => m.kind === "trains");
}
