// =============================================================================
// Why this session, today.
//
// The plan could already explain itself when something went WRONG — a readiness
// adaptation, a rehab substitution, a validator correction each say so on the
// screen. What it never said was the ordinary case: why these exercises, in
// this order, in this week. An athlete opening Tuesday saw a list and had to
// take it on faith, which is most of what "I don't know if this is a good
// program" means in practice.
//
// EVERY LINE IS DERIVED, NEVER WRITTEN. The block phase comes from the week,
// the shape from counting the drills, the emphasis from what they train. There
// is no copy here that could still be on the screen after the thing it
// describes has changed — which is the failure mode of a hand-written "why we
// programmed this" and the reason this is a function rather than a paragraph.
// =============================================================================

import type { GoalType, ProgramDrill } from "./engine";
import { kindOf, isWorkingSet } from "./session-shape";
import { musclesForName, GROUP_LABEL } from "./hypertrophy";

export interface WhyLine {
  /** Icon name from components/Icon.tsx. */
  icon: string;
  text: string;
}

export interface SessionWhy {
  /** One line, the phase this sits in. Always present. */
  headline: string;
  lines: WhyLine[];
}

export interface SessionWhyInput {
  week: { week: number; theme: string; intensity: string; focusNote: string };
  totalWeeks: number;
  session: { focus?: GoalType | null; kind?: string | null; drills: ProgramDrill[] };
  /** "Speed", "Strength & power" — the athlete's own words for the goal. */
  goalLabel?: string | null;
  isInSeason?: boolean;
  /** Set when today's check-in eased or replaced the session. */
  readiness?: "Green" | "Yellow" | "Red" | null;
  /** True when an active rehab plan contributed drills. */
  hasRehab?: boolean;
}

/** What the working sets add up to, in the words a person would use. */
function shapeLine(drills: ProgramDrill[]): WhyLine | null {
  const working = drills.filter((d) => !d.rehab && isWorkingSet(kindOf(d.name, d.slot ?? null)));
  if (!working.length) return null;

  const compounds = working.filter((d) => ["power", "compound", "secondary"].includes(kindOf(d.name, d.slot ?? null)));
  const sets = working.reduce((n, d) => n + (Number(d.sets) || 0), 0);
  const parts: string[] = [];
  if (compounds.length) parts.push(`${compounds.length} main ${compounds.length === 1 ? "lift" : "lifts"}`);
  const rest = working.length - compounds.length;
  if (rest > 0) parts.push(`${rest} ${rest === 1 ? "accessory" : "accessories"}`);
  if (!parts.length) return null;
  return { icon: "dumbbell", text: `${parts.join(" and ")} — ${sets} working sets in total.` };
}

/** The muscles the session actually loads, named. Two or three, not a list of nine. */
function emphasisLine(drills: ProgramDrill[]): WhyLine | null {
  const counts = new Map<string, number>();
  for (const d of drills) {
    if (d.rehab) continue;
    if (!isWorkingSet(kindOf(d.name, d.slot ?? null))) continue;
    for (const group of musclesForName(d.name)) {
      counts.set(group, (counts.get(group) ?? 0) + (Number(d.sets) || 1));
    }
  }
  if (!counts.size) return null;
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([g]) => GROUP_LABEL[g as keyof typeof GROUP_LABEL] ?? g);
  if (!top.length) return null;
  const named = top.length === 1 ? top[0] : `${top.slice(0, -1).join(", ")} and ${top[top.length - 1]}`;
  return { icon: "target", text: `Most of the work lands on ${named}.` };
}

/**
 * Why the session sits where it does in the week.
 *
 * Keyed on the goal the engine actually built it for, so a session the rotation
 * marked as speed says the speed reason even inside a strength block.
 */
const FOCUS_REASON: Partial<Record<GoalType, string>> = {
  speed: "Sprint work comes first, while you are fresh — speed trained tired is just conditioning.",
  agility: "Change of direction is a skill before it is fitness, so it goes in before the legs are heavy.",
  strength: "The heaviest lifts are early in the session, when you can actually be strong on them.",
  endurance: "The aerobic work is the point of this one rather than a finisher on the end of it.",
  injury_recovery: "This is a rebuild session: load the injured area on purpose, at a dose it can take.",
  skill: "Ball work while you are fresh — technique falls apart under fatigue and practising it badly sticks.",
};

export function sessionWhy(input: SessionWhyInput): SessionWhy {
  const { week, totalWeeks, session } = input;
  const headline = `Week ${week.week} of ${totalWeeks} · ${week.theme}`;

  const lines: WhyLine[] = [];

  // 1. The phase. What this week is for, in the engine's own words.
  if (week.focusNote) lines.push({ icon: "calendar", text: week.focusNote });

  // A deload is the week most likely to be misread as the app losing interest.
  if (/deload/i.test(week.theme)) {
    lines.push({
      icon: "sleep",
      text: "Same movements as last week, roughly 60% of the work. The gains are made while you recover from the three weeks before it.",
    });
  }

  if (session.kind === "active_rest") {
    lines.push({ icon: "walk", text: "A deliberate easy day, not a missing one — movement without adding fatigue." });
    return { headline, lines };
  }

  // 2. What is in it.
  const shape = shapeLine(session.drills);
  if (shape) lines.push(shape);

  // 3. What it trains.
  const emphasis = emphasisLine(session.drills);
  if (emphasis) lines.push(emphasis);

  // 4. Why it is shaped that way.
  const reason = session.focus ? FOCUS_REASON[session.focus] : undefined;
  if (reason) lines.push({ icon: "bolt", text: reason });

  // 5. The two things that override the plan, and say so elsewhere on the page.
  //    Named here so the card is not silent about the biggest change to it.
  if (input.hasRehab) {
    lines.push({ icon: "plaster", text: "Your rehab plan added work to this session, and it comes first." });
  }
  if (input.readiness === "Yellow" || input.readiness === "Red") {
    lines.push({
      icon: "note",
      text: input.readiness === "Red"
        ? "Today's log said recover, so this is not the session the block prescribed."
        : "Today's log said ease off, so this is a set lighter than prescribed.",
    });
  }
  if (input.isInSeason) {
    lines.push({ icon: "run", text: "In-season: the matches are the training load, so the gym keeps you robust rather than adding fatigue." });
  }

  return { headline, lines };
}
