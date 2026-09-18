// =============================================================================
// READING THE DATABASE WITHOUT A DATABASE PASSWORD.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE ONE THING BLOCKING EVERYTHING ELSE IS A TERMINAL SESSION.
//
// HANDOVER.md's first item has been "run scripts/retention-report.mts" for as
// long as it has existed, because the only sample size this project has ever
// written down is migration 0045's "22 users, 0 paying" and every decision
// about what to build next rests on whether that is still true.
//
// It has not been run. The reason is not that anybody disagrees — it is that
// running it means finding a connection string, exporting two variables and
// running node, and the connection string is a DATABASE PASSWORD, which is the
// one credential this project has already leaked once and had to rotate.
//
// .github/workflows/apply-sql.yml solved the same problem a different way: the
// Management API takes a personal access token, the repository already holds
// one as SUPABASE_ACCESS_TOKEN, and it is not the database password and not
// the service_role key. The endpoint it posts to runs SQL and returns rows.
//
// So the report can run from the Actions tab with a secret that already
// exists, and "run it" stops being a terminal session and becomes a button.
//
// ───────────────────────────────────────────────────────────────────────────
// THE ANALYSIS STAYS IN TYPESCRIPT, WHICH IS THE WHOLE POINT.
//
// The tempting shortcut is to write the retention report as a .sql file and
// hand it to the workflow that already exists. That would put the windows, the
// eligibility rule and the denominator into SQL — a second implementation of
// rules that lib/retention.ts has tests for, which is the exact drift this
// repository has spent several commits removing. lib/win-back.ts and migration
// 0114 are allowed to disagree only because a test makes them agree.
//
// This fetches ROWS and nothing else. Every judgement about what the rows mean
// stays where it is tested.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

/** Where the Management API runs SQL for a project. */
export function queryUrl(ref: string): string {
  const clean = (ref ?? "").trim();
  if (!/^[a-z0-9]{8,}$/i.test(clean)) {
    throw new Error(`"${ref}" is not a project ref — it is the subdomain of the API URL`);
  }
  return `https://api.supabase.com/v1/projects/${clean}/database/query`;
}

/**
 * The body, built by the JSON serialiser rather than by hand.
 *
 * apply-sql.yml uses `jq -Rs '{query: .}'` for the same reason and says so:
 * "quoting, newlines and the email's emoji survive intact. Hand-rolled string
 * interpolation is how an apostrophe in the copy becomes a syntax error at
 * 3am." The retention queries contain a LIKE pattern with a backslash in it.
 */
export function queryBody(sql: string): string {
  return JSON.stringify({ query: sql });
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT COMES BACK, AND THE THREE SHAPES IT CAN TAKE.
 *
 * A successful SELECT returns a bare array of row objects. An error returns an
 * object with a message in it, and the HTTP status is not always the thing
 * that says so — a 200 carrying `{"error": ...}` has happened often enough
 * across Supabase's APIs that trusting the status alone is how a run reports
 * success over an empty result.
 *
 * An empty table returns `[]`, which is a legitimate answer and must not be
 * confused with a failure. "No accounts yet" is a finding.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function rowsFrom(payload: unknown, sql = ""): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];

  if (payload && typeof payload === "object") {
    const held = payload as Record<string, unknown>;
    // Some responses wrap the rows. Take them if they are there.
    for (const key of ["result", "data", "rows"]) {
      if (Array.isArray(held[key])) return held[key] as Record<string, unknown>[];
    }
    const message = held.message ?? held.error ?? held.msg;
    if (typeof message === "string") {
      throw new Error(`the database refused it: ${message}${sql ? `\n  query: ${first(sql)}` : ""}`);
    }
  }
  throw new Error(
    `could not read the response as rows (${typeof payload})`
    + (sql ? `\n  query: ${first(sql)}` : ""),
  );
}

const first = (sql: string) => (sql.trim().split("\n")[0] ?? "").slice(0, 80);

/** Whether this environment can use the Management API rather than a password. */
export function canUseManagementApi(env: Record<string, string | undefined>): boolean {
  return Boolean((env.SUPABASE_ACCESS_TOKEN ?? "").trim() && (env.SUPABASE_PROJECT_REF ?? "").trim());
}

export interface QueryOptions {
  ref: string;
  token: string;
  /** Injected so the request-building can be tested without a network. */
  fetchImpl?: typeof fetch;
}

/**
 * Run one statement and return its rows.
 *
 * THE TOKEN NEVER APPEARS IN AN ERROR. A failure here is printed in a CI log
 * that anybody with read access can see, and a helpful "Authorization: Bearer
 * ..." in a stack trace is how a credential ends up somewhere permanent.
 */
export async function runQuery(
  sql: string,
  { ref, token, fetchImpl = fetch }: QueryOptions,
): Promise<Record<string, unknown>[]> {
  const res = await fetchImpl(queryUrl(ref), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: queryBody(sql),
  });

  let payload: unknown;
  const text = await res.text();
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}, and the body was not JSON: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    // rowsFrom turns a well-formed refusal into a readable message; if it
    // cannot, the status is still worth saying.
    try {
      return rowsFrom(payload, sql);
    } catch (e) {
      throw new Error(`HTTP ${res.status}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return rowsFrom(payload, sql);
}
