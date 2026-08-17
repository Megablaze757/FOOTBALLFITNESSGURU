export type ActivationLevel = "primary" | "secondary";

export type AnatomyRegion =
  | "frontChest" | "frontShoulders" | "frontBiceps" | "frontForearms"
  | "frontCore" | "frontObliques" | "frontHipFlexors" | "frontAdductors"
  | "frontQuads" | "frontCalves"
  | "backTraps" | "backLats" | "backShoulders" | "backTriceps"
  | "backForearms" | "backLower" | "backGlutes" | "backHamstrings" | "backCalves";

const ALL_REGIONS: AnatomyRegion[] = [
  "frontChest", "frontShoulders", "frontBiceps", "frontForearms", "frontCore",
  "frontObliques", "frontHipFlexors", "frontAdductors", "frontQuads", "frontCalves",
  "backTraps", "backLats", "backShoulders", "backTriceps", "backForearms",
  "backLower", "backGlutes", "backHamstrings", "backCalves",
];

/**
 * Turn the catalogue's human muscle names into the regions of a front/back map.
 * The first listed muscle is the primary mover; later entries assist. A primary
 * mark always wins if two labels reach the same anatomical region.
 */
export function anatomyActivation(muscles: readonly string[]): Partial<Record<AnatomyRegion, ActivationLevel>> {
  const regions: Partial<Record<AnatomyRegion, ActivationLevel>> = {};
  const mark = (targets: AnatomyRegion[], level: ActivationLevel) => {
    for (const target of targets) if (regions[target] !== "primary") regions[target] = level;
  };

  muscles.forEach((raw, index) => {
    const muscle = raw.toLowerCase().trim();
    const level: ActivationLevel = index === 0 ? "primary" : "secondary";

    if (/whole body|full body/.test(muscle)) {
      mark(ALL_REGIONS, level);
      return;
    }
    if (/cardio|^legs?$/.test(muscle)) {
      mark(["frontCore", "frontQuads", "frontCalves", "backGlutes", "backHamstrings", "backCalves"], level);
    }
    if (/chest|pec/.test(muscle)) mark(["frontChest"], level);
    if (/lat/.test(muscle)) mark(["backLats"], level);
    if (/trap|upper back/.test(muscle)) mark(["backTraps", "backLats"], level);
    if (/lower back|spine|erector/.test(muscle)) mark(["backLower"], level);
    if (/^back$/.test(muscle)) mark(["backTraps", "backLats", "backLower"], level);
    if (/shoulder|delt|rotator cuff/.test(muscle)) mark(["frontShoulders", "backShoulders"], level);
    if (/bicep/.test(muscle)) mark(["frontBiceps"], level);
    if (/tricep/.test(muscle)) mark(["backTriceps"], level);
    if (/forearm|grip|hands?/.test(muscle)) mark(["frontForearms", "backForearms"], level);
    if (/^core$|\bab\b|abs|abdominal/.test(muscle)) mark(["frontCore"], level);
    if (/oblique/.test(muscle)) mark(["frontObliques"], level);
    if (/glute/.test(muscle)) mark(["backGlutes"], level);
    if (/adductor|groin/.test(muscle)) mark(["frontAdductors"], level);
    if (/hip flexor/.test(muscle)) mark(["frontHipFlexors"], level);
    if (/quad|vmo|patellar/.test(muscle)) mark(["frontQuads"], level);
    if (/hamstring/.test(muscle)) mark(["backHamstrings"], level);
    if (/calf|calves|achilles|ankle/.test(muscle)) mark(["frontCalves", "backCalves"], level);
  });

  return regions;
}
