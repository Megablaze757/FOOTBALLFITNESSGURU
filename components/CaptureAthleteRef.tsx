"use client";

import { useEffect } from "react";
import { captureRef, setRefIfUnset } from "@/lib/referral";

/**
 * The athlete page pays the athlete.
 *
 * Renders nothing. It exists because app/a/[username]/page.tsx is a server
 * component rendered once at build time, and remembering who sent a visitor is
 * necessarily something that happens in their browser.
 *
 * ORDER MATTERS: captureRef() first, so a ?ref= that somebody deliberately put
 * on this URL wins outright, and setRefIfUnset() second, so it only fills a
 * slot nobody else has claimed. See the note on setRefIfUnset for why the
 * other order would take money off an affiliate.
 */
export function CaptureAthleteRef({ username }: { username: string }) {
  useEffect(() => {
    captureRef();
    setRefIfUnset(username);
  }, [username]);
  return null;
}
