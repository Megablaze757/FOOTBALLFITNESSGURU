"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children into <body>, outside the page tree.
 *
 * Every page wraps its content in `animate-fade-up`, whose fill-mode is `both`
 * — so after the animation the wrapper keeps `transform: translateY(0)`. A
 * transform of any value (including an identity one) makes that element the
 * containing block for `position: fixed` descendants, so a full-screen overlay
 * inside it anchored to the top of the page's entire scroll height rather than
 * to the viewport. On a long list you'd scroll down, tap, and the modal would
 * open somewhere above the screen: it looked like the tap did nothing.
 *
 * Portalling out of the wrapper is the fix; changing the animation would only
 * move the problem to the next thing that needs a transform.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  // document doesn't exist during the static export's prerender.
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
