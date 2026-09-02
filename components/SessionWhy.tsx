"use client";

import { Icon, type IconName } from "@/components/Icon";
import { sessionWhy, type SessionWhyInput } from "@/lib/session-why";

/**
 * "Why I programmed this today", answered before you have to ask.
 *
 * The plan could already explain itself when something went WRONG — a readiness
 * adaptation, a rehab substitution and a validator correction each say so. The
 * ordinary case said nothing at all: you opened Tuesday, saw a list, and had to
 * take it on faith. That is most of what "I don't know if this is a good
 * programme" means.
 *
 * OPEN BY DEFAULT, and closed after that. The reasoning is the point on the
 * first few sessions and furniture by the twentieth, so it remembers being
 * closed — per athlete, in this browser, which is the right scope for a
 * preference about how much explanation somebody wants.
 *
 * Every line is derived from the session below it; see lib/session-why.ts.
 */
export function SessionWhy(props: SessionWhyInput & { storageKey?: string }) {
  const { storageKey, ...input } = props;
  const why = sessionWhy(input);
  if (!why.lines.length) return null;

  return (
    <details
      className="group mb-2 mt-2 rounded-2xl border border-pitch-400/20 bg-pitch-400/[0.04]"
      open={initiallyOpen(storageKey)}
      onToggle={(e) => remember(storageKey, (e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="tap-target flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-left">
        <span className="min-w-0">
          <span className="block text-xs font-bold text-accent-300">Why this session, today</span>
          <span className="block truncate text-[11px] text-slate-400">{why.headline}</span>
        </span>
        <span className="shrink-0 text-slate-500 transition group-open:rotate-180">▾</span>
      </summary>
      <ul className="space-y-2 border-t border-pitch-400/15 px-3 py-3">
        {why.lines.map((line, i) => (
          <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-slate-300">
            <span className="mt-0.5 shrink-0 text-accent-500">
              <Icon name={line.icon as IconName} size={14} />
            </span>
            <span className="min-w-0">{line.text}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Wrapped in try/catch because localStorage throws outright in a private
 * window and in some embedded views — and an explanation panel is not worth
 * taking the session down for.
 */
function initiallyOpen(key?: string): boolean {
  if (!key) return true;
  try {
    return window.localStorage.getItem(`why:${key}`) !== "closed";
  } catch {
    return true;
  }
}

function remember(key: string | undefined, open: boolean) {
  if (!key) return;
  try {
    window.localStorage.setItem(`why:${key}`, open ? "open" : "closed");
  } catch {
    // Nothing to do and nothing worth saying: the panel simply opens next time.
  }
}
