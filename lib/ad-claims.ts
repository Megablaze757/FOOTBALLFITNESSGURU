/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT A FITNESS APP MAY NOT SAY IN THE UK.
 *
 * This is the piece that makes drafted marketing copy safe to generate at all.
 * A model asked to write an ad for a nutrition and training app will cheerfully
 * produce "lose 10kg in six weeks", "boosts your metabolism" and "guaranteed
 * results", and every one of those is a breach rather than a matter of taste.
 *
 * The rules being approximated, so the next person can check them:
 *
 *   CAP Code s.13 (Weight control and slimming) — claims about the RATE or
 *   AMOUNT of weight loss must not be made for anything other than a
 *   medically-supervised programme. This is the one an app like this walks into
 *   first, because "lose a stone by Christmas" is the copy everyone writes.
 *
 *   GB Nutrition and Health Claims Register — a health claim about a food is
 *   only permitted if it is on the register, in the authorised wording.
 *   "Boosts metabolism", "burns fat" and "detoxes" are not on it and never
 *   have been.
 *
 *   CAP Code s.12 (Medicines) — only licensed products may claim to treat,
 *   cure or prevent disease. A meal planner is not one.
 *
 *   CAP Code s.3 (Misleading advertising) — objective claims need evidence
 *   before publication, which covers "the UK's #1", "clinically proven", and
 *   guarantees of outcome. It also covers a "free" that is not free.
 *
 *   CAP Code s.13.3 / 1.3 — weight-control marketing must not be directed at
 *   under-18s.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIS IS A SIEVE, NOT A SOLICITOR.
 *
 * It catches the phrasings a model reaches for. It cannot read a whole page for
 * overall impression, which is what the ASA actually rules on, and it will
 * never catch a claim written in words nobody predicted. Everything it passes
 * still gets read by a person before it is sent. Its job is to make sure that
 * person is reading three drafts rather than thirty.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** blocked: do not send. review: defensible IF you hold the evidence. */
export type ClaimRisk = "blocked" | "review";

export interface ClaimFinding {
  risk: ClaimRisk;
  /** Short stable id, so a finding can be discussed without quoting it. */
  rule: string;
  why: string;
  matched: string;
}

interface Rule {
  rule: string;
  risk: ClaimRisk;
  why: string;
  patterns: RegExp[];
}

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const WEIGHT_UNIT = String.raw`(?:kg|kgs|kilos?|kilograms?|lbs?|pounds?|stone|stones?|st\b|inches|inch|cm|dress sizes?|sizes?)`;
const TIME = String.raw`(?:day|days|week|weeks|month|months|fortnight|night|nights)`;

