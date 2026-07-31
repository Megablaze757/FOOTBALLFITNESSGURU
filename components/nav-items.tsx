// Shared navigation model + icons, used by both the mobile TabBar and the
// desktop SideNav so the two stay in sync.
//
// "Stats" and "Progress" used to be two entries pointing at two pages that
// answered the same question — and no one could reasonably guess which held
// injury risk and which held their squat history. They are one page with two
// tabs now, and one entry in the nav.

// LABELS SAY WHAT YOU GET, NOT WHAT WE CALL IT INTERNALLY.
//
// The old set could not be guessed by anyone who hadn't built it. "Train" was
// video analysis, while the place you actually train was "Coach". "Journal"
// was a daily check-in, not a diary. "Playbook" and "Library" both sounded
// like reference material and one of them was the exercise list. Five of the
// ten labels required you to already know the answer.
//
// Routes are deliberately unchanged — they're bookmarked, linked from emails
// and baked into a static export, and renaming them buys nothing a label
// doesn't. So /coach reads "My plan" and /train reads "Video analysis", which
// is the wrong way round from the URLs and the right way round for a person.
export const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/coach", label: "My plan", icon: "coach" },
  { href: "/journal", label: "Check in", icon: "journal" },
  { href: "/dashboard", label: "Progress", icon: "stats" },
  { href: "/train", label: "Video analysis", icon: "train" },
  { href: "/library", label: "Exercises", icon: "library" },
  { href: "/nutrition", label: "Nutrition", icon: "nutrition" },
  // Its own destination, not the third tab of Guides. Two rounds of "still can't
  // find the injury stuff" is the answer to whether a deep link was enough.
  { href: "/injury", label: "Injury", icon: "injury" },
  { href: "/essentials", label: "Guides", icon: "playbook" },
  { href: "/rewards", label: "Rewards", icon: "trophy" },
  { href: "/profile", label: "Profile", icon: "profile" },
] as const;

// The four you'd touch on a normal day, plus More.
//
// Was Home / Coach / Journal / Playbook / Train — two of the five primary tabs
// were reference content and video analysis, while Progress was buried in the
// sheet. The daily loop is: see the plan, do it, check in, watch it move.
// `short` is the tab-bar label; `label` is used everywhere the space is real
// (the More sheet, the sidebar). SIX tabs on a 320px phone gives each one 45px,
// and at that width "Check in" and "Progress" rendered edge to edge with no
// gutter between them — the bar read as "Check in Progress", one phrase. The
// labels weren't wrong, there just wasn't room for them side by side.
//
// So the tab bar gets the shortest form that still says what it is, and the
// full wording survives in the two places that can fit it. "Plan" and "Check"
// are what you'd say out loud anyway.
export const MOBILE_NAV = [
  { href: "/home", label: "Home", short: "Home", icon: "home" },
  { href: "/coach", label: "My plan", short: "Plan", icon: "coach" },
  { href: "/journal", label: "Check in", short: "Check", icon: "journal" },
  { href: "/dashboard", label: "Progress", short: "Progress", icon: "stats" },
  // Promoted out of the More sheet. Told twice it was unfindable, and "open
  // More, then look" is not findable when something hurts — which is the one
  // moment this page exists for.
  //
  // That makes five tabs plus More, one more than I originally allowed myself.
  // The label had to shrink to "Injury" to fit: at six slots a 343px phone gives
  // each about 57px, which "Injury" clears and "Injury & mobility" does not.
  // Mobility is named in the page's own lead and has its own section there —
  // a short label people can find beats a complete one they can't.
  { href: "/injury", label: "Injury", short: "Injury", icon: "injury" },
] as const;

/**
 * Shown only to coaches, appended by SideNav and the mobile More sheet.
 *
 * /squad is the whole coach product — roster, readiness at a glance, assigning
 * programs, team exercises, per-athlete analytics — and it had no navigation
 * entry whatsoever. The only route in was a link on the Profile page, so a coach
 * set their role and then had to guess where their squad had gone.
 *
 * Not in NAV_ITEMS because most users are athletes, and a permanent tab that
 * opens onto a "coaches only" wall is worse than no tab at all.
 */
export const COACH_NAV = [
  { href: "/squad", label: "My squad", icon: "squad" },
] as const;

// Everything else. Reached from the mobile "More" sheet.
export const MOBILE_MORE = [
  { href: "/train", label: "Video analysis", icon: "train" },
  { href: "/library", label: "Exercises", icon: "library" },
  { href: "/nutrition", label: "Nutrition", icon: "nutrition" },
  // Injury lives in MOBILE_NAV now, as a primary tab, so it must not also be
  // here — a route in both lists reads as two different places.
  { href: "/essentials", label: "Guides", icon: "playbook" },
  { href: "/rewards", label: "Rewards", icon: "trophy" },
  { href: "/profile", label: "Profile", icon: "profile" },
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
    case "more":
      return <svg {...common}><circle cx="5" cy="12" r="1.6" fill={stroke} /><circle cx="12" cy="12" r="1.6" fill={stroke} /><circle cx="19" cy="12" r="1.6" fill={stroke} /></svg>;
    case "trophy":
      return <svg {...common}><path d="M8 4h8v4a4 4 0 0 1-8 0V4z" /><path d="M8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3" /><path d="M12 12v4M9 20h6M10 20l.5-4M14 20l-.5-4" /></svg>;
    case "playbook":
      return <svg {...common}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z" /><path d="M9 7h6M9 11h6" /></svg>;
    case "injury":
      // A plaster. Reads as "something's hurt" faster than a cross or a heart.
      return <svg {...common}><rect x="2.6" y="8.5" width="18.8" height="7" rx="3.5" transform="rotate(-35 12 12)" /><path d="M10.4 10.4l3.2 3.2M13.6 10.4l-3.2 3.2" /></svg>;
    case "squad":
      // Two people — a roster, not a single profile.
      return <svg {...common}><circle cx="9" cy="8" r="3.2" /><path d="M3 20v-1.5A4.5 4.5 0 0 1 7.5 14h3A4.5 4.5 0 0 1 15 18.5V20" /><path d="M16 5.5a3.2 3.2 0 0 1 0 6M18 14h.5A4.5 4.5 0 0 1 23 18.5V20" /></svg>;
    default:
      return null;
  }
}
