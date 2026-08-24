/**
 * Screening what people type into the exercise library.
 *
 * WHAT IS ACTUALLY AT RISK, because it changes what this should do. A custom
 * exercise is seen by its author, by their squad if they coach one, and — once
 * an admin publishes it — by everybody. Those are three very different stakes,
 * and only the last one is a broadcast. The review queue already stands between
 * anything and the whole app: a human reads every field before it goes live.
 *
 * So this is NOT the thing keeping the global library clean. That is the
 * reviewer. This does two smaller jobs honestly:
 *
 *   1. Stops the unambiguous stuff at the form, so a squad never sees it and
 *      the author gets told immediately rather than silently ignored.
 *   2. Triages the review queue. An admin reading three hundred submissions
 *      should have the four worth looking at hard marked for them, not have to
 *      find them by reading everything.
 *
 * WHAT IT IS NOT. A wordlist is a weak filter and pretending otherwise is how
 * you end up trusting it. Anyone can bypass this by posting straight to
 * PostgREST with the publishable key, which is public by design — so the checks
 * that MUST hold live in the database (migration 0100: length caps, a rate
 * limit, a name that has to look like a name). Those are structural and a
 * regex is not.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE HARD PART IS FALSE POSITIVES, AND IN THIS DOMAIN IT IS NOT CLOSE.
 *
 * A gym catalogue is a minefield for a naive filter. Every one of these is a
 * real exercise or a real word in a real description:
 *
 *   clean and JERK · SNATCH · THRUSTer · hip THRUSt · ASSault bike
 *   ASSisted pull-up · pASSive hang · CLASS · repeTITion · ANALysis
 *   CUMulative load · sHELL · knee · shin
 *
 * Substring matching flags all of them. So every pattern here is anchored to
 * word boundaries, and the test suite runs the entire compiled catalogue —
 * every name, cue, why and description in lib/exercises.ts — through this
 * module and fails if a single one is touched. That test is the point. A
 * filter that blocks "Assisted pull-up" is worse than no filter, because it
 * teaches people the feature is broken.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** What to do about a submission. */
export type Verdict = "ok" | "flag" | "block";

export interface Finding {
  /** block = refuse the save. flag = let it through, mark it for the reviewer. */
  severity: "block" | "flag";
  /** Shown to the author on a block, to the admin on a flag. */
  message: string;
  /** Which field tripped it, for the review queue. */
  field: string;
}

export interface Submission {
  name: string;
  equipment?: string | null;
  muscles?: string[] | null;
  cues?: string[] | null;
  why?: string | null;
  description?: string | null;
}

// --- normalising, so the obvious dodges do not work ---------------------------

/**
 * Fold the cheap evasions before matching.
 *
 * Not a serious defence — somebody determined will get a word past this and
 * the reviewer is what catches them. It is here because `f*ck` and `sh1t` are
 * what people actually type when a filter exists, and letting the laziest
 * bypass through makes the filter look like it does nothing at all.
 *
 * Diacritics are folded too: NFD then strip the combining marks, so "ﬁancé"
 * and a slur spelled with an accent normalise the same way.
 */
