// Shared navigation model + icons, used by both the mobile TabBar and the
// desktop SideNav so the two stay in sync.

export const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/coach", label: "Coach", icon: "coach" },
  { href: "/journal", label: "Journal", icon: "journal" },
  { href: "/dashboard", label: "Stats", icon: "stats" },
  { href: "/train", label: "Train", icon: "train" },
  { href: "/nutrition", label: "Nutrition", icon: "nutrition" },
  { href: "/history", label: "Progress", icon: "history" },
  { href: "/profile", label: "Profile", icon: "profile" },
] as const;

// A trimmed set for the space-constrained mobile bar.
export const MOBILE_NAV = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/coach", label: "Coach", icon: "coach" },
  { href: "/journal", label: "Journal", icon: "journal" },
  { href: "/dashboard", label: "Stats", icon: "stats" },
  { href: "/train", label: "Train", icon: "train" },
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
    case "profile":
      return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>;
    default:
      return null;
  }
}
