"use client";

import { useEffect, useRef, useState } from "react";

// Module-level cache shared across the SPA. Without it, every navigation reran
// each page's loader from scratch and flashed a skeleton — even returning to a
// page you were just on. Keyed by an opaque string the caller provides.
const cache = new Map<string, unknown>();

// --- Surviving a reload ------------------------------------------------------
//
// The map above dies with the tab, so closing the app and coming back meant
// skeletons on every screen again — which on a phone, where the browser evicts
// backgrounded tabs aggressively, is most of the time.
//
// sessionStorage, not localStorage, on purpose: this is a copy of someone's
// training data, and it should not outlive the browsing session on a shared
// device. It's a rendering shortcut, never the source of truth — every read
// still revalidates against the database in the background.
const STORE_PREFIX = "pa:cache:";
const STORE_MAX_AGE_MS = 10 * 60 * 1000; // beyond this, wait for fresh data

interface StoredEntry { at: number; v: unknown }

function readStored(key: string): unknown {
  try {
    const raw = sessionStorage.getItem(STORE_PREFIX + key);
    if (!raw) return undefined;
    const e = JSON.parse(raw) as StoredEntry;
    if (typeof e?.at !== "number" || Date.now() - e.at > STORE_MAX_AGE_MS) {
      sessionStorage.removeItem(STORE_PREFIX + key);
      return undefined;
    }
    return e.v;
  } catch {
    return undefined;
  }
}

function writeStored(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(STORE_PREFIX + key, JSON.stringify({ at: Date.now(), v: value }));
  } catch {
    // Quota, private mode, or a value with a cycle in it. The in-memory cache
    // still works; this is only the part that survives a reload.
  }
}

/** In-memory first, then the session copy. */
function readCache(key: string): unknown {
  if (cache.has(key)) return cache.get(key);
  const stored = readStored(key);
  if (stored !== undefined) cache.set(key, stored);
  return stored;
}

/** Drop cached entries after a mutation so the next read is fresh. Pass a
 *  prefix to clear a family of keys (e.g. "profile:") or nothing to clear all. */
export function invalidate(prefix?: string) {
  if (!prefix) {
    cache.clear();
    clearStored();
    return;
  }
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
  clearStored(prefix);
}

function clearStored(prefix?: string): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k || !k.startsWith(STORE_PREFIX)) continue;
      if (prefix && !k.slice(STORE_PREFIX.length).startsWith(prefix)) continue;
      doomed.push(k);
    }
    for (const k of doomed) sessionStorage.removeItem(k);
  } catch { /* nothing to do */ }
}

// Minimal client data hook for the static SPA: runs an async loader, exposes
// data + loading, and a reload() to refetch after mutations.
//
// With a `cacheKey`, it behaves stale-while-revalidate: cached data shows
// immediately (no loading state) while a fresh fetch runs in the background, so
// repeat visits feel instant. Without one, it's a plain fetch-on-mount.
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = [], cacheKey?: string) {
  const cached = cacheKey ? (readCache(cacheKey) as T | undefined) : undefined;
  const [data, setData] = useState<T | null>(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let active = true;
    const seeded = cacheKey ? readCache(cacheKey) : undefined;
    // Only show the spinner when we have nothing to paint yet.
    if (seeded !== undefined) setData(seeded as T);
    else setLoading(true);

    setError(null);
    fnRef.current()
      .then((d) => {
        if (!active) return;
        if (cacheKey) { cache.set(cacheKey, d); writeStored(cacheKey, d); }
        setData(d);
        setLoading(false);
      })
      // A swallowed error looked exactly like "there's no data" — an empty
      // table where the real answer was "the query was rejected". Surface it
      // so callers can say which happened.
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return {
    data,
    loading,
    error,
    reload: () => {
      if (cacheKey) { cache.delete(cacheKey); clearStored(cacheKey); }
      setTick((t) => t + 1);
    },
  };
}
