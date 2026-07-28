"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, UserProvider } from "@/lib/auth";
import { TabBar } from "@/components/TabBar";
import { SideNav } from "@/components/SideNav";
import { SuspendedGate } from "@/components/SuspendedGate";
import { LoadErrorBanner } from "@/components/LoadErrorBanner";

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
      <SuspendedGate userId={user.id}>
      <div className="flex min-h-screen">
        <SideNav />
        <div className="min-w-0 flex-1">
          <main className="no-scrollbar mx-auto w-full max-w-5xl px-5 pb-28 pt-8 lg:px-10 lg:pb-14 lg:pt-12">
            {children}
          </main>
        </div>
        <TabBar />
        {/* One place that tells the truth when a query fails, instead of
            twenty-five pages rendering an empty list as if it were an answer. */}
        <LoadErrorBanner />
      </div>
      </SuspendedGate>
    </UserProvider>
  );
}
