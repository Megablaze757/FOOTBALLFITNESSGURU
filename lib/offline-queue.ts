// =============================================================================
// Offline check-in queue.
//
// Gyms have no signal. Before this, a check-in in a basement failed with a
// network error and the athlete lost the entry — on a product whose whole
// premise is a daily streak, that's the worst possible moment to fail.
//
// A check-in is small, self-contained and idempotent (it upserts on
// user_id + check_in_date), which is exactly the shape that can be replayed
// later without any conflict resolution. So we keep it on the device and send
// it when the signal comes back.
//
// Storage is injected rather than reaching for localStorage directly, so this
// is testable without a DOM and degrades to a no-op queue in Safari private
// mode instead of throwing on write.
// =============================================================================

export interface QueuedCheckIn {
  kind: "check_in";
  /** The date the athlete was logging FOR, not when it sent. Replaying a
   *  Tuesday check-in on Thursday must still write to Tuesday. */
  date: string;
  userId: string;
  payload: Record<string, unknown>;
  training?: Record<string, unknown> | null;
  queuedAt: string;
}

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = "pa:offline-queue";
/** A queue that grows without bound is a bug, not a feature. Two weeks of
 *  check-ins is far more than any real offline stretch. */
const MAX = 14;

export function readQueue(store: Storage): QueuedCheckIn[] {
  try {
    const raw = store.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is QueuedCheckIn => !!x && x.kind === "check_in" && typeof x.date === "string");
  } catch {
    // Corrupt JSON must not brick check-ins forever. Losing a queued entry is
    // bad; refusing to ever save another one is worse.
    return [];
  }
}

function write(store: Storage, items: QueuedCheckIn[]): void {
  try {
    store.setItem(KEY, JSON.stringify(items.slice(-MAX)));
  } catch {
    // Quota or private mode. Nothing useful to do — the caller already told the
    // athlete their entry is waiting to sync, and lying is better than crashing
    // the form they just filled in.
  }
}

/**
 * Queue a check-in for later.
 *
 * Same-day entries replace rather than stack: someone who edits their soreness
 * three times while offline should sync once, with the last answer — which is
 * also what the upsert would have done had they been online.
 */
export function enqueue(store: Storage, item: QueuedCheckIn): QueuedCheckIn[] {
  const rest = readQueue(store).filter((q) => !(q.date === item.date && q.userId === item.userId));
  const next = [...rest, item];
  write(store, next);
  return next;
}

export function removeFromQueue(store: Storage, date: string, userId: string): QueuedCheckIn[] {
  const next = readQueue(store).filter((q) => !(q.date === date && q.userId === userId));
  write(store, next);
  return next;
}

export function clearQueue(store: Storage): void {
  write(store, []);
}

export function queueCount(store: Storage): number {
  return readQueue(store).length;
}

/**
 * Replay everything queued, oldest first.
 *
 * `send` returns true when the row is safely stored. Anything that fails stays
 * queued for the next attempt — a half-synced queue is fine, a dropped entry is
 * not. Returns how many made it.
 */
export async function flushQueue(
  store: Storage,
  send: (item: QueuedCheckIn) => Promise<boolean>,
): Promise<{ sent: number; remaining: number }> {
  const items = readQueue(store);
  let sent = 0;
  for (const item of items) {
    let ok = false;
    try {
      ok = await send(item);
    } catch {
      ok = false;
    }
    if (ok) {
      removeFromQueue(store, item.date, item.userId);
      sent++;
    }
    // Deliberately keep going on failure. One bad row (a since-deleted account,
    // say) must not block every entry behind it forever.
  }
  return { sent, remaining: queueCount(store) };
}

/** localStorage when there is one, an in-memory stand-in when there isn't. */
export function browserStore(): Storage {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      // Safari private mode has localStorage but throws on write. Find out here
      // rather than at the moment someone's check-in needs saving.
      window.localStorage.setItem("pa:probe", "1");
      window.localStorage.removeItem("pa:probe");
      return window.localStorage;
    } catch { /* fall through */ }
  }
  const mem = new Map<string, string>();
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => { mem.set(k, v); },
  };
}
