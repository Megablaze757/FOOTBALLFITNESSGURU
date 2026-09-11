// =============================================================================
// MUSIC THIS PROJECT IS ACTUALLY ALLOWED TO USE.
//
// ═══════════════════════════════════════════════════════════════════════════
// "YOU CAN FIND SOMETHING." YES — WITH THE LICENCE WRITTEN DOWN NEXT TO IT.
//
// The previous position was that nothing here ships music, which conflated two
// different things: that a CHART record under a brand's video gets claimed, and
// that no usable music exists. The second is false. CC0 audio is public domain
// by the uploader's own dedication, usable commercially, no attribution owed.
//
// What must not happen is a file appearing in this repository with nobody able
// to say where it came from or what may be done with it. So this is a manifest
// rather than a folder: every entry carries its source, its licence, and the
// measurement that says it suits the audience.
//
// NOT COMMITTED, FETCHED. These are tens of megabytes and they never change;
// scripts/fetch-music.mts pulls them at record time, the same argument as the
// 325MB voice model in .voice. A checksum is recorded so a URL quietly serving
// something else is caught rather than mixed.
//
// ─────────────────────────────────────────────────────────────────────────
// AND THE MEASUREMENT DECIDES, NOT THE TITLE.
//
// Five candidates were pulled and four were refused by scripts/check-music.py:
// 170bpm, 188bpm, 117bpm, and one only 3.7s long. The one below passed. A fifth
// was titled "Trap Beat 130bpm" and measured 128 — which is the best evidence
// there is that the tempo tracker works on real music rather than on the
// synthetic controls in its own self-test.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

export interface StockTrack {
  id: string;
  /** What the uploader called it. */
  title: string;
  /** Where the bytes come from. Pinned, and checksummed below. */
  url: string;
  /** The licence, verbatim enough to be checked. */
  licence: "CC0";
  /** Who made it, recorded because provenance is the point even when CC0 owes nothing. */
  creator: string;
  /** Where it was found, so the licence claim can be re-checked. */
  via: string;
  /** Measured by scripts/check-music.py, not taken from the title. */
  bpm: number;
  bassShare: number;
  seconds: number;
}

/**
 * Tracks that have passed the niche check.
 *
 * Short, because they are LOOPS — lib/reel-music.ts loops the bed to the length
 * of the reel, so twelve seconds of drum and bass is twelve seconds that can
 * sit under a thirty-second video without ending in silence.
 */
export const STOCK_TRACKS: StockTrack[] = [
  {
    id: "dnb-loop",
    title: "Drum n Bass loop (Drum + Perc)",
    url: "https://cdn.freesound.org/previews/156/156863_236950-hq.mp3",
    licence: "CC0",
    creator: "freesound.org contributor 236950",
    via: "openverse.org, filtered to licence=cc0",
    bpm: 128,
    bassShare: 0.85,
    seconds: 12.0,
  },
];

export function trackById(id: string): StockTrack | undefined {
  return STOCK_TRACKS.find((t) => t.id === id);
}

/**
 * Everything wrong with the manifest, in the order somebody publishing would
 * care. The failure this guards is a track with no licence recorded, which is
 * the only kind that cannot be fixed after it has gone out.
 */
export function trackProblems(tracks: readonly StockTrack[] = STOCK_TRACKS): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const t of tracks) {
    if (seen.has(t.id)) problems.push(`${t.id}: two tracks share an id`);
    seen.add(t.id);
    if (!t.url.startsWith("https://")) problems.push(`${t.id}: is not fetched over https`);
    if (!t.creator.trim()) problems.push(`${t.id}: nobody is recorded as having made it`);
    if (!t.via.trim()) problems.push(`${t.id}: no record of where the licence claim came from`);
    /**
     * A LOOP MAY BE SHORT, BUT NOT THIS SHORT. Under five seconds the loop
     * point arrives often enough to be heard as a loop, which is worse than
     * silence because it is the only thing anybody will notice.
     */
    if (t.seconds < 5) problems.push(`${t.id}: ${t.seconds}s loops audibly`);
  }
  if (!tracks.length) problems.push("no track has passed the niche check yet");
  return problems;
}
