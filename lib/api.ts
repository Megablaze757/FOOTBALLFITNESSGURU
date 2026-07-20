import { createClient } from "@/lib/supabase/client";

// How long to wait on the backend before giving up. A Worker cold-start plus an
// LLM call can legitimately take 10-15s; past this the caller is better served
// by the instant local engine than by a spinner that never resolves.
const AI_TIMEOUT_MS = 18_000;

/**
 * Calls a backend function. Prefers the Cloudflare Worker (NEXT_PUBLIC_API_URL)
 * when configured, otherwise the Supabase Edge Function of the same name. Sends
 * the user's session token so the server can authorise. Throws on failure OR
 * timeout — the caller decides whether to fall back to the local engine.
 */
export async function invokeAI<T = unknown>(fn: string, body: unknown): Promise<T> {
  const supabase = createClient();
  const base = process.env.NEXT_PUBLIC_API_URL;
  const { data: { session } } = await supabase.auth.getSession();

  if (base) {
    // Without this, a hung or cold-starting Worker leaves fetch pending forever,
    // so the caller's try/catch never runs and the UI sticks on its spinner.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
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
        throw new Error(msg);
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
