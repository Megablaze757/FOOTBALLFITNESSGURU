"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * The one-tap route into Apple Health: a shortcut somebody else already built.
 *
 * WHY THIS FILE EXISTS AT ALL. The Apple setup used to be a four-step build on
 * a phone — find the Health action, get the sort order and the limit right,
 * paste a link into a Text box, change a variable's unit so it stops being
 * "7 hr 32 min" — and the reported problem was simply that people could not
 * finish it. Every one of those steps is correct and none of them is the
 * athlete's job.
 *
 * Shortcuts can be SHARED. One person builds it once, publishes an iCloud link,
 * and everybody else taps the link, taps Add Shortcut, and pastes their own
 * upload link when it asks. Three taps and one paste, and none of them involve
 * knowing what a Health sample is.
 *
 * WHY THE LINK IS PASTED IN RATHER THAN GENERATED. An iCloud shortcut link can
 * only be produced by a real iPhone signed into iCloud, sharing a shortcut it
 * has installed. No API mints one, and a .shortcut file served from this site
 * cannot be signed. So somebody builds it once and publishes the link — see
 * docs/APPLE-SHORTCUT.md.
 *
 * WHERE IT IS STORED, AND WHY IT MOVED. It used to be the constant below, which
 * made switching this on a code edit, a commit, a build and a deploy — for a
 * value that can only be produced by hand on a phone. Anyone who can build and
 * share the shortcut can paste a link into a box, and nobody should need a
 * development environment to finish the job. It now lives in app_settings
 * (migration 0103) and an admin sets it from the Ops screen; the constant
 * remains as a fallback so a database without the column keeps working.
 *
 * WHY THE TOKEN IS NOT IN IT. A shared shortcut is the same shortcut for
 * everybody who installs it, so anything baked into it is public. The athlete's
 * upload link is a credential: it writes biometrics to their account. It has to
 * arrive on the phone that installs it, which is what the import question is
 * for.
 */

/**
 * Set this to the iCloud link once the shortcut has been published.
 *
 * NEXT_PUBLIC_APPLE_SHORTCUT_URL overrides it, which is what a deployment that
 * does not want to commit the link should use. Either way it is read at build
 * time — this app is a static export, so there is no runtime environment.
 */
const CONFIGURED = "";

/**
 * An iCloud shortcut link, and nothing else.
 *
 * A HALF-CONFIGURED VALUE MUST RENDER AS NOT CONFIGURED. The failure this
 * guards against is the one that already happened once with the ingest
 * endpoint: a button that looks live, does nothing, and tells nobody. A
 * placeholder left in the constant, a shortened link, a marketing page — none
 * of those install a shortcut, so none of them may light up the button.
 */
const ICLOUD = /^https:\/\/(?:www\.)?icloud\.com\/shortcuts\/[0-9a-f]{16,}\/?$/i;

export function isShortcutUrl(value: string | null | undefined): boolean {
  return typeof value === "string" && ICLOUD.test(value.trim());
}

/**
 * The build-time fallback, used when nothing is stored in app_settings.
 *
 * Still honoured because a deployment that would rather commit the link than
 * set it in a database should be able to, and because a database missing the
 * 0103 column must not lose a link that was already working.
 */
export function appleShortcutFallback(): string | null {
  const raw = (process.env.NEXT_PUBLIC_APPLE_SHORTCUT_URL || CONFIGURED || "").trim();
  return isShortcutUrl(raw) ? raw : null;
}

/**
 * Resolve the published link: what an admin set, else the fallback.
 *
 * A STORED VALUE THAT IS NOT A REAL LINK IS TREATED AS ABSENT, not as an
 * override that turns the feature off. The database constraint should have
 * refused it, but a column can be written by other means, and "somebody put
 * junk here" must not silently disable a working fallback.
 */
export function resolveShortcutUrl(stored: string | null | undefined): string | null {
  const clean = (stored ?? "").trim();
  if (isShortcutUrl(clean)) return clean;
  return appleShortcutFallback();
}

// --- reading it in the app ----------------------------------------------------

/**
 * Cached at module scope, like the launch flag.
 *
 * This is read by the wearable panel, which is on a page people open every
 * morning, and the answer changes about once in the lifetime of the product.
 * Refetching it on every navigation would be a request per visit for a value
 * that is effectively constant.
 */
let cached: string | null | undefined;

/** Reset the cache after an admin saves, so the change shows without a reload. */
export function primeShortcutUrl(value: string | null): void {
  cached = value;
}

export function useAppleShortcut(): string | null {
  const [url, setUrl] = useState<string | null>(cached ?? appleShortcutFallback());

  useEffect(() => {
    if (cached !== undefined) { setUrl(cached); return; }
    let live = true;
    void (async () => {
      const { data, error } = await createClient()
        .from("app_settings").select("apple_shortcut_url").maybeSingle();
      /**
       * A DATABASE WITHOUT 0103 KEEPS THE FALLBACK.
       *
       * PostgREST rejects a select naming a column it does not know, so this
       * errors rather than returning null — and treating that as "no link
       * published" would turn the feature off on every deployment that had it
       * working from the constant. Absent is not empty.
       */
      const resolved = error
        ? appleShortcutFallback()
        : resolveShortcutUrl((data as { apple_shortcut_url?: string | null } | null)?.apple_shortcut_url);
      cached = resolved;
      if (live) setUrl(resolved);
    })();
    return () => { live = false; };
  }, []);

  return url;
}
