"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * The PocketAthlete mark.
 *
 * Uses the 192px icon rather than the 512: this renders at 32–64px, and the
 * full-size file is a 295KB brushed-gold texture. 192 still covers a 64px slot
 * on a 3x display with room to spare.
 *
 * next/image so the GitHub Pages basePath is applied for us, and a typographic
 * fallback if the file is ever missing — this is a static export, so an absent
 * icon is a broken-image glyph in the header of every page rather than a build
 * error, and a broken logo is the first thing a visitor sees.
 */
export function Logo({ size = 36, className = "" }: { size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        style={{ width: size, height: size, fontSize: size * 0.4 }}
        className={`grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#f6d365] to-[#c9962f] font-black tracking-tight text-on-accent shadow-glow ${className}`}
      >
        PA
      </span>
    );
  }

  return (
    <Image
      src="/icon-192.png"
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
