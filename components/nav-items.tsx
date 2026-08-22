// Shared navigation model + icons, used by the mobile TabBar, the mobile
// AppHeader, the desktop SideNav and the per-section link rows.
//
// FOUR TABS, NO "MORE".
//
// The bar had grown to five tabs plus a More sheet, and the sheet held seven
// destinations — /library, /train, /essentials and /history had no other link
// anywhere in the app, so four features existed only behind a "…" button. A
// menu of everything you didn't have room for is not navigation; it is the
// place features go to stop being used.
//
// The replacement is four domains that between them describe the whole product
// — Training, Food, Recovery, Performance — with everything else surfaced ON
// the domain it belongs to, via SECTION_LINKS. Home and Profile move to a
// persistent top bar, so they are one tap from anywhere rather than two.
// Ask coach is the floating bubble and is not a destination at all.
//
// The rule this file now enforces (in lib/nav.test.ts): every destination is
// reachable in at most two taps, and nothing is reachable ONLY from a sheet.

// LABELS SAY WHAT YOU GET, NOT WHAT WE CALL IT INTERNALLY.
//
// Routes are deliberately unchanged — they're bookmarked, linked from emails
// and baked into a static export, and renaming them buys nothing a label
// doesn't. So /coach reads "Training", /dashboard reads "Performance" and
// /injury reads "Recovery", which is the wrong way round from the URLs and the
// right way round for a person.
export const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: "home" },
  // The four domains, in the order the tab bar shows them.
  { href: "/coach", label: "Training", icon: "coach" },
  { href: "/nutrition", label: "Food", icon: "nutrition" },
  // "Recovery", not "Injury". The page has always covered mobility and rehab
  // as well as acute pain, and a tab you only tap when something already hurts
  // is a tab most people never tap. The injury triage card is still the first
  // thing on it and still says the word.
  { href: "/injury", label: "Recovery", icon: "injury" },
  { href: "/dashboard", label: "Performance", icon: "stats" },
  // Reached from the section rows on those four, and from the top bar.
  { href: "/journal", label: "Today's log", icon: "journal" },
  { href: "/library", label: "Exercises", icon: "library" },
  { href: "/train", label: "Video analysis", icon: "train" },
  { href: "/essentials", label: "Guides", icon: "playbook" },
  { href: "/rewards", label: "Rewards", icon: "trophy" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/profile", label: "Profile", icon: "profile" },
] as const;

/**
 * The bottom bar. Exactly four, and no fifth slot to be tempted by.
 *
 * `short` is the tab-bar label; `label` is used everywhere the space is real.
 * At four tabs a 320px phone gives each one about 72px, which is why the
 * shortening that five tabs forced ("Plan", "Check") is no longer needed —
 * every one of these renders in full.
 */
export const MOBILE_NAV = [
  { href: "/coach", label: "Training", short: "Training", icon: "coach" },
  { href: "/nutrition", label: "Food", short: "Food", icon: "nutrition" },
  { href: "/injury", label: "Recovery", short: "Recovery", icon: "injury" },
  { href: "/dashboard", label: "Performance", short: "Progress", icon: "stats" },
] as const;

/**
 * Always visible, above the content, on every app screen.
 *
 * Home and Profile were the two destinations that fit no domain — Home is a
 * view of all four and Profile is none of them — and both had ended up in the
 * More sheet, which is how you make the page people open first take two taps.
 * A top bar costs one row of height and makes them one tap from everywhere.
 */
export const HEADER_NAV = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/profile", label: "Profile", icon: "profile" },
] as const;

/**
 * Everything else, shown ON the tab it belongs to.
 *
 * These render as a row of chips directly under each section's heading (see
 * components/SectionNav.tsx), which is the "no More section" rule in practice:
 * a feature lives next to the thing it is about, not in a drawer of leftovers.
 *
 * Keyed by route so a page can ask for its own row without repeating itself.
 */
export const SECTION_LINKS: Record<string, readonly { href: string; label: string; icon: string }[]> = {
  "/coach": [
    { href: "/journal", label: "Today's log", icon: "journal" },
    { href: "/library", label: "Exercises", icon: "library" },
    { href: "/essentials", label: "Guides", icon: "playbook" },
    { href: "/train", label: "Video analysis", icon: "train" },
  ],
  "/nutrition": [
    { href: "/journal", label: "Today's log", icon: "journal" },
    { href: "/library?tab=meals", label: "Recipes", icon: "library" },
    { href: "/essentials", label: "Guides", icon: "playbook" },
  ],
  "/injury": [
    { href: "/journal", label: "Today's log", icon: "journal" },
    { href: "/essentials", label: "Guides", icon: "playbook" },
  ],
  "/dashboard": [
    { href: "/history", label: "History", icon: "history" },
    { href: "/rewards", label: "Rewards", icon: "trophy" },
    { href: "/train", label: "Video analysis", icon: "train" },
  ],
};

/**
 * Routes that belong to a section but are not listed in its row.
 *
 * SECTION_LINKS already says where most things live, and `parentOf` reads it
 * first. These are the leaves that nothing links to from a chip — you arrive at
 * them from a card, a button or a deep link — and which therefore need the way
 * back stated somewhere.
 */
const EXTRA_PARENTS: Record<string, string> = {
  "/benchmarks": "/dashboard",
  "/body": "/dashboard",
  "/report": "/dashboard",
  "/squad": "/profile",
  "/pricing": "/profile",
  "/partner": "/profile",
  "/onboarding": "/home",
  "/ask": "/home",
};

