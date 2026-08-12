import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBlock } from "./engine";
import { positionsForSport } from "./coach";
import { MOVEMENT_BY_ID } from "./movements";
import { positionProfile, profiledPositions } from "./position-profile";
import type { SportId } from "./exercises";

const SPORTS: SportId[] = ["rugby", "football", "basketball", "running", "weightlifting"];

/** Every drill name in a block, for a given position. */
function block(sport: SportId, position: string, goal = "strength", days = 4): string[] {
  const b = buildBlock({ goal, painMap: {}, sport, daysPerWeek: days, position } as never);
  return b.weeks[2].sessions.flatMap((s) => s.drills.map((d) => d.name));
}

const overlap = (a: string[], b: string[]) => a.filter((n) => b.includes(n)).length / a.length;

/**
 * THE COMPLAINT, AS A TEST: "a prop's drills are the same as a flanker's".
 *
 * They were — position was read to pick a ball drill and to print a name, and
 * nowhere else, so the strength, conditioning and accessory work of a
 * front-rower and a back-rower were byte-identical.
 *
 * These pairs are the ones where a coach would write two different programmes.
 * The threshold is deliberately loose: they SHOULD still share a lot, because
 * both squat and both warm up, and a test demanding they look unrelated would
 * be demanding bad coaching. What it catches is the thing that was true before,
 * which is total identity.
 */
test("positions a coach would train differently get different programmes", () => {
  const pairs: [SportId, string, string][] = [
    ["rugby", "Prop", "Flanker"],
    ["rugby", "Prop", "Wing"],
    ["rugby", "Lock", "Scrum-half"],
    ["football", "Goalkeeper", "Central mid"],
    ["football", "Centre back", "Winger"],
    ["basketball", "Point guard", "Centre"],
    ["running", "Sprinter", "Marathon"],
    ["weightlifting", "Powerlifting", "Olympic lifting"],
  ];
  for (const [sport, a, b] of pairs) {
    const same = overlap(block(sport, a), block(sport, b));
    assert.ok(
      same <= 0.85,
      `${sport}: ${a} and ${b} share ${Math.round(same * 100)}% of their block — that is one programme with two names`
    );
  }
});

/**
 * And the differences are the RIGHT ones. A percentage can move because the
 * rotation shifted; this checks the actual coaching claim.
 */
/**
 * THE DEMOTION MECHANISM, ASSERTED DIRECTLY.
 *
 * A pattern the position actively demotes is REMOVED from the pool rather than
 * ranked down, because `pick` rotates a fixed-width window and only its
 * membership decides a session — ranking inside it changes nothing. With the
 * bonus alone a prop and a flanker shared 83% of a block.
 *
 * This is here because the overlap thresholds above did NOT catch that: I
 * disabled the pool filtering and every one of them still passed, since 83% is
 * under the 85% they allow. A percentage is a symptom; this is the mechanism,
 * swept across every goal and day count so it cannot pass by luck of rotation.
 */
test("a demoted pattern does not appear at all", () => {
  const byName = new Map(Object.values(MOVEMENT_BY_ID).map((m) => [m.name, m]));
  const cases: [SportId, string, string][] = [
    ["rugby", "Prop", "sprint"],
    ["football", "Goalkeeper", "sprint"],
    ["running", "Marathon", "jump"],
    ["weightlifting", "Powerlifting", "sprint"],
  ];
  for (const [sport, position, banned] of cases) {
    const leaks: string[] = [];
    for (const goal of ["strength", "speed", "endurance", "agility"]) {
      for (const days of [3, 4, 5]) {
        const b = buildBlock({ goal, painMap: {}, sport, daysPerWeek: days, position } as never);
        for (const w of b.weeks) {
          for (const sess of w.sessions) {
            for (const d of sess.drills) {
              if (byName.get(d.name)?.pattern === banned) leaks.push(`${goal}/${days}d: ${d.name}`);
            }
          }
        }
      }
    }
    assert.deepEqual(
      [...new Set(leaks)], [],
      `${sport}/${position} demotes "${banned}" and got it anyway — the pool filter is not running`
    );
  }
});

test("the difference is the one the position asks for", () => {
  const prop = block("rugby", "Prop").join(" | ");
  const flanker = block("rugby", "Flanker").join(" | ");

  assert.match(prop, /Scrum/i, "a prop's block with no scrummaging in it");
  assert.match(prop, /carry/i, "a prop's block with no loaded carry");
  assert.doesNotMatch(prop, /sprint|A-skips|Strides/i, "a front-rower is not a sprinter");

  assert.match(flanker, /sprint|T-drill|shuttle|Lateral shuffle/i, "a back-rower with no repeat-sprint or agility work");

  // The goalkeeper is the clearest case in the app: almost none of the outfield
  // running engine, nearly all of the reactive and vertical work.
  const keeper = block("football", "Goalkeeper").join(" | ");
  assert.doesNotMatch(keeper, /Long run|Threshold|Progression run/i, "a keeper does not need a marathon block");
});

test("every position the app offers has an opinion attached", () => {
  const missing: string[] = [];
  for (const sport of SPORTS) {
    for (const p of positionsForSport(sport)) {
      if (!positionProfile(sport, p)) missing.push(`${sport}/${p}`);
    }
  }
  assert.deepEqual(missing, [], "these positions fall back to generic training");
});

/**
 * The profiles are keyed by the exact strings in POSITIONS_BY_SPORT. Rename one
 * there and the athletes on it silently revert to generic training — no error,
 * no empty block, just a programme that stops being theirs.
 */
