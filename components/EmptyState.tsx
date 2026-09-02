import Link from "next/link";

/**
 * The screen someone sees on their first day.
 *
 * WHY THIS EXISTS. An empty state is the most-seen screen in the app and the
 * least-designed one — every new athlete meets it before they meet anything
 * else. A measured pass over the signed-in pages found the usual shape
 * everywhere: a grey sentence, centred, naming the state and stopping.
 * "Nothing logged yet this week." is not wrong; it is a dead end. Someone who
 * has just arrived reads it as *the feature is broken* or *this isn't for me*,
 * and the one thing they needed — where to tap — isn't on screen.
 *
 * The playbook's three parts, in order:
 *
 *   1. AN ICON, so the block reads as a designed state rather than a failed
 *      load. Purely decorative and `aria-hidden` — a screen reader gets the
 *      title and body, which say the same thing in words.
 *   2. WHAT WOULD FILL IT, in a sentence. Not "no data": the specific thing
 *      they'd have to do, so the emptiness is explained rather than announced.
 *   3. A WAY TO DO IT. The action is the point. Without it this is still a dead
 *      end, just a prettier one.
 *
 * Text is left-aligned under a centred icon. These bodies run past a hundred
 * characters and centring them gives every line a different starting x, which
 * the playbook flags and which is worse here than usual because this is the
 * copy a first-time user is most likely to actually read.
 */
export function EmptyState({ icon, title, body, action, compact }: {
  /** One emoji. Decorative — the title and body carry the meaning. */
  icon: string;
  title: string;
  /** What would fill this, specifically. */
  body: string;
  /** Where to go and do it. A `href` navigates; an `onClick` acts in place. */
  action?: { label: string; href?: string; onClick?: () => void };
  /** For a state nested inside a card that already has its own padding. */
  compact?: boolean;
}) {
  return (
    <div className={`text-center ${compact ? "px-3 py-5" : "px-4 py-8"}`}>
      <div className={compact ? "text-2xl" : "text-3xl"} aria-hidden>{icon}</div>
      <p className="mt-2 text-sm font-semibold text-slate-200">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-left text-xs leading-relaxed text-slate-500">{body}</p>
      {action && (
        <div className="mt-3">
          {action.href ? (
            <Link href={action.href} className="chip-option chip-option-sm border-pitch-400/40 text-accent-400">
              {action.label}
            </Link>
          ) : (
            <button onClick={action.onClick} className="chip-option chip-option-sm border-pitch-400/40 text-accent-400">
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
