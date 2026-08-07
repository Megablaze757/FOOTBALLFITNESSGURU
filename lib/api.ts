import { createClient } from "@/lib/supabase/client";

// How long to wait on the backend before giving up. A Worker cold-start plus an
// LLM call can legitimately take 10-15s; past this the caller is better served
// by the instant local engine than by a spinner that never resolves.
// Was 18s, which was less than a long generation takes — so the browser gave up
// on requests the Worker would have completed. Raised to sit just outside the
// Worker's own 55s chain budget, so the server's error (which says WHICH model
// failed and why) arrives instead of the client's silent abort.
//
// Long enough only because these calls run in the background now — see
// lib/jobs.tsx. Nobody is watching a spinner for a minute.
const AI_TIMEOUT_MS = 60_000;

/**
 * Calls a backend function. Prefers the Cloudflare Worker (NEXT_PUBLIC_API_URL)
 * when configured, otherwise the Supabase Edge Function of the same name. Sends
 * the user's session token so the server can authorise. Throws on failure OR
 * timeout — the caller decides whether to fall back to the local engine.
 */
export async function invokeAI<T = unknown>(fn: string, body: unknown, timeoutMs = AI_TIMEOUT_MS): Promise<T> {
  const supabase = createClient();
  const base = process.env.NEXT_PUBLIC_API_URL;
  const { data: { session } } = await supabase.auth.getSession();

  if (base) {
    // Without this, a hung or cold-starting Worker leaves fetch pending forever,
    // so the caller's try/catch never runs and the UI sticks on its spinner.
    // Account deletion passes a longer budget: it talks to Stripe and storage
    // before it finishes, and giving up early leaves the caller unsure whether
    // it happened.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/${fn}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        let msg = `api ${res.status}`;
        try {
          const errBody = (await res.json()) as { error?: string };
          if (errBody?.error) msg = errBody.error;
        } catch { /* non-JSON body */ }
        // A 404 from this API means the ROUTE IS NOT DEPLOYED, not that some
        // record is missing: the only 404 the Worker produces is its route-table
        // fallthrough, which answers a bare `{"error":"not found"}`. Surfaced
        // raw, that reached athletes as the words "not found" sitting under a
        // button, which reads as the app being broken in an unknowable way —
        // and it happened for real, because the deployed bundle is missing the
        // three wearable routes while every other route answers 401.
        //
        // Naming the function makes it diagnosable in a screenshot, which is
        // how these get reported.
        if (res.status === 404) {
          msg = `This feature isn't switched on yet on the server (${fn}).`;
        }
        // Carry the status. Callers fall back to the local engine when the
        // backend is unreachable, and they must be able to tell that apart
        // from the backend REFUSING them — a 402 means "this needs Pro", and
        // falling back there would quietly hand a free user the paid feature.
        throw Object.assign(new Error(msg), { status: res.status });
      }
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        throw new Error("ai timed out");
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  const { data, error } = await supabase.functions.invoke(fn, { body: body as Record<string, unknown> });
  if (error) throw error;
  return data as T;
}

/**
 * What the deployed backend can actually do.
 *
 * WHY THIS EXISTS. The photo estimator sends an image to `/estimate-food` and,
 * when nothing comes back, tells the athlete "I couldn't identify any food in
 * that photo." That sentence blames the photo. In production it has been wrong:
 * the deployed Worker's model chain is `groq/openai/gpt-oss-120b`, which is
 * text-only, and its `/health` reports no `vision` field at all — so the image
 * was never looked at by anything that could see it. No photo would have
 * worked, and the app kept inviting people to try another one.
 *
 * The Worker in production is built from source that is not in this repository,
 * so its capabilities cannot be known at build time. They can be ASKED FOR at
 * runtime: `/health` is unauthenticated, cheap, and already reports the model
 * chain. Asking once per session and remembering the answer is the difference
 * between a feature that fails honestly and one that gaslights.
 */
export interface BackendCapabilities {
  /** `/health` answered. False means offline, or no Worker configured. */
  reachable: boolean;
  /** The backend advertises a vision model, so photos can be read. */
  vision: boolean;
  version?: string;
}

let capabilityProbe: Promise<BackendCapabilities> | null = null;

export function backendCapabilities(): Promise<BackendCapabilities> {
  // Cached as the PROMISE, not the result, so ten components mounting at once
  // make one request rather than ten.
  if (capabilityProbe) return capabilityProbe;

  capabilityProbe = (async (): Promise<BackendCapabilities> => {
    const base = process.env.NEXT_PUBLIC_API_URL;
    // No Worker means the Supabase Edge Functions handle this, and those have
    // their own vision path — assume capable rather than disabling a feature
    // that may well work.
    if (!base) return { reachable: false, vision: true };

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6_000);
      const res = await fetch(`${base.replace(/\/$/, "")}/health`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return { reachable: false, vision: true };
      const body = (await res.json()) as { vision?: string; version?: string };
      return {
        reachable: true,
        // Absent OR empty both mean no vision model configured.
        vision: !!body.vision,
        version: body.version,
      };
    } catch {
      // A failed probe must never disable a working feature. Unknown is treated
      // as capable, and the estimate itself will report any real failure.
      return { reachable: false, vision: true };
    }
  })();

  return capabilityProbe;
}

/** Testing seam — the probe is cached for the life of the tab. */
export function resetBackendCapabilities(): void {
  capabilityProbe = null;
}