function fold(value: string): string {
  return (value || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Leet substitutions, only the ones that are unambiguous in English words.
    .replace(/[@4]/g, "a").replace(/[0]/g, "o").replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e").replace(/[$5]/g, "s").replace(/[7]/g, "t")
    // Separators inside a word: f-u-c-k, f.u.c.k, f_u_c_k. Asterisks are NOT
    // removed here — they stand in for a letter rather than sitting between
    // two, so containsBlocked puts them back as vowels instead.
    .replace(/[.\-_+]+/g, "")
    // Runs of the same letter: fuuuuck, shhhit. Collapsed to ONE, not two —
    // "fuuuck" folded to "fuuck" still matches nothing, which is the whole
    // point of doing this. Only runs of three or more are touched, so real
    // double letters ("bollocks", "assisted") are left alone.
    .replace(/(.)\1{2,}/g, "$1");
}

/**
 * Terms that are never part of a coaching cue.
 *
 * DELIBERATELY SHORT. The long lists are where the false positives live, and
 * every entry here has to survive the catalogue test — so this covers slurs and
 * hard obscenity and stops. Mild profanity is a flag, not a block: somebody
 * writing "this one is brutal, it'll destroy your legs" is being a coach.
 *
 * Matched on word boundaries against the folded text. Never as substrings.
 */
const BLOCKED = [
  // Sexual and scatological, the unambiguous ones.
  "fuck", "fucking", "shit", "cunt", "wank", "wanker", "bollocks",
  "dick", "cock", "prick", "twat", "arsehole", "asshole", "bastard",
  "porn", "pornhub", "nude", "nudes", "blowjob", "handjob", "rape", "rapist",
  // Slurs. Not enumerated further than this; the reviewer is the backstop and
  // an exhaustive list in a public repo buys very little.
  "nigger", "nigga", "faggot", "fag", "tranny", "retard", "retarded",
  "paki", "chink", "spastic", "spaz",
  // Self-harm and violence directed at a person.
  "kys", "killyourself",
];

/** Mild stuff, and things that are only a problem in context. */
const FLAGGED_WORDS = [
  "damn", "crap", "piss", "bitch", "bloody", "arse", "ass",
  "sex", "sexy", "naked", "drunk", "weed", "cocaine", "steroid", "steroids",
  "anabolic", "clenbuterol", "dianabol", "sarms",
];

function wordRegex(words: string[]): RegExp {
  // \b on both sides is the whole design. "ass" must not match "assisted",
  // "analysis" or "passive" — see the header.
  return new RegExp(`\\b(?:${words.join("|")})\\b`, "i");
}

const BLOCKED_RE = wordRegex(BLOCKED);
const FLAGGED_RE = wordRegex(FLAGGED_WORDS);

/**
 * `f*ck` is the one evasion folding cannot undo.
 *
 * Every other dodge inserts or repeats characters, and fold() takes those back
 * out. An asterisk REPLACES a letter, so there is nothing to remove — stripping
 * it leaves "fck", which matches nothing. Rather than loosen the word patterns
 * (which is how a filter starts catching "feck", "fick" and then an exercise
 * nobody expected), the asterisks are put back as each vowel in turn: five
 * extra tests, and only when the text actually contains one.
 */
function containsBlocked(folded: string): boolean {
  if (BLOCKED_RE.test(folded)) return true;
  if (!folded.includes("*")) return false;
  return ["a", "e", "i", "o", "u"].some((v) => BLOCKED_RE.test(folded.replace(/\*/g, v)));
}

// --- shape checks -------------------------------------------------------------

/** A link, an address, a handle, a number — none of which belong in a movement. */
const CONTACT_RE =
  /(https?:\/\/|www\.|\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b|\b(?:t\.me|wa\.me|bit\.ly|discord\.gg)\b|\B@[a-z0-9._]{3,})/i;

const PHONE_RE = /(?:\+?\d[\d\s().-]{8,}\d)/;

/** Advertising, in the shapes it turns up in. */
const PROMO_RE =
  /\b(?:promo\s?code|discount\s?code|coupon|dm\s+me|whatsapp|telegram|onlyfans|cash\s?app|buy\s+now|click\s+here|subscribe|free\s+trial|limited\s+offer)\b/i;

/**
 * Somebody talking to the model instead of to an athlete.
 *
 * THIS IS NOT THEORETICAL HERE. The author's own description is passed to
 * draft-exercise as context, so a description is untrusted text that reaches a
 * prompt. The Worker wraps it and tells the model to treat it as data (see
 * draftExercise), which is the actual mitigation; this exists so a reviewer is
 * told that somebody tried, because somebody trying is worth knowing about
 * regardless of whether it worked.
 */
/**
 * `\b` sits on the WORD alternatives only.
 *
 * Wrapping the whole alternation in one `\b` looks tidier and silently breaks
 * every pattern that starts with punctuation: a word boundary before `<`
 * requires a word character to its left, so `<|im_start|>` at the start of a
 * description never matched. Caught by the test, not by reading it.
 */
const INJECTION_RE = new RegExp(
  [
    "\\b(?:ignore\\s+(?:all\\s+)?(?:previous|prior|above)\\s+instructions?)",
    "\\b(?:disregard\\s+(?:the\\s+)?(?:above|previous))",
    "\\b(?:system\\s+prompt)",
    "\\b(?:you\\s+are\\s+now\\s+a)",
    "\\b(?:act\\s+as\\s+(?:an?\\s+)?(?:ai|assistant))",
    "\\bjailbreak\\b",
    "<\\|im_(?:start|end)\\|>",
    "\\[\\[[^\\]]*\\]\\]",
  ].join("|"),
  "i",
);

// --- the check itself ---------------------------------------------------------

/** Longest a name can be before it stops being a name. Mirrored in migration 0100. */
export const NAME_MAX = 80;
export const DESCRIPTION_MAX = 2000;

export function screen(sub: Submission): { verdict: Verdict; findings: Finding[] } {
  const findings: Finding[] = [];
  const add = (severity: Finding["severity"], field: string, message: string) =>
    findings.push({ severity, field, message });

  const name = (sub.name || "").trim();
  const prose = [
    ["cues", (sub.cues ?? []).join(" ")],
    ["why", sub.why ?? ""],
    ["how-to", sub.description ?? ""],
    ["equipment", sub.equipment ?? ""],
    ["muscles", (sub.muscles ?? []).join(" ")],
  ] as const;

  // --- the name has to be a name ---
  if (name.length < 3) add("block", "name", "Give it a name of at least three characters.");
  if (name.length > NAME_MAX) add("block", "name", `Names stop at ${NAME_MAX} characters.`);
  /**
   * A NAME IS NOT A SENTENCE. Everything that got past the length check and was
   * still nonsense was one of these: no letters at all ("!!!!"), or a paragraph
   * pasted into the name field. Both make a library row that cannot be read in
   * a list.
   */
  if (name && !/\p{L}/u.test(name)) add("block", "name", "A name needs at least one letter in it.");
  if (/\n/.test(sub.name || "")) add("block", "name", "A name is one line.");
  if (CONTACT_RE.test(name) || PHONE_RE.test(name)) {
    add("block", "name", "An exercise name cannot contain a link, an address or a phone number.");
  }

  if ((sub.description ?? "").length > DESCRIPTION_MAX) {
    add("block", "how-to", `The how-to stops at ${DESCRIPTION_MAX} characters.`);
  }

  // --- language ---
  const fields: (readonly [string, string])[] = [["name", name], ...prose];
  for (const [field, text] of fields) {
    if (!text) continue;
    const folded = fold(text);
    if (containsBlocked(folded)) {
      add("block", field, "That wording is not something we will put in the library.");
    } else if (FLAGGED_RE.test(folded)) {
      add("flag", field, "Language worth a read before this is published.");
    }
  }

  // --- spam and injection, over the whole submission ---
  const all = fields.map(([, t]) => t).join("\n");
  if (CONTACT_RE.test(all)) add("flag", "how-to", "Contains a link, an address or a handle.");
  if (PHONE_RE.test(all)) add("flag", "how-to", "Contains something shaped like a phone number.");
  if (PROMO_RE.test(all)) add("flag", "how-to", "Reads like advertising.");
  if (INJECTION_RE.test(all)) add("flag", "how-to", "Contains text aimed at the AI rather than at an athlete.");

  /**
   * SHOUTING IS MEASURED PER FIELD, not across the lot.
   *
   * Joining everything first meant a normal name hid a screaming description:
   * "Squat" + "THIS IS THE BEST..." is not all-caps as one string, so a whole
   * paragraph in capitals went unflagged. The obvious version of this check was
   * the broken one.
   */
  for (const [field, text] of prose) {
    const letters = text.replace(/[^\p{L}]/gu, "");
    if (letters.length > 25 && letters === letters.toUpperCase()) {
      add("flag", field, "Written entirely in capitals.");
      break;
    }
  }

  const verdict: Verdict =
    findings.some((f) => f.severity === "block") ? "block"
      : findings.length ? "flag"
        : "ok";

  return { verdict, findings };
}

/** Just the blocking reasons, for a form that has to say why it refused. */
export function blockReasons(sub: Submission): string[] {
  const { findings } = screen(sub);
  // Deduplicated: the same wording tripping in three fields is one message to
  // the person typing, not three.
  return [...new Set(findings.filter((f) => f.severity === "block").map((f) => f.message))];
}

/** A short label for the review queue. Empty when there is nothing to say. */
export function flagSummary(sub: Submission): string[] {
  const { findings } = screen(sub);
  return [...new Set(findings.map((f) => f.message))];
}
