"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, UserProvider } from "@/lib/auth";
import { TabBar } from "@/components/TabBar";
import { SideNav } from "@/components/SideNav";
import { SuspendedGate } from "@/components/SuspendedGate";
import { LoadErrorBanner } from "@/components/LoadErrorBanner";
import { JobsProvider } from "@/lib/jobs";
import { JobTray } from "@/components/JobTray";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-pitch-400" />
      </div>
    );
  }

  return (
    <UserProvider user={user}>
      {/* Above the router outlet on purpose: work started inside a page has to
          outlive that page being navigated away from. */}
      <JobsProvider>
      <SuspendedGate userId={user.id}>
      <div className="flex min-h-screen">
        <SideNav />
        <div className="min-w-0 flex-1">
          {/* overflow-x:clip, not hidden. Both stop the page sliding sideways
              when one child overflows, but `hidden` makes this a scroll
              container — which breaks `position: sticky` inside it and lets a
              stray wide element be scrolled to. `clip` just refuses to show it.
              This is the backstop; the individual overflows are still worth
              fixing, but no single card should be able to make the whole app
              slide left and right on a phone. */}
          <main className="no-scrollbar mx-auto w-full max-w-5xl px-5 pb-28 pt-8 [overflow-x:clip] lg:px-10 lg:pb-14 lg:pt-12">
            {children}
          </main>
        </div>
        <TabBar />
        {/* One place that tells the truth when a query fails, instead of
            twenty-five pages rendering an empty list as if it were an answer. */}
        <LoadErrorBanner />
        <JobTray />
      </div>
      </SuspendedGate>
      </JobsProvider>
    </UserProvider>
  );
}
