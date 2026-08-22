"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "@/components/nav-items";

/**
 * Home, from anywhere, without aiming for the top of the screen.
 *
 * The wordmark in the header goes home and is always on screen — but it is at
 * the TOP of a phone held in one hand, which is the one part of the display a
 * thumb cannot reach. Every other primary control in this app sits in the
 * bottom third for exactly that reason, and home was the exception.
 *
 * BOTTOM LEFT, not stacked under the coach. Two round buttons in the same
 * corner is a pile, and the second one gets tapped by accident. Left also puts
 * it where a left-handed grip lands and where "back out of here" lives in most
 * apps, which is the gesture this is closest to.
 *
 * Hidden on Home itself: a button that takes you where you already are is a
 * button that teaches people the controls do not mean anything.
 */
export function HomeBubble() {
  const pathname = usePathname() ?? "";
  if (pathname === "/home" || pathname.startsWith("/home/")) return null;
  // The guided player and the onboarding flow are full-screen and deliberately
  // have one way out each. A second exit floating over them is a way to lose
  // a half-finished session by accident.
  if (pathname.startsWith("/onboarding")) return null;

  return (
    <Link
      href="/home"
      aria-label="Home"
      // Same bottom offset as the coach bubble, so the two sit on one line
      // above the tab bar rather than at two arbitrary heights.
      className="fixed bottom-24 left-4 z-40 grid h-12 w-12 place-items-center rounded-full border border-white/[0.10] bg-ink-800 shadow-card transition hover:border-pitch-400/40 lg:hidden"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <NavIcon name="home" active={false} size={20} />
    </Link>
  );
}
