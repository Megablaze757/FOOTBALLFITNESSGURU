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
  /**
   * The YouTube id, for the ones that can be played in place.
   *
   * Only ever set when `kind` is "video". A search has no id — there is no such
   * thing as an embedded list of results — which is why "switch it all to
   * iframes" can only ever mean the curated ones. Everything else keeps a link
   * out, and that is the difference the UI has to show rather than paper over.
   */
  videoId?: string;
}

/** The id out of a watch url, or null if it is not one. */
function idOf(url: string): string | null {
  return url.match(/[?&]v=([\w-]{11})/)?.[1] ?? null;
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

  /**
   * ADDED AFTER CHECKING EACH ONE AGAINST YOUTUBE, not from memory.
   *
   * Every url below was fetched through the oembed endpoint before it was
   * written down, and the TITLE and CHANNEL were read back — a video id that
   * resolves can point at anything, so "it returns 200" is not the check. The
   * two that had rotted were removed the same way. `scripts/check-form-guides.mjs`
   * is that check, kept so it can be re-run rather than repeated by hand.
   *
   * Chosen for who is teaching where the exercise can hurt somebody. The two
   * physio-led ones are not a coincidence: a nordic curl and a Copenhagen plank
   * are prescribed to PREVENT a hamstring tear and a groin strain, and a
   * demonstration that gets them wrong does the opposite of the job.
   */
  "nordic curl": "https://www.youtube.com/watch?v=_e9vFU9-tkc",          // E3 Rehab
  "nordic hamstring curl": "https://www.youtube.com/watch?v=_e9vFU9-tkc", // E3 Rehab
  "copenhagen plank": "https://www.youtube.com/watch?v=YRRnnZsRs9U",      // E3 Rehab
  "lat pulldown": "https://www.youtube.com/watch?v=SALxEARiMkw",          // ATHLEAN-X
  "seated cable row": "https://www.youtube.com/watch?v=7o2oolbmzeI",      // ScottHermanFitness
  "kettlebell swing": "https://www.youtube.com/watch?v=h-A7HiTNZ5c",      // Colossus Fitness
  "dips": "https://www.youtube.com/watch?v=yN6Q1UI_xkE",                  // Jeff Nippard
  "dumbbell shoulder press": "https://www.youtube.com/watch?v=qEwKCR5JCog", // ScottHermanFitness
};

/**
 * TWO ENTRIES WERE ONCE REMOVED FROM THE LIST ABOVE, and the reason is the
 * reason every url in it is checked before it goes in.
 *
 * "nordic hamstring curl" and "copenhagen plank" both pointed at videos that
 * had been taken down — checked live, both 404. A dead curated link is worse
 * than a search that always works: the button says "Watch Form Guide", the
 * athlete taps it expecting a chosen answer, and gets YouTube's apology page.
 * Both fall back to a search now, which is the honest behaviour.
 *
 * They are also the two exercises on the list where the failure mode is a torn
 * hamstring or a groin strain rather than a wasted set — the ones most worth
 * curating, and the ones nobody noticed had rotted.
 *
 * Run `node scripts/check-form-guides.mjs` before adding to the list, and every
 * few months after. It checks each link is still live and prints the title, so
 * a link that resolves to a DIFFERENT video is visible too.
 */

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
  if (chosen) {
    return { url: chosen, kind: "video", label: "Watch Form Guide", videoId: idOf(chosen) ?? undefined };
  }

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
