import { createClient } from "@/lib/supabase/client";

/**
 * Call the Worker as the signed-in admin.
 *
 * Extracted from components/admin/EmailOps.tsx, which had the only copy until
 * the Users panel needed one too. Two copies of an auth header is how one of
 * them ends up not sending it.
 *
 * The token is the caller's own, deliberately: every admin endpoint on the
 * Worker reads the role from `profiles` with the service key and decides for
 * itself. Nothing here is a permission check — this is a fetch with a header.
 */
export interface WorkerResult {
  ok: boolean;
  data: Record<string, unknown>;
}

export async function callWorker(path: string, body?: unknown): Promise<WorkerResult> {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) return { ok: false, data: { error: "NEXT_PUBLIC_API_URL is not set on this build." } };

  const { data: { session } } = await createClient().auth.getSession();
  const res = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

/** Whatever the Worker said went wrong, or a fallback that names the status. */
export function workerError(result: WorkerResult, fallback: string): string {
  const said = result.data.error;
  return typeof said === "string" && said ? said : fallback;
}
