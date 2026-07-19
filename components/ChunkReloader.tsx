"use client";

import { useEffect } from "react";

// Static exports hash every route chunk. When we deploy, the filenames change
// and GitHub Pages briefly 503s while the new deployment swaps in — so a tab
// that's open across a deploy asks for chunks it can no longer fetch. React
// then can't hydrate that route: links look dead and the page feels broken.
//
// A single hard reload pulls the fresh HTML and fixes it. Guarded with
// sessionStorage so a genuinely missing chunk can't cause a reload loop.
const KEY = "guru_chunk_reload";

function isChunkError(msg: unknown): boolean {
  const s = String(msg ?? "");
  return s.includes("ChunkLoadError") || s.includes("Loading chunk") || s.includes("Loading CSS chunk");
}

export function ChunkReloader() {
  useEffect(() => {
    // A successful load means we're on a good build — clear the guard so a
    // future deploy is allowed its own recovery reload.
    const clear = setTimeout(() => sessionStorage.removeItem(KEY), 5_000);

    function recover() {
      if (sessionStorage.getItem(KEY)) return; // already tried; don't loop
      sessionStorage.setItem(KEY, "1");
      window.location.reload();
    }

    function onError(e: ErrorEvent) {
      if (isChunkError(e.message) || isChunkError((e.error as Error | undefined)?.name)) recover();
    }
    function onRejection(e: PromiseRejectionEvent) {
      const r = e.reason as { name?: string; message?: string } | undefined;
      if (isChunkError(r?.name) || isChunkError(r?.message)) recover();
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      clearTimeout(clear);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
