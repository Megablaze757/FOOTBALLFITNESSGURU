/**
 * Letting the athlete rearrange a session the engine wrote.
 *
 * WHY AN OVERLAY AND NOT AN EDIT. The plan is generated — from the goal, the
 * pain map, the block week, the equipment, the rehab protocol — and it gets
 * regenerated: a new block, a rebuild after an injury, a settings change. If
 * customising meant writing back into `programs.plan`, then every one of those
 * regenerations would silently throw the athlete's work away, and there would
 * be no way to tell what was theirs and what was the engine's.
 *
 * So a customisation is a small, separate record of INTENT — this drill moved
 * there, that one is out, this one is added — applied on read. The generated
 * plan stays exactly as generated, "reset to the original" is deleting a key,
 * and a drill the engine stops prescribing simply stops being reordered rather
 * than leaving a hole. It is the same shape as `swaps` (migration 0086) for the
 * same reasons, which is also why it lives beside it rather than inside it:
 * a swap says WHAT to do instead, this says in what ORDER and WHETHER.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ORDER IS COACHING, SO IT IS WARNED ABOUT RATHER THAN ENFORCED.
 *
 * Squats before accessories is not decoration — the heavy compound goes first
 * because that is when you can produce force, and a plan that puts curls ahead
 * of it trains the curls. But an athlete moving something has a reason the app
 * cannot see: a busy squat rack, a shoulder that needs longer to warm up, a
 * training partner. Blocking the move treats a coaching principle as a rule of
 * physics and makes people fight the app; saying nothing pretends the order was
 * arbitrary all along.
 *
 * So: the move always happens, and the warning says what it costs.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure and tested. The UI executes; nothing here touches Supabase.
 */

import type { ProgramDrill, ProgramSession } from "@/lib/engine";
import { SLOT_LABEL } from "@/lib/engine";

/** Which session an edit belongs to: "w1d3". Same key the completion list uses. */
export type SessionKey = string;

export function sessionKey(week: number, day: number): SessionKey {
  return `w${week}d${day}`;
}

/**
 * One session's customisation.
 *
 * Names rather than indices, deliberately. An index into the generated drill
 * list is meaningless the moment the engine emits a different number of drills
 * — which it does every week, because the block progresses — and an off-by-one
 * there silently reorders the wrong exercise rather than failing.
 */
export interface SessionEdit {
  /** Drill names in the order the athlete wants them. Partial is fine. */
  order?: string[];
  /** Drill names they have taken out. */
  removed?: string[];
  /** Extra drills they added, in full. */
  added?: ProgramDrill[];
}

export type ProgramEdits = Record<SessionKey, SessionEdit>;

// --- applying -----------------------------------------------------------------

/**
 * The session as the athlete wants to see it.
 *
 * TOLERANT OF A PLAN THAT MOVED UNDERNEATH IT, because it will. A name in
 * `order` that the engine no longer prescribes is ignored; a drill the engine
 * has newly added and the athlete has never sorted keeps its generated position
 * relative to its neighbours rather than being dumped at the end — a new
 * accessory appearing above the warm-up because it was unknown to an old edit
 * is exactly the kind of nonsense that makes people turn a feature off.
 */
export function applyEdit(session: ProgramSession, edit: SessionEdit | undefined): ProgramSession {
  if (!edit) return session;

  const removed = new Set(edit.removed ?? []);
  /**
   * REHAB WORK CANNOT BE REMOVED HERE, and this is the one hard rule.
   *
   * It is not an accessory somebody can decide against — it comes from an
   * active rehab protocol (lib/rehab-plan.ts), and the app already refuses to
   * offer a SWAP for it for the same reason. Quietly dropping it because a
   * stale edit still names it would take somebody off their protocol without
   * anybody choosing to.
   */
  const base = [...session.drills, ...(edit.added ?? [])]
    .filter((d) => d.rehab || !removed.has(d.name));

  const order = edit.order ?? [];
  if (order.length === 0) return { ...session, drills: base };

  const rank = new Map(order.map((name, i) => [name, i]));
  /**
   * A drill with no place in the order inherits its NEIGHBOUR's rank.
   *
   * Sorting unknowns to the end puts a freshly-generated warm-up after the
   * cool-down. Walking the generated list and carrying the last known rank
   * forward keeps a new drill next to the one the engine put it beside, which
   * is where it belongs until the athlete says otherwise.
   */
  let carried = -1;
  const effective = new Map<string, number>();
  base.forEach((d, i) => {
    const known = rank.get(d.name);
    if (known !== undefined) carried = known;
    // The +i/1000 keeps generated order as the tie-break inside a carried rank,
    // so two new neighbours do not swap places on every render.
    effective.set(d.name, (known ?? carried) + i / 1000);
  });

  const drills = [...base].sort((a, b) => (effective.get(a.name) ?? 0) - (effective.get(b.name) ?? 0));
  return { ...session, drills };
}

// --- editing ------------------------------------------------------------------

