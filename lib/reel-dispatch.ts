// =============================================================================
// ONE CLICK, FROM THE PANEL THAT ALREADY KNOWS WHAT TO FILM.
//
// ═══════════════════════════════════════════════════════════════════════════
// "MAKE THE ADMIN ONE CLICK TO MAKE THE REEL — IT'S TOO COMPLEX."
//
// It was: open GitHub, find Actions, find the workflow, Run workflow, choose a
// script from a dropdown, wait, find the run, download the artefact. Seven
// steps outside the app to make a thing the app already knows it wants — the
// schedule names the subject and the asset, and the studio can build exactly
// that.
//
// So the panel asks the Worker and the Worker asks GitHub.
//
// WHY repository_dispatch AND NOT workflow_dispatch. They do the same job and
// need different permissions: workflow_dispatch requires Actions: write on the
// token, repository_dispatch requires Contents: write — which is the
// permission the publish-cues token already has. Same button, no second setup
// step, no widening of what that credential can do.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

/** The `event_type` the workflow listens for. Both sides must agree. */
export const REEL_EVENT = "record-reel";

/**
 * The still-image post, which is a different workflow and a different job.
 *
 * ONE ROUTE FOR BOTH, and not a second endpoint: the admin token, the
 * validation and the Worker's error handling are the interesting parts and
 * duplicating them is how one of the two copies quietly stops being checked.
 */
export const CAROUSEL_EVENT = "record-carousel";

export type ReelKind = "reel" | "carousel";

export interface ReelRequest {
  /** Ignored for a carousel: there is one carousel, not four. */
  script: string;
  /** Narrate it. Off records a silent reel with captions. */
  voice: boolean;
  /** For a drill or a recipe reel, what it is about. */
  subject?: string;
  /** Defaults to "reel", because every caller before this one meant a reel. */
  kind?: ReelKind;
}

/**
 * The scripts a request may name.
 *
 * A CLOSED LIST, checked in the Worker rather than trusted from the browser.
 * The value ends up in a workflow that runs shell, and "it came from our own
 * admin page" is not a reason to hand an arbitrary string to it.
 */
export const REEL_SCRIPTS = ["demo-readiness", "demo-cost", "drill", "standards"] as const;

/** Why this request cannot be sent, or null. */
export function reelRequestProblem(request: Partial<ReelRequest> | null | undefined): string | null {
  const kind = request?.kind ?? "reel";
  if (kind !== "reel" && kind !== "carousel") return `"${String(kind)}" is not something this makes`;

  /**
   * A CAROUSEL NAMES NO SCRIPT, and must not be made to invent one. There is
   * one carousel — the priced protein list — so requiring a script here would
   * mean the caller passing a reel's name for a post that is not a reel, and
   * the next reader believing it meant something.
   */
  if (kind === "reel") {
    const script = String(request?.script ?? "").trim();
    if (!script) return "no script named";
    if (!(REEL_SCRIPTS as readonly string[]).includes(script)) return `"${script}" is not a reel script`;
  }

  const subject = request?.subject;
  if (subject !== undefined) {
    if (typeof subject !== "string") return "the subject is not text";
    if (subject.length > 120) return "the subject is longer than any drill name";
    /**
     * The subject reaches a shell as an argument. Quoting protects it, and a
     * character class is the belt: nothing in a drill or a lift name needs
     * anything outside this, so anything that does is not one.
     */
    /**
     * UNICODE, and the punctuation this app actually writes.
     *
     * The first version was `[\w &'(),./:-]` and rejected "Pacing ladder —
     * running" — the schedule's own subjects, which are full of em-dashes,
     * pound signs and curly apostrophes. An allowlist that refuses the app's
     * own data is a validator that only ever fires on legitimate input.
     *
     * Still an allowlist, and still without the characters that matter: no
     * `$`, no backtick, no `;`, no `|`, no angle brackets, no newline. The
     * value reaches a shell as a quoted argument, so quoting is the defence
     * and this is the belt.
     */
    if (!/^[\p{L}\p{N} &'\u2019(),./:%+\u00a3\u00b0\u2013\u2014-]*$/u.test(subject)) {
      return "the subject has characters a drill name would not";
    }
  }
  return null;
}

/** The body GitHub's dispatch endpoint wants. */
export function dispatchBody(request: ReelRequest): {
  event_type: string;
  client_payload: { script: string; voice: string; subject: string };
} {
  return {
    event_type: (request.kind ?? "reel") === "carousel" ? CAROUSEL_EVENT : REEL_EVENT,
    client_payload: {
      script: request.script ?? "",
      // STRINGS, not booleans. A GitHub Actions expression comparing a JSON
      // boolean from client_payload against a string is a comparison nobody
      // can read and half the internet gets wrong; "true"/"false" compares the
      // same way on both trigger paths.
      voice: request.voice ? "true" : "false",
      subject: request.subject ?? "",
    },
  };
}
