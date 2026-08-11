// =============================================================================
// Who is calling, and are they allowed to.
//
// WHY THIS EXISTS, AND WHY IT IS URGENT.
//
// The paid AI features were gated in ONE place: the Cloudflare Worker, via
// `requireTier(..., "silver", ...)` on five routes. The Supabase Edge Functions
// that answer the same requests had no tier check at all — they were only ever
// the fallback, and the fallback inherited none of the paywall.
//
// The moment NEXT_PUBLIC_API_URL is unset, `invokeAI` stops calling the Worker
// and calls these instead (see lib/api.ts). Every paid feature then answers any
// account that asks: programs, the coach chat, meal estimation. The buttons are
// still hidden from free users in the UI, and the UI is not a permission check —
// anyone can POST to the function URL directly with their own token.
//
// The client already assumes this gate exists. lib/api.ts:
//
//     a 402 means "this needs Pro", and falling back there would quietly hand
//     a free user the paid feature
//
// That comment describes a status code that, without this file, nothing emits.
//
// SEMANTICS ARE THE WORKER'S, DELIBERATELY. Same 402 with `upgrade` and `tier`,
// same 403 for a suspended account, same fail-open on a lookup blip and
// fail-closed on an unknown tier. Two enforcement points that disagree are
// worse than one, because whichever is laxer is the real policy.
// =============================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const TIER_ORDER = ["bronze", "silver", "gold"] as const;
export type Tier = (typeof TIER_ORDER)[number];

function meetsTier(have: string, need: string): boolean {
  const h = TIER_ORDER.indexOf(have as Tier);
  const n = TIER_ORDER.indexOf(need as Tier);
  return (h < 0 ? 0 : h) >= (n < 0 ? 0 : n);
}

/**
 * A service-role query. Needed because the caller's own JWT cannot read the
 * subscriptions row of anyone — including, under RLS, enough of their own to
 * be trusted for authorisation. Authorisation data must be read by something
 * the caller cannot influence.
 */
async function svc(path: string): Promise<Response | null> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
}

/** The caller's user id, verified against Supabase. Null when not signed in. */
export async function authUser(req: Request): Promise<{ id: string } | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return null;
  try {
    const res = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey: anon } });
    if (!res.ok) return null;
    const body = await res.json() as { id?: string };
    return body?.id ? { id: body.id } : null;
  } catch {
    return null;
  }
}

/** Their current tier. Anything unclear reads as `bronze` — the free one. */
export async function tierOf(userId: string): Promise<string> {
  try {
    const r = await svc(`subscriptions?user_id=eq.${userId}&select=tier,status`);
    if (!r?.ok) return "bronze";
    const rows = await r.json() as { tier?: string; status?: string }[];
    const row = rows?.[0];
    return row?.status === "active" && row.tier ? row.tier : "bronze";
  } catch {
    return "bronze";
  }
}

/**
 * Deactivated accounts get nothing.
 *
 * FAILS OPEN on a lookup error, matching the Worker: a transient blip must not
 * lock out somebody who is paying. The tier check below fails CLOSED instead,
 * because the cost of getting that one wrong is giving away a paid feature
 * rather than withholding one.
 */
async function isSuspended(userId: string): Promise<boolean> {
  try {
    const r = await svc(`profiles?id=eq.${userId}&select=suspended_at`);
    if (!r?.ok) return false;
    const rows = await r.json() as { suspended_at: string | null }[];
    return !!rows?.[0]?.suspended_at;
  } catch {
    return false;
  }
}

export interface Gate {
  /** Set when the request must not proceed — return it as-is. */
  denied?: Response;
  user?: { id: string };
  tier?: string;
}

/**
 * The one call every paid route makes before doing any work.
 *
 *     const gate = await requireTier(req, "silver", "Training programs");
 *     if (gate.denied) return gate.denied;
 *
 * Ordered so the cheapest and most decisive check runs first: no token at all
 * is a 401 and costs one round trip; only a real, signed-in, non-suspended
 * account ever reaches a model.
 */
export async function requireTier(
  req: Request,
  need: "silver" | "gold",
  feature: string,
): Promise<Gate> {
  const user = await authUser(req);
  if (!user) return { denied: json({ error: "unauthorized" }, 401) };

  if (await isSuspended(user.id)) {
    return { denied: json({ error: "This account has been deactivated.", suspended: true }, 403) };
  }

  const tier = await tierOf(user.id);
  if (!meetsTier(tier, need)) {
    // 402 rather than 403: this isn't "you may never", it's "this costs money",
    // and the client shows the upgrade prompt for exactly this status.
    return { denied: json({ error: `${feature} is part of Pro`, upgrade: need, tier }, 402), user, tier };
  }
  return { user, tier };
}

export function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

export { CORS };
