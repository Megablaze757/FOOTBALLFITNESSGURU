import { createClient } from "@/lib/supabase/client";

// How long to wait on the backend before giving up. A Worker cold-start plus an
// LLM call can legitimately take 10-15s; past this the caller is better served
// by the instant local engine than by a spinner that never resolves.
// Was 18s, which was less than a long generation takes — so the browser gave up
// on requests the Worker would have completed. Raised to sit just outside the
// Worker's own 55s chain budget, so the server's error (which says WHICH model
// failed and why) arrives instead of the client's silent abort.
//
// This is the ceiling for long-form AI work. Latency-sensitive features pass a
// smaller route-specific timeout: program generation, for example, has a fast
// local engine waiting behind the model and should never make an athlete watch
// a minute-long spinner just to get to it.
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

  // `timeoutMs` used to protect only the Worker path. When the app was pointed
  // directly at Supabase, the exact same call could wait forever and a caller's
  // local fallback was therefore unreachable. Promise.race cannot cancel the
  // Edge invocation, but it does release the UI at the promised deadline; the
  // late response is ignored.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const request = supabase.functions.invoke(fn, { body: body as Record<string, unknown> });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("ai timed out")), timeoutMs);
    });
    const { data, error } = await Promise.race([request, timeout]);
    if (error) throw error;
    return data as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
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
  /**
   * SOMETHING can read a photo — the Worker, or the Edge Function standing in
   * for it. Deliberately the combined answer rather than the Worker's alone,
   * because the UI uses this to decide whether to offer the camera at all, and
   * hiding a feature that would have worked is the worse of the two mistakes.
   */
  vision: boolean;
  /** Which of the two will actually take the photo. Diagnostics, mostly. */
  visionVia?: "worker" | "edge";
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
      // Absent OR empty both mean no vision model configured.
      if (body.vision) return { reachable: true, vision: true, visionVia: "worker", version: body.version };

      // The Worker can't see. That is the state production has actually been
      // in — an eight-model chain without one vision model in it. Before
      // reporting the camera as unavailable, ask whether the Edge Function
      // standing in for it is deployed.
      return { reachable: true, vision: await edgeVisionDeployed(), visionVia: "edge", version: body.version };
    } catch {
      // A failed probe must never disable a working feature. Unknown is treated
      // as capable, and the estimate itself will report any real failure.
      return { reachable: false, vision: true };
    }
  })();

  return capabilityProbe;
}

/**
 * Is the `estimate-food` Edge Function deployed?
 *
 * OPTIONS, not POST: it's the CORS preflight every Edge Function answers, it
 * needs no auth, it costs nothing and it invokes no model. A deployed function
 * answers 2xx; an undeployed one 404s.
 *
 * Any doubt resolves to TRUE. A probe that fails for a network reason must not
 * be what takes the camera away — the estimate itself reports a real failure
 * with a real message, and that is the honest place for it.
 */
async function edgeVisionDeployed(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5_000);
    const res = await fetch(`${url.replace(/\/$/, "")}/functions/v1/estimate-food`, {
      method: "OPTIONS",
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return res.status !== 404;
  } catch {
    return true;
  }
}

/** Testing seam — the probe is cached for the life of the tab. */
export function resetBackendCapabilities(): void {
  capabilityProbe = null;
}

/**
 * Calls a Supabase Edge Function directly, bypassing the Worker.
 *
 * `invokeAI` prefers the Worker whenever NEXT_PUBLIC_API_URL is set and only
 * falls back here when it isn't — which is right for every route except one.
 * The photo estimator needs the OPPOSITE preference when the Worker cannot see.
 */
async function invokeEdge<T>(fn: string, body: unknown): Promise<T> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke(fn, { body: body as Record<string, unknown> });
  if (error) {
    /**
     * CARRY THE STATUS, BECAUSE THE MESSAGE DOES NOT.
     *
     * supabase-js reports every failed call as the same sentence — "Edge
     * Function returned a non-2xx status code" — with the real Response tucked
     * away on `.context`. So a 404 from an undeployed function is indisplayable
     * from a 500, and callers matching on the text (which `estimateFood` did)
     * silently never matched at all: athletes got that sentence verbatim under
     * a button instead of the message written for them.
     */
    const status = (error as { context?: { status?: number } })?.context?.status;
    if (status) Object.assign(error, { status });
    throw error;
  }
  return data as T;
}

/**
 * Estimate a meal, from a photo or a description, on a backend that can do it.
 *
 * WHY THIS ISN'T JUST `invokeAI("estimate-food", …)`. It was, and for photos it
 * could not work. The Worker running in production is built from source that is
 * not in this repository and its model chain is eight text-only models —
 * `/health` reports no `vision` field at all. Every photo went to something
 * incapable of looking at it, came back with nothing, and the app said "I
 * couldn't identify any food in that photo", which blames the athlete's
 * photography for a deployment problem and invites a retry that cannot succeed.
 *
 * So the route is chosen from what the backend SAYS it can do:
 *
 *   - Worker advertises vision  -> Worker, as before.
 *   - Worker can't see, or is unreachable, and we're sending a photo
 *                               -> the Supabase Edge Function of the same name,
 *                                  which is in version control and deploys with
 *                                  one command.
 *   - Text-only estimate        -> Worker. Every model it runs handles text, and
 *                                  it has the tier gate and the spend budget.
 *
 * The effect is that photos start working the moment `supabase functions deploy
 * estimate-food` runs, and go back to the Worker on their own the day the
 * Worker can see again. Nothing to switch over, and no flag to forget.
 */
export async function estimateFood<T = unknown>(body: { text?: string; image?: string }): Promise<T> {
  const wantsVision = typeof body.image === "string" && body.image.length > 0;
  if (!wantsVision) return invokeAI<T>("estimate-food", body);

  const caps = await backendCapabilities();
  if (caps.vision) return invokeAI<T>("estimate-food", body);

  try {
    return await invokeEdge<T>("estimate-food", body);
  } catch (e) {
    // Status first — see invokeEdge for why the message alone cannot be trusted.
    const status = (e as { status?: number })?.status;
    const msg = e instanceof Error ? e.message : String(e);
    if (status !== 404 && !/404|not found/i.test(msg)) throw e;

    /**
     * NO BACKEND CAN SEE — SO USE THE WORDS INSTEAD OF GIVING UP.
     *
     * Both vision routes are gone at this point: the Worker's chain is eight
     * text-only models and reports no `vision` at all, and the Edge Function
     * that would cover it isn't deployed. The honest previous behaviour was to
     * say so and stop.
     *
     * But the athlete has usually typed something alongside the photo — "with
     * olive oil", "large chicken salad" — and the TEXT estimate works perfectly
     * well on the Worker today. Refusing to run it because the picture couldn't
     * be read is throwing away a working answer over a broken one. A described
     * meal beats no meal, and it beats making them retype it into a different
     * box after an error.
     *
     * Three characters, matching `askAi` in MealCheckIn: below that there's
     * nothing to estimate from and a guess would be invented rather than
     * derived.
     */
    const described = body.text?.trim() ?? "";
    if (described.length >= 3) return invokeAI<T>("estimate-food", { text: described });

    // Nothing to fall back on. Ask for the one thing that would make it work
    // rather than reporting a 404 from a URL the athlete has never heard of —
    // this message ends up under a button on someone's phone.
    throw new Error(
      "I can't read photos yet — the server feature isn't switched on (estimate-food). " +
      "Describe the meal instead and I'll work it out from that."
    );
  }
}
