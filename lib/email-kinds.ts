/**
 * What kind of email was that, in words rather than in database keys.
 *
 * THE PROBLEM THIS SOLVES. The email audit already recorded a type for every
 * send — `trigger_kind` for anything born as a notification, `email_category`
 * for the delivery bucket — and showed it as a raw key in the fourth column, in
 * grey, at eleven pixels. So "check_in_reminder" was technically on screen and
 * the actual question, which is "what is this app sending people?", could not
 * be answered without reading a hundred rows and tallying them in your head.
 *
 * TWO DIFFERENT THINGS WERE BEING SHOWN IN ONE COLUMN, which is why it never
 * read clearly:
 *
 *   trigger_kind     WHY it was sent — a check-in reminder, a streak milestone,
 *                    a trial ending. This is what somebody means by "type".
 *   email_category   WHICH BUCKET it belongs to for unsubscribe purposes —
 *                    essential, weekly, program, workout, milestone, none.
 *                    A preference switch, not a description.
 *
 * The kind is the answer; the category is the fallback for a send that never
 * was a notification (the waitlist announcement, a test).
 *
 * UNKNOWN KEYS ARE HUMANISED, NOT DROPPED. A new kind added in the Worker would
 * otherwise render as a blank cell or as a raw key, and the Worker ships
 * separately from this app — it is routinely ahead. An unrecognised key gets
 * its underscores turned into spaces and its first letter capitalised, which is
 * right often enough to be useful and never worse than the key itself.
 */

export interface EmailKind {
  /** The stored key. */
  id: string;
  /** What an admin reads. */
  label: string;
  /** One line on when it goes out, for the tooltip. */
  when: string;
  /** Grouping for the summary: automatic, one-off, or account. */
  group: "automatic" | "account" | "one-off";
}

/**
 * Every kind the Worker actually sends, as of WORKER_VERSION 2026-08-24.4.
 *
 * Deliberately a flat list rather than a union type: this app cannot import
 * from the Worker, the Worker is deployed separately and is often ahead, and a
 * type that claims to be exhaustive about somebody else's deployment is a
 * type that lies.
 */
export const EMAIL_KINDS: EmailKind[] = [
  { id: "check_in_reminder", label: "Check-in reminder", group: "automatic",
    when: "When they have not logged for three days, and every third day after." },
  { id: "workout_reminder", label: "Workout reminder", group: "automatic",
    when: "When a scheduled session has not been logged." },
  { id: "weekly_summary", label: "Weekly summary", group: "automatic",
    when: "Once a week, with what they did." },
  { id: "program_deadline", label: "Block deadline", group: "automatic",
    when: "As a training block runs out of time." },
  { id: "streak_milestone", label: "Streak milestone", group: "automatic",
    when: "On a streak worth saying something about." },
  { id: "goal_reached", label: "Goal reached", group: "automatic",
    when: "When a target they set is hit." },
  { id: "milestone", label: "Milestone", group: "automatic",
    when: "A progress milestone other than a streak." },
  { id: "program_assigned", label: "Programme assigned", group: "account",
    when: "When a coach assigns them a block." },
  { id: "coach_request", label: "Coach request", group: "account",
    when: "When a coach asks to add them." },
  { id: "trial_ending", label: "Trial ending", group: "account",
    when: "Before a trial runs out." },
  { id: "billing", label: "Billing", group: "account",
    when: "Payment and subscription changes." },
  // Not notifications: these are sent directly and carry only a category.
  { id: "launch", label: "Launch announcement", group: "one-off",
    when: "The waitlist announcement, sent from this screen." },
  { id: "essential", label: "Account email", group: "account",
    when: "Sign-in, password and other mail nobody can unsubscribe from." },
  { id: "weekly", label: "Weekly digest", group: "automatic",
    when: "The weekly bucket, when no more specific kind was recorded." },
  { id: "program", label: "Programme email", group: "automatic",
    when: "The programme bucket, when no more specific kind was recorded." },
  { id: "workout", label: "Workout email", group: "automatic",
    when: "The workout bucket, when no more specific kind was recorded." },
  { id: "none", label: "In-app only", group: "one-off",
    when: "Recorded but deliberately not emailed — the card shows in the app instead." },
];

const BY_ID = new Map(EMAIL_KINDS.map((k) => [k.id, k]));

/** Underscores to spaces, first letter up. Right often enough to beat a raw key. */
function humanise(id: string): string {
  const words = id.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Unknown";
}

/**
 * The kind of one audit row.
 *
 * `trigger_kind` wins because it says WHY; `email_category` is the bucket and
 * only answers when there was no notification behind the send.
 */
export function emailKindOf(row: { trigger_kind?: string | null; email_category?: string | null }): EmailKind {
  const id = (row.trigger_kind || row.email_category || "").trim();
  if (!id) return { id: "unknown", label: "Unrecorded", when: "No kind was stored with this send.", group: "one-off" };
  return BY_ID.get(id) ?? { id, label: humanise(id), when: "Sent by the Worker; not described in this app yet.", group: "one-off" };
}

export interface KindCount {
  kind: EmailKind;
  sent: number;
  failed: number;
  total: number;
}

/**
 * How many of each kind went out, most first.
 *
 * FAILURES COUNTED SEPARATELY, because "we sent 200 check-in reminders" and
 * "we attempted 200 check-in reminders and 190 bounced" are the same number and
 * opposite situations — and the second one is the whole reason to open this
 * screen.
 */
export function countByKind(
  rows: { trigger_kind?: string | null; email_category?: string | null; status: string }[],
): KindCount[] {
  const FAILED = new Set(["failed", "bounced", "complained"]);
  const by = new Map<string, KindCount>();

  for (const row of rows ?? []) {
    const kind = emailKindOf(row);
    const held = by.get(kind.id) ?? { kind, sent: 0, failed: 0, total: 0 };
    if (FAILED.has(row.status)) held.failed += 1;
    else held.sent += 1;
    held.total += 1;
    by.set(kind.id, held);
  }

  return [...by.values()].sort((a, b) =>
    // A kind that is failing is what you came to look at, so it sorts up.
    Number(b.failed > 0) - Number(a.failed > 0) || b.total - a.total || a.kind.label.localeCompare(b.kind.label));
}