test("no profile is keyed to a position that no longer exists", () => {
  const orphans: string[] = [];
  for (const sport of SPORTS) {
    const offered = new Set(positionsForSport(sport));
    for (const p of profiledPositions(sport)) if (!offered.has(p)) orphans.push(`${sport}/${p}`);
  }
  assert.deepEqual(orphans, [], "these profiles are keyed to positions nobody can pick");
});

test("every essential names a movement that exists", () => {
  const bad: string[] = [];
  for (const sport of SPORTS) {
    for (const p of profiledPositions(sport)) {
      for (const id of positionProfile(sport, p)!.essentials) {
        if (!MOVEMENT_BY_ID[id]) bad.push(`${sport}/${p}: ${id}`);
      }
    }
  }
  assert.deepEqual(bad, [], "a typo here does nothing at all, silently");
});

/**
 * AND EVERY ESSENTIAL CAN ACTUALLY BE SELECTED.
 *
 * Naming a real movement is not enough. The engine filters conditioning by
 * effort — hard metabolic work is kept out of strength blocks deliberately, so
 * it doesn't fight the session it is attached to — and an essential that lands
 * on the wrong side of that filter is a line of config that never once changes
 * a programme. This nearly shipped: `sled_push` (RPE 8) and `shuttle_runs`
 * (RPE 9) are both above the ceiling for a non-endurance block, and they only
 * survive because they DO appear in the endurance blocks, which is the right
 * place for them.
 */
test("every essential turns up somewhere in a real block", () => {
  const unreachable: string[] = [];
  for (const sport of SPORTS) {
    for (const p of profiledPositions(sport)) {
      const essentials = positionProfile(sport, p)!.essentials;
      if (!essentials.length) continue;
      const seen = new Set<string>();
      for (const goal of ["strength", "speed", "endurance", "agility"]) {
        for (const days of [3, 4, 5]) {
          const b = buildBlock({ goal, painMap: {}, sport, daysPerWeek: days, position: p } as never);
          for (const w of b.weeks) for (const s of w.sessions) for (const d of s.drills) seen.add(d.name);
        }
      }
      for (const id of essentials) {
        if (!seen.has(MOVEMENT_BY_ID[id]?.name ?? id)) unreachable.push(`${sport}/${p}: ${id}`);
      }
    }
  }
  assert.deepEqual(unreachable, [], "these are named as non-negotiable and never appear");
});

/**
 * POSITION IS A PREFERENCE. PAIN IS NOT.
 *
 * A prop's profile pushes horizontal pressing harder than any other weight in
 * the file. It must not be able to put a heavily-loaded shoulder movement in
 * front of someone whose shoulder is at 9/10, and the ORDER of the checks in
 * rankSlot is what guarantees it: the refusal returns null before any position
 * bonus is added, so nothing here can reinstate what safety removed.
 *
 * Asserted against the engine's actual rule — load >= 2 on a joint at >= 7 is
 * refused — not against "no pressing at all". A bench press loads the shoulder
 * at 1 and is penalised rather than banned, which is the existing policy and a
 * defensible one; writing the stricter claim here would be pinning behaviour
 * the engine has never had.
 */
test("a position emphasis cannot outrank a painful joint", () => {
  const hurt = buildBlock({
    goal: "strength", sport: "rugby", daysPerWeek: 4, position: "Prop",
    painMap: { shoulder: 9 },
  } as never);
  const all = hurt.weeks.flatMap((w) => w.sessions.flatMap((s) => s.drills.map((d) => d.name)));

  // Everything the engine refuses outright for a 9/10 shoulder.
  const banned = Object.values(MOVEMENT_BY_ID)
    .filter((m) => (m.load.shoulder ?? 0) >= 2)
    .map((m) => m.name);
  const got = all.filter((n) => banned.includes(n));
  assert.deepEqual(got, [], `prescribed through a 9/10 shoulder: ${got.join(", ")}`);

  // And the emphasis is still doing its job on everything that IS safe.
  assert.ok(all.length > 20, "the block collapsed rather than substituting");
});

/**
 * The demotions remove movements from the pool rather than merely ranking them
 * down — without that a prop and a flanker shared 83% of a block, because the
 * rotation takes a fixed window and only its MEMBERSHIP matters. The risk that
 * introduces is an empty slot, so: no session, for any profiled position, may
 * come out short.
 */
test("no emphasis empties a slot", () => {
  for (const sport of SPORTS) {
    for (const p of profiledPositions(sport)) {
      for (const goal of ["strength", "speed", "endurance"]) {
        const b = buildBlock({ goal, painMap: {}, sport, daysPerWeek: 4, position: p } as never);
        for (const w of b.weeks) {
          for (const s of w.sessions) {
            assert.ok(
              s.drills.length >= 5,
              `${sport}/${p} ${goal}: "${s.title}" has only ${s.drills.length} drills`
            );
          }
        }
      }
    }
  }
});

test("an unknown or missing position still builds a programme", () => {
  for (const position of [undefined, "", "Sweeper-keeper", ["Not a position"]]) {
    const b = buildBlock({ goal: "strength", painMap: {}, sport: "rugby", daysPerWeek: 4, position } as never);
    assert.equal(b.weeks.length, 4);
    assert.ok(b.weeks[0].sessions.every((s) => s.drills.length >= 5));
  }
});

/**
 * Primary position only. Someone who plays wing and full-back gets wing
 * training — averaging two profiles produces a programme built for nobody,
 * which is the thing being fixed. Ball work still covers both, because drills
 * are cheap to include and strength blocks are not.
 */
test("a multi-position athlete is trained as their first position", () => {
  const both = block("rugby", ["Wing", "Prop"] as never);
  const wingOnly = block("rugby", "Wing");
  assert.deepEqual(both, wingOnly);
});
