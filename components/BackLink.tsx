import Link from "next/link";

/**
 * The way back out of a sub-page.
 *
 * WHY A COMPONENT FOR A LINK. `← Back` was written out identically in eight
 * files, and every copy measured 40×33 — under the 44px floor on both axes,
 * which makes it the smallest target on pages it is often the most-used control
 * of. Eight copies also meant eight chances for the next one to be written
 * wrong, and the two that already said `← Back` while going somewhere other
 * than the previous screen had no way of being spotted.
 *
 * DESKTOP ONLY, NOW. The mobile header carries this control on every page that
 * is not a tab — one implementation, derived from the nav model, so it cannot
 * disagree with itself. Rendering both put two identical "← Performance" links
 * an inch apart, which reads as a bug rather than as generosity. The desktop
 * layout has no such header (it has the sidebar instead), so this is still the
 * only way back there and stays.
 *
 * WHY IT SAYS WHERE IT GOES. "Back" is the browser's word for the previous
 * page, but these are `<Link>`s to a fixed destination — from Nutrition it goes
 * to Progress, not wherever you came from. So the label names the destination.
 * The playbook's point about a value carrying more weight than its label
 * applies to navigation too: "Progress" is the information, "back" is the
 * grammar around it.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="tap-target -ml-2 mb-1 hidden gap-1 self-start px-2 text-sm text-slate-400 transition hover:text-accent-400 lg:inline-flex"
    >
      <span aria-hidden>←</span> {label}
    </Link>
  );
}
