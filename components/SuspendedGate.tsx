"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { clearAllDrafts } from "@/lib/drafts";
import { invalidate } from "@/lib/use-async";
import { Logo } from "@/components/Logo";

/**
 * Blocks a deactivated account from using the app.
 *
 * Deliberately a plain screen with a way out rather than a silent failure:
 * someone whose access ended should be told, not left tapping buttons that
 * quietly do nothing. Their data is untouched — deactivation is reversible,
 * which is the whole difference between it and deletion.
 *
 * This is the courtesy, not the control. The real enforcement is that the
 * Worker refuses their requests, so a deactivated account can't run up AI
 * spend whatever the browser does.
 */
export function SuspendedGate({ userId, children }: { userId: string; children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ok" | "blocked">("checking");

  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error } = await createClient()
        .from("profiles").select("suspended_at").eq("id", userId).maybeSingle();
      if (!live) return;
      // Fail OPEN on an error. A network blip must not lock a paying customer
      // out of training they've paid for; the Worker still refuses spend.
      if (error) return setState("ok");
      setState(data?.suspended_at ? "blocked" : "ok");
    })();
    return () => { live = false; };
  }, [userId]);

  async function signOut() {
    clearAllDrafts(userId);
    invalidate();
    await createClient().auth.signOut();
    router.replace("/login");
  }

  if (state === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-pitch-400" />
      </div>
    );
  }

  if (state === "blocked") {
    return (
      <main className="flex min-h-screen items-center justify-center px-5">
        <div className="w-full max-w-sm text-center">
          <Logo size={56} className="mx-auto mb-5" />
          <h1 className="text-2xl font-extrabold tracking-tight">Your access has ended</h1>
          <p className="mt-3 text-sm text-slate-400">
            This account has been deactivated. Your training history is safe and nothing has been
            deleted — if you think this is a mistake, reply to any email from us and we&apos;ll
            sort it out.
          </p>
          <a
            href="mailto:info@pocketathlete.com?subject=Account%20access"
            className="btn-primary mx-auto mt-6 max-w-[16rem]"
          >
            Get in touch
          </a>
          <button onClick={signOut} className="tap-target mt-3 text-sm text-slate-400 hover:text-pitch-400">
            Sign out
          </button>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
