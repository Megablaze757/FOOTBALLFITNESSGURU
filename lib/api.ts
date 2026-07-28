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
