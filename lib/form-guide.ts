// =============================================================================
// "Watch Form Guide" — where to actually SEE the movement.
//
// A drawn figure says which shape the movement is; it cannot say what the bar
// path looks like, how fast the rep should be, or what a rounded back looks
// like from the side. Those are the things a form guide is for, and they are
// the things a still cannot carry. So the figures stay as what they are good at
// — telling a squat from a hinge at a glance, in a list of three hundred — and
// the teaching links out to video.
//
// WHY NOT EMBED. Every video platform's embed is a third-party iframe with its
// own cookies and its own tracking, on a page that otherwise sets none, and it
// would need a CSP exception for every host. A link opens the athlete's own
// app, already signed in, at full quality, and costs this page nothing.
//
// CURATED WHERE IT MATTERS, SEARCH EVERYWHERE ELSE. Hand-picking three hundred
// videos is a job nobody finishes and a set of links that rots — channels get
// deleted, videos get made private. The lifts an athlete is most likely to hurt
// themselves on are worth pinning by hand; for everything else a search on the
// exact movement name is more useful than one stale link, and it cannot 404.
//
// Pure + tested.
// =============================================================================

export interface FormGuide {
  url: string;
  /** "video" when somebody chose it; "search" when this is a good query. */
  kind: "video" | "search";
  /** What the control should say. */
  label: string;
}

/**
 * Hand-picked guides, keyed by lowercased movement name.
 *
 * ONLY CHANNELS THAT TEACH. Each of these is a lift where the failure mode is
 * an injury rather than a wasted set, and where the difference between a good
 * demonstration and a bad one is somebody's back.
 *
 * Kept deliberately short. A long list is a long list of links to re-check, and
 * a dead curated link is worse than a search that always works — it promises a
 * chosen answer and delivers a removed video.
 */
const CURATED: Record<string, string> = {
  "barbell back squat": "https://www.youtube.com/watch?v=bEv6CCg2BC8",
  "barbell front squat": "https://www.youtube.com/watch?v=uYumuL_G_V0",
  "barbell deadlift": "https://www.youtube.com/watch?v=op9kVnSso6Q",
  "romanian deadlift": "https://www.youtube.com/watch?v=JCXUYuzwNrM",
  "bench press": "https://www.youtube.com/watch?v=rT7DgCr-3pg",
  "barbell overhead press": "https://www.youtube.com/watch?v=2yjwXTZQDDI",
  "barbell row": "https://www.youtube.com/watch?v=9efgcAjQe7E",
  "pull ups": "https://www.youtube.com/watch?v=eGo4IYlbE5g",
  "barbell hip thrust": "https://www.youtube.com/watch?v=xDmFkJxPzeM",
  "bulgarian split squat": "https://www.youtube.com/watch?v=2C-uNgKwPLE",
  "nordic hamstring curl": "https://www.youtube.com/watch?v=1ge2yiG3fzc",
  "copenhagen plank": "https://www.youtube.com/watch?v=RS3aDCDwLnQ",
};

/**
 * Names too thin to search usefully.
 *
 * "Circuit", "session", a single letter — a YouTube search for those returns
 * everything, which is the same as returning nothing while looking like it
 * worked. Better to say plainly that there is no guide.
 */
const UNSEARCHABLE = /^(?:[a-z]{1,3}|circuit|session|workout|training|drills?|warm.?up|cool.?down|stretching|other|misc)$/i;

/** Where to send somebody who wants to watch this movement done properly. */
export function formGuide(name: string): FormGuide | null {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return null;

  const chosen = CURATED[clean.toLowerCase()];
  if (chosen) return { url: chosen, kind: "video", label: "Watch Form Guide" };

  if (UNSEARCHABLE.test(clean)) return null;

  // "proper form" rather than the bare name: the name alone returns workout
  // montages set to music, which demonstrate nothing.
  const query = encodeURIComponent(`${clean} proper form technique`);
  return {
    url: `https://www.youtube.com/results?search_query=${query}`,
    kind: "search",
    label: "Watch Form Guide",
  };
}

/** What to say when there is nothing worth linking to. */
export const NO_GUIDE = "No video guide available for this exercise";

/** How many movements have a hand-picked video rather than a search. */
export function curatedCount(): number {
  return Object.keys(CURATED).length;
}
