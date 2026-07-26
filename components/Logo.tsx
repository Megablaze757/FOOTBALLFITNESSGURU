"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * The PocketAthlete mark.
 *
 * Renders `public/logo.png` — via next/image so the GitHub Pages basePath is
 * applied for us — and falls back to a typographic tile if that file isn't
 * there. The fallback matters: this is a static export, so a missing file is a
 * broken-image icon in the header of every page rather than a build error, and
 * a broken logo is the first thing a visitor sees.
 */
export function Logo({ size = 36, className = "" }: { size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        style={{ width: size, height: size, fontSize: size * 0.4 }}
        className={`grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#f6d365] to-[#c9962f] font-black tracking-tight text-ink-900 shadow-glow ${className}`}
      >
        PA
      </span>
    );
  }

  return (
    <Image
      src="/logo.png"
      alt="PocketAthlete"
      width={size}
      height={size}
      priority
      unoptimized
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-xl ${className}`}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
