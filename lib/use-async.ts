"use client";

import { useEffect, useRef, useState } from "react";

// Module-level cache shared across the SPA. Without it, every navigation reran
// each page's loader from scratch and flashed a skeleton — even returning to a
// page you were just on. Keyed by an opaque string the caller provides.
const cache = new Map<string, unknown>();

/** Drop cached entries after a mutation so the next read is fresh. Pass a
 *  prefix to clear a family of keys (e.g. "profile:") or nothing to clear all. */
export function invalidate(prefix?: string) {
  if (!prefix) return void cache.clear();
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}

// Minimal client data hook for the static SPA: runs an async loader, exposes
// data + loading, and a reload() to refetch after mutations.
//
// With a `cacheKey`, it behaves stale-while-revalidate: cached data shows
// immediately (no loading state) while a fresh fetch runs in the background, so
// repeat visits feel instant. Without one, it's a plain fetch-on-mount.
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = [], cacheKey?: string) {
  const cached = cacheKey ? (cache.get(cacheKey) as T | undefined) : undefined;
  const [data, setData] = useState<T | null>(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let active = true;
    const seeded = cacheKey ? cache.get(cacheKey) : undefined;
    // Only show the spinner when we have nothing to paint yet.
    if (seeded !== undefined) setData(seeded as T);
    else setLoading(true);

    fnRef.current()
      .then((d) => {
        if (!active) return;
        if (cacheKey) cache.set(cacheKey, d);
        setData(d);
        setLoading(false);
      })
      .catch(() => active && setLoading(false));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return {
    data,
    loading,
    reload: () => { if (cacheKey) cache.delete(cacheKey); setTick((t) => t + 1); },
  };
}
