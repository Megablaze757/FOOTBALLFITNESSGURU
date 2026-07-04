import { createClient } from "@/lib/supabase/client";

/**
 * Calls a backend function. Prefers the Cloudflare Worker (NEXT_PUBLIC_API_URL)
 * when configured, otherwise the Supabase Edge Function of the same name. Sends
 * the user's session token so the server can authorise. Throws on failure — the
 * caller decides whether to fall back to the local engine.
 */
export async function invokeAI<T = unknown>(fn: string, body: unknown): Promise<T> {
  const supabase = createClient();
  const base = process.env.NEXT_PUBLIC_API_URL;
  const { data: { session } } = await supabase.auth.getSession();

  if (base) {
    const res = await fetch(`${base.replace(/\/$/, "")}/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`api ${res.status}`);
    return (await res.json()) as T;
  }

  const { data, error } = await supabase.functions.invoke(fn, { body: body as Record<string, unknown> });
  if (error) throw error;
  return data as T;
}
