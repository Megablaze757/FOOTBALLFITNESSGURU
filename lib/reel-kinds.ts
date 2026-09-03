// =============================================================================
// What a reel can be about.
//
// The recorder was built for one thing — a skill drill — and the drill is not
// the only content here that reads well as a stack of held cards. A recipe is
// a list of steps. A movement's cues are three lines. A strength standard is a
// number per bodyweight. All of it is already written, and none of it was
// reachable from the reel tab.
//
// Each kind supplies a list of SUBJECTS and, for each, the scenes. Everything
// stays a pure function of the data, so the storyboard is testable and the
// browser's only job is still to draw cards for their durations.
// =============================================================================

import { SKILL_DRILLS } from "./skills";
import { EXERCISES, isRunEntry } from "./exercises";
import { recipeFacts } from "./collections";
import { recipeSteps } from "./recipe-steps";
import { indexFacts, money, portionLabel, REFERENCE_PROTEIN, proteinIndex } from "./protein-index";
import { LIFT_STANDARDS, STRENGTH_TIERS } from "./strength-standards";
import { roundToPlate } from "./standards-page";
import { DEMO_SCREENS } from "./demo-card";
import { FACT_GROUPS } from "./content";
import { holdFor, type Scene } from "./reel";

export type ReelKind =
  | "drill" | "exercise" | "recipe" | "protein" | "standards" | "demo" | "fact";

export const REEL_KINDS: { id: ReelKind; label: string; note: string }[] = [
  { id: "drill", label: "Sport drills", note: "Skill work by sport — the setup, the steps, the cue" },
  { id: "exercise", label: "Exercise tutorials", note: "How to do a movement, and what it works" },
  { id: "recipe", label: "Recipes", note: "A costed meal, its protein, and how to cook it" },
  { id: "protein", label: "Protein prices", note: "What 30g of protein costs, food by food" },
  { id: "standards", label: "Strength standards", note: "What a lift is worth at your bodyweight" },
  { id: "demo", label: "App demos", note: "What a screen does, in its own words" },
  { id: "fact", label: "What the app does", note: "One verified fact per card" },
];

export interface ReelSubject {
  id: string;
  label: string;
  /** A line for the picker — sport, muscle, cost, whatever identifies it. */
  note: string;
  scenes: Scene[];
}

const timed = (scenes: { kicker: string; text: string }[]): Scene[] =>
  scenes.filter((s) => s.text.trim()).map((s) => ({ ...s, ms: holdFor(s.text) }));

const MOVEMENTS = EXERCISES.filter((e) => !isRunEntry(e));

/**
 * The closing card, on every kind.
 *
 * A reel that is pure content gets watched and forgotten; one that ends on a
 * pitch gets skipped. So it closes on a verified line from lib/content.ts —
 * the list NEVER_CLAIM guards — and on the group the reel actually
 * demonstrated, so the claim and the cards agree.
 */
function closer(groupId: string): { kicker: string; text: string } {
  const group = FACT_GROUPS.find((g) => g.id === groupId) ?? FACT_GROUPS[0];
  return { kicker: "IN THE APP", text: group.facts[0] };
}