/**
 * The way back out of a page, named.
 *
 * WHY IT NAMES THE DESTINATION rather than saying "back". "Back" is the
 * browser's word for the previous page, and this is not that: it is a link to
 * a fixed place, so from Exercises it goes to Training whether you arrived
 * from Training or from a search result. A label that says "Training" is the
 * information; "back" is only the grammar around it. Same reasoning as
 * components/BackLink.tsx, which said it first.
 *
 * `router.back()` was the other option and is worse here: half the ways into
 * these pages are deep links and notification taps, where the previous entry
 * is another site or nothing at all.
 *
 * Null for the four tabs and for Home, which are where back would go.
 */
export function parentOf(pathname: string): { href: string; label: string } | null {
  const path = pathname.split("?")[0].replace(/\/$/, "") || "/";
  const label = (href: string) =>
    NAV_ITEMS.find((i) => i.href === href)?.label ?? "Back";

  const isTab = MOBILE_NAV.some((t) => t.href === path);
  if (isTab || path === "/home" || path === "/") return null;

  for (const [section, links] of Object.entries(SECTION_LINKS)) {
    if (links.some((l) => l.href.split("?")[0] === path)) {
      return { href: section, label: label(section) };
    }
  }

  const extra = EXTRA_PARENTS[path];
  if (extra) return { href: extra, label: extra === "/home" ? "Home" : label(extra) };

  // A sub-route of something known — /train/view under /train, /squad/view
  // under /squad. Walk up one level rather than dumping them on Home.
  const up = path.slice(0, path.lastIndexOf("/"));
  if (up && up !== path) {
    const owner = parentOf(up);
    if (NAV_ITEMS.some((i) => i.href === up)) return { href: up, label: label(up) };
    if (owner) return owner;
  }
  return { href: "/home", label: "Home" };
}

/**
 * Shown only to coaches, appended by SideNav and linked from Profile.
 *
 * /squad is the whole coach product — roster, readiness at a glance, assigning
 * programs, team exercises, per-athlete analytics.
 *
 * Not in NAV_ITEMS because most users are athletes, and a permanent tab that
 * opens onto a "coaches only" wall is worse than no tab at all.
 */
export const COACH_NAV = [
  { href: "/squad", label: "My squad", icon: "squad" },
] as const;

export function NavIcon({ name, active, size = 22 }: { name: string; active: boolean; size?: number }) {
  const stroke = active ? "#e3b53f" : "#94a3b8";
  const common = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke,
    strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "home":
      return <svg {...common}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>;
    case "journal":
      return <svg {...common}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>;
    case "stats":
      return <svg {...common}><path d="M4 19V5" /><path d="M4 15l4-4 4 3 6-7" /></svg>;
    case "coach":
      return <svg {...common}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.2" /><path d="M12 1v3M12 20v3M1 12h3M20 12h3" /></svg>;
    case "train":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m12 3 2.5 5-2.5 2-2.5-2L12 3zM3.5 10l4 1 1 3-3 2.5M20.5 10l-4 1-1 3 3 2.5" /></svg>;
    case "nutrition":
      return <svg {...common}><path d="M12 21c-3.5-2-6-5.5-6-9.5A6 6 0 0 1 12 5a6 6 0 0 1 6 6.5c0 4-2.5 7.5-6 9.5Z" /><path d="M12 5V2" /></svg>;
    case "history":
      return <svg {...common}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 4v4h4" /><path d="M12 8v4l3 2" /></svg>;
    case "library":
      return <svg {...common}><path d="M4 4v16" /><path d="M8 4v16" /><rect x="12" y="4" width="8" height="16" rx="1" transform="rotate(6 16 12)" /></svg>;
    case "profile":
      return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>;
    case "trophy":
      return <svg {...common}><path d="M8 4h8v4a4 4 0 0 1-8 0V4z" /><path d="M8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3" /><path d="M12 12v4M9 20h6M10 20l.5-4M14 20l-.5-4" /></svg>;
    case "playbook":
      return <svg {...common}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z" /><path d="M9 7h6M9 11h6" /></svg>;
    case "injury":
      // A plaster. Reads as "something's hurt" faster than a cross or a heart.
      return <svg {...common}><rect x="2.6" y="8.5" width="18.8" height="7" rx="3.5" transform="rotate(-35 12 12)" /><path d="M10.4 10.4l3.2 3.2M13.6 10.4l-3.2 3.2" /></svg>;
    case "chat":
      // A speech bubble. Reads as "ask something" faster than a question mark,
      // which reads as help or FAQ.
      return <svg {...common}><path d="M21 12a8 8 0 0 1-8 8H7l-4 3 1.2-4.2A8 8 0 1 1 21 12z" /><path d="M9 11h6M9 14h4" /></svg>;
    case "squad":
      // Two people — a roster, not a single profile.
      return <svg {...common}><circle cx="9" cy="8" r="3.2" /><path d="M3 20v-1.5A4.5 4.5 0 0 1 7.5 14h3A4.5 4.5 0 0 1 15 18.5V20" /><path d="M16 5.5a3.2 3.2 0 0 1 0 6M18 14h.5A4.5 4.5 0 0 1 23 18.5V20" /></svg>;
    default:
      return null;
  }
}
