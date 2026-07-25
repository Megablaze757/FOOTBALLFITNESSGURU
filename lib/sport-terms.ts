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
}

const FOOTBALL: SportTerms = {
  event: "match",
  eventToday: "Match today?",
  minutes: "Minutes played",
  eventDay: "Matchday",
  played: "played",
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
  },
  running: {
    event: "race",
    eventToday: "Race today?",
    minutes: "Minutes racing",
    eventDay: "Race day",
    played: "raced",
  },
  weightlifting: {
    // Lifters compete rarely; the day that matters is a heavy session.
    event: "session",
    eventToday: "Heavy session today?",
    minutes: "Minutes training",
    eventDay: "Big session day",
    played: "trained",
  },
  gym: {
    event: "session",
    eventToday: "Big session today?",
    minutes: "Minutes training",
    eventDay: "Big session day",
    played: "trained",
  },
};

/** Vocabulary for a sport. Unknown or missing sports fall back to football. */
export function sportTerms(sport: string | null | undefined): SportTerms {
  return TERMS[(sport ?? "football") as SportId] ?? FOOTBALL;
}
