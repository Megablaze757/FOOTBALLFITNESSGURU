// =============================================================================
// Sport vocabulary.
//
// The app was written football-first, so a basketball player was asked "Match
// today?" and a runner "Match minutes played". Small wording, but it's the tell
// that a product wasn't built for you — and this one claims to cover six sports.
//
// One place for the nouns so a new sport is a row here rather than a hunt
// through the components. Pure data + tested.
// =============================================================================

import type { SportId } from "./exercises";

export interface SportTerms {
  /** The competitive event: "match", "game", "race", "competition". */
  event: string;
  /** Asked on the daily check-in, e.g. "Game today?". */
  eventToday: string;
  /** Label for the minutes field. */
  minutes: string;
  /** Section heading for event-day preparation. */
  eventDay: string;
  /** Used where the event is described as a thing that happened. */
  played: string;
  /** Title case for a dropdown option, e.g. "Game". */
  eventLabel: string;
  /** Where the sport happens: "on the pitch", "on court", "on the road". */
  venue: string;
  /** The competitive block: "season" for team sports, "training year" otherwise. */
  season: string;
  /** In-season phrasing for a program summary. */
  inSeason: string;
  offSeason: string;
}

const FOOTBALL: SportTerms = {
  event: "match",
  eventToday: "Match today?",
  minutes: "Minutes played",
  eventDay: "Matchday",
  played: "played",
  eventLabel: "Match",
  venue: "on the pitch",
  season: "season",
  inSeason: "in-season (recovery-weighted)",
  offSeason: "off-season (higher volume)",
};

const TERMS: Record<SportId, SportTerms> = {
  football: FOOTBALL,
  rugby: FOOTBALL,
  basketball: {
    event: "game",
    eventToday: "Game today?",
    minutes: "Minutes on court",
    eventDay: "Gameday",
    played: "played",
    eventLabel: "Game",
    venue: "on court",
    season: "season",
    inSeason: "in-season (recovery-weighted)",
    offSeason: "off-season (higher volume)",
  },
  running: {
    event: "race",
    eventToday: "Race today?",
    minutes: "Minutes racing",
    eventDay: "Race day",
    played: "raced",
    eventLabel: "Race",
    venue: "on the road",
    season: "racing season",
    inSeason: "in racing season (sharpening, lower volume)",
    offSeason: "base phase (higher volume)",
  },
  weightlifting: {
    // Lifters compete rarely; the day that matters is a heavy session.
    event: "session",
    eventToday: "Heavy session today?",
    minutes: "Minutes training",
    eventDay: "Big session day",
    played: "trained",
    eventLabel: "Heavy session",
    venue: "under the bar",
    season: "training block",
    inSeason: "peaking for a meet (intensity up, volume down)",
    offSeason: "accumulation (higher volume)",
  },
  gym: {
    event: "session",
    eventToday: "Big session today?",
    minutes: "Minutes training",
    eventDay: "Big session day",
    played: "trained",
    eventLabel: "Big session",
    venue: "in the gym",
    season: "training block",
    inSeason: "intensity phase (heavier, less volume)",
    offSeason: "volume phase (more sets)",
  },
};

/** Vocabulary for a sport. Unknown or missing sports fall back to football. */
export function sportTerms(sport: string | null | undefined): SportTerms {
  return TERMS[(sport ?? "football") as SportId] ?? FOOTBALL;
}