export function reelSubjects(kind: ReelKind): ReelSubject[] {
  switch (kind) {
    case "drill":
      return SKILL_DRILLS.map((d) => ({
        id: d.id,
        label: d.name,
        note: `${d.sport} · ${d.skill}`,
        scenes: timed([
          { kicker: d.skill.toUpperCase(), text: d.name },
          { kicker: "YOU NEED", text: d.setup },
          ...d.how.slice(0, 3).map((step, i) => ({ kicker: `STEP ${i + 1}`, text: step })),
          { kicker: "THE CUE", text: d.coaching },
          { kicker: "VOLUME", text: d.reps },
          closer("drills"),
        ]),
      }));

    case "exercise":
      // Only movements with a real how-to. The bulk rows whose description is a
      // one-line benefit would make a reel that says nothing twice.
      return MOVEMENTS
        .filter((e) => e.hasHowTo && e.description && e.cues.length >= 2)
        .map((e) => ({
          id: e.id,
          label: e.name,
          note: `${e.equipment} · ${e.muscles.join(", ")}`,
          scenes: timed([
            { kicker: "HOW TO", text: e.name },
            { kicker: "WHAT IT WORKS", text: e.muscles.join(", ") },
            ...e.description!.split(/(?<=\.)\s+/).filter((s) => s.trim().length > 12).slice(0, 3)
              .map((step, i) => ({ kicker: `STEP ${i + 1}`, text: step })),
            ...e.cues.slice(0, 2).map((c) => ({ kicker: "CUE", text: c })),
            closer("drills"),
          ]),
        }));

    case "recipe":
      return recipeFacts().map((f) => ({
        id: f.meal.id,
        label: f.meal.name,
        note: `${money(f.cost)} · ${Math.round(f.protein)}g protein`,
        scenes: timed([
          { kicker: f.meal.slot.toUpperCase(), text: f.meal.name },
          { kicker: "COST", text: `${money(f.cost)} a serving` },
          { kicker: "PROTEIN", text: `${Math.round(f.protein)}g, ${Math.round(f.kcal)} kcal` },
          ...recipeSteps(f.meal).slice(0, 3).map((step, i) => ({ kicker: `STEP ${i + 1}`, text: step })),
          closer("nutrition"),
        ]),
      }));

    case "protein": {
      const facts = indexFacts();
      if (!facts) return [];
      const index = proteinIndex();
      return [
        {
          id: "protein-index",
          label: "The cheapest protein in a supermarket",
          note: `${facts.count} foods, ${facts.spread.toFixed(1)}× spread`,
          scenes: timed([
            { kicker: "WE COSTED IT", text: `What ${REFERENCE_PROTEIN}g of protein actually costs` },
            { kicker: "CHEAPEST", text: `${facts.cheapest.name} — ${money(facts.cheapest.cost)} for ${portionLabel(facts.cheapest)}` },
            { kicker: "DEAREST", text: `${facts.dearest.name} — ${money(facts.dearest.cost)}` },
            { kicker: "THE SPREAD", text: `${facts.spread.toFixed(1)} times the price, for the same ${REFERENCE_PROTEIN}g` },
            ...(facts.cheapestPlant && facts.plantSaving != null
              ? [{ kicker: "PLANT VS ANIMAL", text: `${facts.cheapestPlant.name} saves ${money(facts.plantSaving)} a serving` }]
              : []),
            closer("nutrition"),
          ]),
        },
        ...index.slice(0, 8).map((entry, i) => ({
          id: `protein-${entry.id}`,
          label: entry.name,
          note: `#${i + 1} cheapest · ${money(entry.cost)}`,
          scenes: timed([
            { kicker: `#${i + 1} CHEAPEST`, text: entry.name },
            { kicker: `${REFERENCE_PROTEIN}G OF PROTEIN`, text: `${money(entry.cost)} — ${portionLabel(entry)}` },
            { kicker: "COMPARE", text: `The dearest on our list is ${money(facts.dearest.cost)} for the same` },
            closer("nutrition"),
          ]),
        })),
      ];
    }

    case "standards":
      return LIFT_STANDARDS.map((lift) => ({
        id: lift.key,
        label: `${lift.label} standards`,
        note: lift.muscles.join(", "),
        scenes: timed([
          { kicker: "STANDARDS", text: `What a ${lift.label.toLowerCase()} is worth at your bodyweight` },
          ...STRENGTH_TIERS.filter((t) => t.index >= 1 && t.index <= 4).map((t) => ({
            kicker: t.name.toUpperCase(),
            text: `${roundToPlate(80 * lift.male[t.index - 1])}kg at 80kg bodyweight — ${lift.male[t.index - 1]}× bodyweight`,
          })),
          { kicker: "WHAT IT IS NOT", text: "A description of what lifters at your weight lift. Not a target you have to hit." },
          closer("programs"),
        ]),
      }));

    case "demo":
      return DEMO_SCREENS.map((screen) => {
        const group = FACT_GROUPS.find((g) => g.id === screen.id) ?? FACT_GROUPS[0];
        return {
          id: screen.id,
          label: screen.label,
          note: screen.caption,
          scenes: timed([
            { kicker: "IN THE APP", text: screen.label },
            ...group.facts.slice(0, 4).map((f) => ({ kicker: "", text: f })),
            closer(screen.id),
          ]),
        };
      });

    case "fact":
      return FACT_GROUPS.map((group) => ({
        id: group.id,
        label: group.label,
        note: `${group.facts.length} verified facts`,
        scenes: timed([
          { kicker: "POCKETATHLETE", text: group.label },
          ...group.facts.slice(0, 5).map((f) => ({ kicker: "", text: f })),
        ]),
      }));
  }
}
