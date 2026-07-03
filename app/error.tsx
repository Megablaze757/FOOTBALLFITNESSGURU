"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface for debugging; in production this could report to an error service.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="card w-full max-w-sm p-8 text-center">
        <div className="text-4xl">😵‍💫</div>
        <h1 className="mt-3 text-lg font-extrabold">Something went wrong</h1>
        <p className="mt-1 text-sm text-slate-400">That&apos;s on us. Try again, or head home.</p>
        <div className="mt-6 space-y-2">
          <button onClick={reset} className="btn-primary">Try again</button>
          <Link href="/home" className="btn-ghost">Go home</Link>
        </div>
      </div>
    </main>
  );
}
