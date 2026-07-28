"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Progress moved into /dashboard as a tab, beside the recovery half it was
 * always half of.
 *
 * This redirect stays because the URL is out in the wild: it's linked from
 * older emails, it's in people's history, and the app itself pointed at it for
 * months. A dead link is a worse outcome than a file that does nothing but
 * forward — deleting the route would 404 anyone who bookmarked their own
 * training history.
 */
export default function HistoryRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/dashboard"); }, [router]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-pitch-400" />
    </div>
  );
}