/** Move one drill to a new index within the session, returning the new edit. */
export function moveDrill(drills: ProgramDrill[], from: number, to: number, edit: SessionEdit = {}): SessionEdit {
  const names = drills.map((d) => d.name);
  if (from < 0 || from >= names.length) return edit;
  const target = Math.max(0, Math.min(names.length - 1, to));
  if (target === from) return edit;

  const next = [...names];
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  // The whole order is written, not just the moved name: a partial order is
  // ambiguous about everything it does not mention.
  return { ...edit, order: next };
}

export function removeDrill(drills: ProgramDrill[], name: string, edit: SessionEdit = {}): SessionEdit {
  const drill = drills.find((d) => d.name === name);
  // Rehab is refused at the source as well as on apply, so the UI can grey the
  // button rather than let somebody press something that does nothing.
  if (!drill || drill.rehab) return edit;
  return { ...edit, removed: [...new Set([...(edit.removed ?? []), name])] };
}

export function restoreDrill(name: string, edit: SessionEdit = {}): SessionEdit {
  const removed = (edit.removed ?? []).filter((n) => n !== name);
  const next: SessionEdit = { ...edit, removed };
  if (removed.length === 0) delete next.removed;
  return next;
}

export function addDrill(drill: ProgramDrill, edit: SessionEdit = {}): SessionEdit {
  const added = [...(edit.added ?? []).filter((d) => d.name !== drill.name), drill];
  return { ...edit, added };
}

/** Throw the customisation away and go back to what the engine wrote. */
export function resetSession(edits: ProgramEdits, key: SessionKey): ProgramEdits {
  const next = { ...edits };
  delete next[key];
  return next;
}

/** Has this session been customised at all? Drives "reset" being offered. */
export function isEdited(edit: SessionEdit | undefined): boolean {
  if (!edit) return false;
  return (edit.order?.length ?? 0) > 0 || (edit.removed?.length ?? 0) > 0 || (edit.added?.length ?? 0) > 0;
}

// --- warnings -----------------------------------------------------------------

/** Slots in the order a session is meant to run. */
const SLOT_RANK: Record<string, number> = {
  warmup: 0, primary: 1, secondary: 2, accessory: 3, skill: 4, conditioning: 5, cooldown: 6,
};

function rankOf(d: ProgramDrill): number {
  // No slot at all is v1 data. Treated as main work rather than as rank zero:
  // calling an unlabelled drill a warm-up would warn about every old program.
  return SLOT_RANK[d.slot ?? "primary"] ?? 1;
}

/**
 * What this arrangement costs, in the athlete's terms.
 *
 * Warnings, never refusals — see the header. Each one names the drill, because
 * "your order is wrong" on a nine-drill session is not something anybody can
 * act on.
 */
export function orderWarnings(drills: ProgramDrill[]): string[] {
  const out: string[] = [];

  const firstMain = drills.findIndex((d) => (d.slot ?? "primary") === "primary");
  const warmupAfterMain = drills.findIndex((d, i) => d.slot === "warmup" && firstMain >= 0 && i > firstMain);
  if (warmupAfterMain >= 0) {
    out.push(
      `${drills[warmupAfterMain].name} is a warm-up and it is now after your main work. ` +
      `Warming up afterwards is just more work.`,
    );
  }

  /**
   * The one that actually costs training: a heavy compound behind the work that
   * fatigues it. Reported once, on the first offender, rather than once per
   * accessory above it — five lines saying the same thing is noise.
   */
  if (firstMain > 0) {
    const before = drills.slice(0, firstMain).filter((d) => rankOf(d) > SLOT_RANK.primary);
    if (before.length > 0) {
      out.push(
        `${drills[firstMain].name} is your main lift and ${before.length === 1 ? "" : `${before.length} pieces of `}` +
        `${before.length === 1 ? `${before[0].name} comes` : "work come"} before it. ` +
        `You will have less to give it.`,
      );
    }
  }

  const cooldown = drills.findIndex((d) => d.slot === "cooldown");
  if (cooldown >= 0 && cooldown < drills.length - 1) {
    out.push(`${drills[cooldown].name} is a cool-down with work after it.`);
  }

  return out;
}

/** What removing this drill costs. Empty when it is a free choice. */
export function removeWarning(drills: ProgramDrill[], name: string): string | null {
  const drill = drills.find((d) => d.name === name);
  if (!drill) return null;
  if (drill.rehab) return "Rehab work is part of your recovery plan and stays in.";

  const slot = drill.slot ?? "primary";
  if (slot === "primary") {
    const others = drills.filter((d) => (d.slot ?? "primary") === "primary" && d.name !== name);
    if (others.length === 0) {
      return "This is the only main lift in the session — take it out and the day has no hard work in it.";
    }
  }
  if (slot === "warmup") {
    const others = drills.filter((d) => d.slot === "warmup" && d.name !== name);
    if (others.length === 0) return "That is the last of the warm-up.";
  }
  return null;
}

/** "Main work" / "Accessory" — the heading a drill sits under. */
export function slotLabel(drill: ProgramDrill): string {
  const slot = drill.slot;
  return slot && slot in SLOT_LABEL ? SLOT_LABEL[slot as keyof typeof SLOT_LABEL] : "Main work";
}
