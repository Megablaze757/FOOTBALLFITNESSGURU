// =============================================================================
// Positions — an athlete can play more than one.
//
// A full back who covers at centre back needs crossing AND heading; a winger
// who plays up front needs 1v1s AND finishing. Forcing one answer meant half
// their training was for someone else.
//
// Storage keeps both: `profiles.positions` is the full list, `profiles.position`
// is the primary (positions[0]). Everything that needs a single answer — the
// playbook guide, the AI prompt's headline — reads the primary; everything that
// can serve several — skill drills — reads the list. These two helpers are the
// only place that distinction lives, so callers can take either shape.
// =============================================================================

/** Normalise whatever a caller has — array, single string, null — to a clean list. */
export function positionList(p?: string | string[] | null): string[] {
  const raw = Array.isArray(p) ? p : [p];
  const out: string[] = [];
  for (const v of raw) {
    const t = typeof v === "string" ? v.trim() : "";
    // De-duplicate: the profile column and the array can both hold the primary.
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** The one to show when there's only room for one. */
export function primaryPosition(p?: string | string[] | null): string | undefined {
  return positionList(p)[0];
}

/** Human-readable, e.g. "Full back & Centre back". */
export function positionLabel(p?: string | string[] | null): string {
  const list = positionList(p);
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} & ${list[list.length - 1]}`;
}
