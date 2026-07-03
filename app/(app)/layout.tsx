"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, UserProvider } from "@/lib/auth";
import { TabBar } from "@/components/TabBar";

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
      <div className="mx-auto flex min-h-screen max-w-md flex-col">
        <main className="no-scrollbar flex-1 px-5 pb-28 pt-8">{children}</main>
        <TabBar />
      </div>
    </UserProvider>
  );
}
