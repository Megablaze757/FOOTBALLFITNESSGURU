import { writeFileSync } from "node:fs";
import { buildDrillCardSvg } from "./lib/drill-card";
import { SKILL_DRILLS } from "./lib/skills";
const heading = SKILL_DRILLS.find((d) => d.id === "fb_heading")!;
const wall = SKILL_DRILLS.find((d) => d.id === "fb_wall_pass")!;
writeFileSync("_card-drill.svg", buildDrillCardSvg({ drill: wall, sportLabel: "Football", style: "drill" }));
writeFileSync("_card-cue.svg", buildDrillCardSvg({ drill: heading, sportLabel: "Football", style: "cue" }));
console.log("wrote previews");
