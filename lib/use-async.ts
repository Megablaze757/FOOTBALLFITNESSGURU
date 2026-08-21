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

/**
 * Everything currently on screen that reads cached data.
 *
 * THE HALF THAT WAS MISSING. `invalidate` cleared the cache and stopped, so a
 * screen that was already mounted never learned anything had changed — it kept
 * painting the numbers it loaded on mount until something remounted it. That is
 * the whole of "my stats don't change when I adjust the data": the write landed,
 * the cache was dropped, and the panel in front of the athlete carried on
 * showing the figure from before the write.
 *
 * Clearing a cache is not a refresh. Telling the readers is.
 */
type Revalidator = (prefix?: string) => void;
const readers = new Set<Revalidator>();

/**
 * Drop cached entries after a mutation, and refresh anything showing them.
 *
 * Pass a prefix to clear one family of keys ("profile:"), or nothing to clear
 * everything. Prefer `recordChanged` in lib/data-events.ts, which names the
 * change rather than asking each call site to work out which prefixes it
 * touches — that guesswork is why several writes cleared nothing at all.
 */
export function invalidate(prefix?: string) {
  if (!prefix) {
    cache.clear();
    clearStored();
  } else {
    for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
    clearStored(prefix);
  }
  for (const reader of readers) {
    // One broken listener must not stop the rest of the screen updating.
    try { reader(prefix); } catch { /* ignore */ }
  }
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

// --- Making a failed load visible -------------------------------------------
//
// Every caller gets an `error` back. Two of twenty-seven ever looked at it.
//
// The rest render `data ?? []`, so a rejected query — RLS, a missing migration,
// a dead connection — comes out as an empty list and the screen says "no
// training logged yet" to someone with a year of history. That reads as the app
// losing their data, and it's indistinguishable from the honest empty state.
//
// Rather than ask twenty-five call sites to remember, the hook reports failures
// on a channel that one banner renders. New pages get it for free, and a page
// that wants bespoke handling still has its own `error` (see Leaderboards).
type LoadErrorListener = (info: { key?: string; error: Error }) => void;
const loadErrorListeners = new Set<LoadErrorListener>();

export function onLoadError(fn: LoadErrorListener): () => void {
  loadErrorListeners.add(fn);
  return () => { loadErrorListeners.delete(fn); };
}

function reportLoadError(error: Error, key?: string): void {
  // Always log: whoever is reading a console during a bug report should see the
  // real reason, not just the banner.
  console.error(`[load] ${key ?? "unkeyed"} failed:`, error.message);
  for (const fn of loadErrorListeners) {
    try { fn({ key, error }); } catch { /* a broken listener must not break loading */ }
  }
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
  /**
   * A refresh is running over data that is already on screen.
   *
   * Separate from `loading`, which means "there is nothing to paint yet". The
   * difference matters: this page blanking to a skeleton on every save is a bug
   * this codebase has already fixed once (see mutate below), and answering "the
   * numbers must update after a change" by throwing the screen away would
   * reintroduce it. Callers can show a quiet "updating…" and keep the figures.
   */
  const [revalidating, setRevalidating] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  // What `data` holds right now, readable outside a render. mutate() needs it so
  // two taps in the same tick both build on the first, and the loader below
  // needs it to tell whether a local write beat it home.
  const dataRef = useRef<T | null>(data);
  dataRef.current = data;
  const writes = useRef(0);

  useEffect(() => {
    let active = true;
    const writesAtStart = writes.current;
    const seeded = cacheKey ? readCache(cacheKey) : undefined;
    // Only show the spinner when we have nothing to paint yet.
    if (seeded !== undefined) setData(seeded as T);
    else setLoading(true);

    setError(null);
    fnRef.current()
      .then((d) => {
        if (!active) return;
        setLoading(false);
        setRevalidating(false);
        /**
         * A LOCAL WRITE THAT LANDED WHILE THIS WAS IN FLIGHT IS NEWER THAN THIS.
         *
         * Stale-while-revalidate means a cached page is interactive before its
         * background fetch returns, so someone can log a glass of water at the
         * exact moment a read that started BEFORE the write comes back. Applying
         * it would put the row back as it was and undo what they just did on
         * screen — the same class of bug as the reset this all replaced, just
         * with a narrower window.
         *
         * The read is discarded rather than merged: it cannot contain anything
         * newer than what is already on screen, since it started earlier.
         */
        if (writes.current !== writesAtStart) return;
        if (cacheKey) { cache.set(cacheKey, d); writeStored(cacheKey, d); }
        setData(d);
      })
      // A swallowed error looked exactly like "there's no data" — an empty
      // table where the real answer was "the query was rejected". Surface it
      // so callers can say which happened.
      .catch((e: unknown) => {
        if (!active) return;
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        setLoading(false);
        setRevalidating(false);
        reportLoadError(err, cacheKey);
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  /**
   * Refetch when something this page reads has changed underneath it.
   *
   * Only for keyed loaders: an unkeyed one has no identity, so there is no way
   * to know whether a given change concerns it, and refetching all of them on
   * every write would be a stampede.
   */
  useEffect(() => {
    if (!cacheKey) return;
    const onInvalidate = (prefix?: string) => {
      if (prefix && !cacheKey.startsWith(prefix)) return;
      setRevalidating(true);
      setTick((t) => t + 1);
    };
    readers.add(onInvalidate);
    return () => { readers.delete(onInvalidate); };
  }, [cacheKey]);

  return {
    data,
    loading,
    /** A refresh is in flight over data that is already on screen. */
    revalidating,
    error,
    reload: () => {
      if (cacheKey) { cache.delete(cacheKey); clearStored(cacheKey); }
      setTick((t) => t + 1);
    },
    /**
     * Fold a write you have already made into the loaded data — no refetch, no
     * skeleton.
     *
     * WHY THIS EXISTS. reload() is the wrong tool after a save, and on the
     * nutrition page it was doing visible damage. It deletes the cache entry, so
     * the effect re-runs with nothing seeded, so `loading` goes back to true —
     * and the page returns its skeleton. Every tick of a meal and every tap of
     * +250ml therefore blanked the entire screen for as long as six Supabase
     * queries took, then rebuilt it. Reported as "the page refreshes when I add
     * calories and water", and that is precisely what it did.
     *
     * It was not only ugly. The remount threw away every piece of state that had
     * not been written yet — the quick-add calorie buttons only move React state,
     * so tapping +200 and then ticking a meal lost the 200.
     *
     * And the refetch was never needed: the caller just wrote the row, so it
     * already knows what the row now says. Patching it here keeps `data` and the
     * cache correct for a remount (which is what reload() was really protecting
     * against — the tabs are a ternary, so switching unmounts the tracker and
     * coming back re-reads this data) at the cost of no network at all.
     *
     * Use reload() when something else may have changed the row; use mutate()
     * when you are the one who changed it.
     */
    mutate: (update: (prev: T) => T) => {
      const prev = dataRef.current;
      if (prev === null) return; // nothing loaded to patch; the next read wins
      const next = update(prev);
      writes.current += 1;
      dataRef.current = next;
      setData(next);
      if (cacheKey) { cache.set(cacheKey, next); writeStored(cacheKey, next); }
    },
  };
}
