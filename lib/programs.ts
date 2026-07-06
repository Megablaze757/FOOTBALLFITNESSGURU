// Pre-built program templates — one-tap starting points per sport, so athletes
// don't have to fill in the quiz. Each maps to buildProgram() params.

import type { GoalType, TrainingFocus } from "./coach";
import type { SportId } from "./exercises";

export interface ProgramTemplate {
  id: string;
  name: string;
  blurb: string;
  icon: string;
  goal: GoalType;
  focus: TrainingFocus;
  position?: string;
}

const TEMPLATES: Record<SportId, ProgramTemplate[]> = {
  football: [
    { id: "fb_striker", name: "Explosive striker", blurb: "Acceleration, power & finishing sharpness", icon: "⚡", goal: "speed", focus: "performance", position: "Striker" },
    { id: "fb_cb", name: "Defensive rock", blurb: "Aerial & max strength for centre-backs", icon: "🛡️", goal: "strength", focus: "performance", position: "Centre back" },
    { id: "fb_engine", name: "Midfield engine", blurb: "Box-to-box aerobic capacity", icon: "🫁", goal: "endurance", focus: "performance", position: "Central mid" },
    { id: "fb_rehab", name: "Return to play", blurb: "Rebuild safely after an injury", icon: "🩹", goal: "injury_recovery", focus: "rehab" },
  ],
  rugby: [
    { id: "rg_power", name: "Contact power", blurb: "Scrum & collision strength for forwards", icon: "💥", goal: "strength", focus: "performance", position: "Prop" },
    { id: "rg_back", name: "Back-line speed", blurb: "Top speed & footwork for backs", icon: "🏃", goal: "speed", focus: "performance", position: "Wing" },
    { id: "rg_engine", name: "80-minute engine", blurb: "Power endurance for the full game", icon: "🔋", goal: "endurance", focus: "performance" },
  ],
  basketball: [
    { id: "bb_vert", name: "Vertical & power", blurb: "Jump higher, finish stronger", icon: "🦅", goal: "strength", focus: "performance", position: "Power forward" },
    { id: "bb_guard", name: "Guard agility", blurb: "Quickness & change of direction", icon: "🎯", goal: "agility", focus: "performance", position: "Point guard" },
    { id: "bb_engine", name: "Court conditioning", blurb: "Repeat-effort fitness", icon: "🔋", goal: "endurance", focus: "fitness" },
  ],
  running: [
    { id: "rn_sprint", name: "Sprint speed", blurb: "Max speed, power & mechanics", icon: "⚡", goal: "speed", focus: "performance", position: "Sprinter" },
    { id: "rn_5k", name: "5k engine", blurb: "Aerobic power with durability", icon: "🏃", goal: "endurance", focus: "performance", position: "5k/10k" },
    { id: "rn_marathon", name: "Marathon base", blurb: "Deep aerobic base & resilience", icon: "🏅", goal: "endurance", focus: "performance", position: "Marathon" },
  ],
  weightlifting: [
    { id: "wl_power", name: "Powerlifting strength", blurb: "Squat, bench & deadlift 1RM", icon: "🏋️", goal: "strength", focus: "performance", position: "Powerlifting" },
    { id: "wl_oly", name: "Olympic power", blurb: "Explosive strength-speed", icon: "💪", goal: "strength", focus: "performance", position: "Olympic lifting" },
  ],
  gym: [
    { id: "gym_muscle", name: "Build muscle", blurb: "Hypertrophy — volume & progressive overload", icon: "💪", goal: "strength", focus: "aesthetics", position: "Hypertrophy" },
    { id: "gym_lean", name: "Get fit & lean", blurb: "Conditioning + strength for general fitness", icon: "🔥", goal: "endurance", focus: "fitness", position: "General fitness" },
    { id: "gym_strong", name: "Full-body strength", blurb: "Get strong across the main lifts", icon: "🏋️", goal: "strength", focus: "performance", position: "Strength" },
  ],
};

export function templatesForSport(sport: SportId): ProgramTemplate[] {
  return TEMPLATES[sport] ?? TEMPLATES.football;
}