const RULES: Rule[] = [
  {
    rule: "weight-loss-rate",
    risk: "blocked",
    why: "CAP 13: the rate or amount of weight loss may not be claimed outside a "
      + "medically supervised programme.",
    patterns: [
      // "lose 10kg in 6 weeks", "drop 2 stone by summer", "-5kg in a month"
      new RegExp(String.raw`\b(?:lose|lost|losing|drop|dropped|shed|shift|burn|torch)\b[^.!?]{0,40}\b${NUM}\s*${WEIGHT_UNIT}`, "i"),
      new RegExp(String.raw`\b${NUM}\s*${WEIGHT_UNIT}[^.!?]{0,40}\b(?:in|within|inside|per|a|every)\s*(?:${NUM}\s*)?${TIME}\b`, "i"),
      // "lose weight in 30 days"
      new RegExp(String.raw`\b(?:lose|losing|drop|shed)\b[^.!?]{0,30}\bweight\b[^.!?]{0,30}\b(?:in|within|inside)\s*(?:${NUM}\s*)?${TIME}\b`, "i"),
      /\b(?:a|one|two|three) (?:stone|dress size)s?\b[^.!?]{0,30}\b(?:by|in|before)\b/i,
    ],
  },
  {
    rule: "unauthorised-health-claim",
    risk: "blocked",
    why: "A health claim about food must appear on the GB Nutrition and Health "
      + "Claims Register in its authorised wording. These are not on it.",
    patterns: [
      /\b(?:boosts?|boosting|speeds? up|revs? up|fires? up|kickstarts?)\b[^.!?]{0,20}\b(?:metabolism|metabolic rate)\b/i,
      /\b(?:burns?|burning|melts?|melting|torches?|blasts?)\b[^.!?]{0,20}\b(?:fat|belly fat|calories)\b/i,
      /\bdetox(?:es|ing|ify|ifies)?\b/i,
      /\bcleanses? (?:your|the) (?:body|system|gut|liver)\b/i,
      /\bflushes? out (?:toxins|fat)\b/i,
      /\b(?:balances?|resets?|fixes?) (?:your |the )?(?:hormones|metabolism|gut health)\b/i,
      /\bimmun(?:e|ity)[- ]boost/i,
      /\banti[- ]?(?:ageing|aging|inflammatory)\b/i,
      /\bsuperfoods?\b/i,
    ],
  },
  {
    rule: "medical-claim",
    risk: "blocked",
    why: "CAP 12: only a licensed medicine may claim to treat, cure or prevent "
      + "disease, injury or a medical condition.",
    patterns: [
      /\b(?:treats?|cures?|heals?|reverses?|eliminates?)\b[^.!?]{0,25}\b(?:diabetes|obesity|depression|anxiety|arthritis|disease|illness|condition|injury|injuries|pain)\b/i,
      /\bprevents?\b[^.!?]{0,25}\b(?:injury|injuries|disease|illness|diabetes|cancer|dementia)\b/i,
      /\b(?:injury|injuries)[- ]?(?:proof|free)\b/i,
      /\bbulletproof\b/i,
      /\brehabilitat/i,
      /\b(?:doctor|clinically|medically)[- ]?(?:recommended|approved|prescribed)\b/i,
      /\b(?:is|are|fully|all)\s+medically supervised\b/i,
    ],
  },
  {
    rule: "guaranteed-outcome",
    risk: "blocked",
    why: "CAP 3.1: a guaranteed result you cannot deliver for every customer is "
      + "misleading.",
    patterns: [
      /\bguarantee(?:d|s|ing)?\b/i,
      // Result verbs only. "You will get a plan every Sunday" is a description
      // of the product, not a promise about somebody's body.
      /\b(?:you|they)\s+will\s+(?:lose|shed|drop|gain|build|achieve|transform)\b/i,
      /\b(?:you|they)\s+will\s+see\s+(?:results|changes|a difference)\b/i,
      /\bresults?\s+(?:are\s+)?(?:guaranteed|certain|assured)\b/i,
      /\bno(?:t)?\s+fail\b|\bcan(?:'|no)?t fail\b|\bfool ?proof\b/i,
    ],
  },
  {
    rule: "unsubstantiated-superlative",
    risk: "review",
    why: "CAP 3.7: an objective superlative needs documentary evidence held "
      + "before publication. Keep it only if you can prove it.",
    patterns: [
      /\b(?:the )?(?:uk|world|britain)(?:'s)?\s*(?:#\s*1|number one|no\.?\s*1|leading|best)\b/i,
      // Nouns that make it an OBJECTIVE comparison needing evidence. "The best
      // way to train" is subjective puffery, which CAP permits; "the best app"
      // is a comparison with named competitors, which it does not. Dropping
      // "way" is that distinction, not a convenience — it was also flagging
      // "so the only way to find out is to try it", which claims nothing.
      /\bthe (?:best|only|fastest|most effective)\b[^.!?]{0,25}\b(?:app|plan|programme|program|coach|system|tool|service)\b/i,
      /\bclinically proven\b|\bscientifically proven\b|\bproven to\b/i,
      /\b(?:\d+|\w+) times (?:faster|better|more effective)\b/i,
      /\bmost (?:accurate|advanced|powerful)\b/i,
    ],
  },
  {
    rule: "typical-results",
    risk: "review",
    why: "CAP 3.45: a testimonial must not imply a typical result unless it is "
      + "one. Say what is typical, or do not imply it.",
    patterns: [
      /\b(?:our|my) (?:athletes?|users?|clients?|members?)\s+(?:all|always|typically)\b/i,
      /\beveryone who\b[^.!?]{0,30}\b(?:loses|gains|sees|gets)\b/i,
      /\baverage (?:user|athlete|member) (?:loses|gains|sees)\b/i,
    ],
  },
  {
    rule: "under-18",
    risk: "blocked",
    why: "CAP 13.3 and 1.3: weight-control and body-shape marketing must not be "
      + "directed at under-18s.",
    patterns: [
      /\b(?:teens?|teenagers?|kids?|children|schoolchildren|under[- ]?(?:16|18)s?)\b[^.!?]{0,30}\b(?:lose weight|slim|diet|shred|lean up)\b/i,
      /\b(?:lose weight|slim down|get lean)\b[^.!?]{0,30}\b(?:teens?|teenagers?|kids?|children)\b/i,
    ],
  },
  {
    rule: "pricing-claim",
    risk: "review",
    why: "CAP 3.23-3.26: 'free' must be genuinely free and a saving must be "
      + "against a price actually charged. Check this against Stripe.",
    patterns: [
      // NOT bare "free forever". This app has a real free tier that takes no
      // card, so saying so is a fact about the product. What is worth a look is
      // the absolutist framing on a freemium product, where "100% free" is
      // doing work the pricing page contradicts.
      /\b100%\s*free\b|\bcompletely free\b|\bentirely free\b|\bfree,? no catch\b/i,
      /\bsave (?:up to )?\d+%/i,
      /\b(?:was|rrp)\s*£\s*\d/i,
      /\bhalf price\b|\b\d+%\s*off\b/i,
      /\bor your money back\b|\bmoney[- ]back\b/i,
    ],
  },
  {
    rule: "false-urgency",
    risk: "review",
    why: "CAP 3.28-3.31: urgency and scarcity must be real. Only keep this if "
      + "the deadline or the cap genuinely exists.",
    patterns: [
      /\bonly \d+ (?:spots?|places?|left|remaining)\b/i,
      /\b(?:ends|closes) (?:tonight|today|at midnight)\b/i,
      /\blast chance\b|\bfinal (?:few|hours)\b/i,
      /\bselling fast\b|\balmost gone\b/i,
    ],
  },
];

/**
 * Every rule a piece of copy trips.
 *
 * Returns findings rather than a verdict: "rejected" tells the person holding
 * the draft nothing, and they need to know whether to delete a sentence or go
 * and find the evidence for it.
 */
export function claimFindings(text: string): ClaimFinding[] {
  const findings: ClaimFinding[] = [];
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const hit = text.match(pattern);
      if (!hit) continue;
      findings.push({ risk: rule.risk, rule: rule.rule, why: rule.why, matched: hit[0].trim() });
      break; // One finding per rule — three ways of saying the same thing is one problem.
    }
  }
  return findings;
}

/** True when the copy cannot be sent as written, whatever evidence exists. */
export function blocked(findings: ClaimFinding[]): boolean {
  return findings.some((f) => f.risk === "blocked");
}

export function summarise(findings: ClaimFinding[]): string {
  if (findings.length === 0) return "no claim problems found";
  const counts = { blocked: 0, review: 0 };
  for (const f of findings) counts[f.risk]++;
  const parts: string[] = [];
  if (counts.blocked) parts.push(`${counts.blocked} blocked`);
  if (counts.review) parts.push(`${counts.review} to check`);
  return parts.join(", ");
}

/** The rule ids, so a test can prove every rule is reachable. */
export const RULE_IDS = RULES.map((r) => r.rule);
