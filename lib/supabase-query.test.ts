import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canUseManagementApi, queryBody, queryUrl, rowsFrom, runQuery,
} from "./supabase-query";

const REF = "txqhstackgidjqkkrzyj";

test("the url is built from a ref, not from a whole URL", () => {
  assert.equal(queryUrl(REF), `https://api.supabase.com/v1/projects/${REF}/database/query`);
  assert.equal(queryUrl(`  ${REF}  `), queryUrl(REF), "surrounding whitespace was not trimmed");
});

/**
 * A pasted value is far more often the whole API URL than the ref, and a URL
 * interpolated into a path produces a 404 that reads like the project is gone.
 */
test("something that is not a ref is refused with a sentence, not a 404", () => {
  assert.throws(() => queryUrl(`https://${REF}.supabase.co`), /is not a project ref/);
  assert.throws(() => queryUrl(""), /is not a project ref/);
  assert.throws(() => queryUrl("short"), /is not a project ref/);
});

/**
 * The retention queries contain a LIKE pattern with a backslash in it —
 * `m.key like '%\\_1rm'` — and apostrophes appear throughout. Building the
 * body by hand is how that becomes a syntax error in the database instead.
 */
test("the body survives backslashes, quotes and newlines", () => {
  const sql = "select 1\nwhere key like '%\\_1rm'\n-- it's fine";
  const parsed = JSON.parse(queryBody(sql)) as { query: string };
  assert.equal(parsed.query, sql, "the SQL did not survive being serialised");
});

// ═══════════════════════════════════════════════════════════════════════════
// READING THE ANSWER, INCLUDING WHEN THE ANSWER IS A REFUSAL.
// ═══════════════════════════════════════════════════════════════════════════

test("a bare array is the rows", () => {
  assert.deepEqual(rowsFrom([{ n: 1 }, { n: 2 }]), [{ n: 1 }, { n: 2 }]);
});

/** An empty table is a finding, not a failure. "No accounts yet" is an answer. */
test("no rows is an answer rather than an error", () => {
  assert.deepEqual(rowsFrom([]), []);
});

test("a wrapped array is unwrapped", () => {
  assert.deepEqual(rowsFrom({ result: [{ n: 1 }] }), [{ n: 1 }]);
  assert.deepEqual(rowsFrom({ data: [{ n: 2 }] }), [{ n: 2 }]);
  assert.deepEqual(rowsFrom({ rows: [{ n: 3 }] }), [{ n: 3 }]);
});

test("a refusal is raised with what the database said", () => {
  assert.throws(() => rowsFrom({ message: 'relation "nope" does not exist' }),
    /relation "nope" does not exist/);
  assert.throws(() => rowsFrom({ error: "permission denied" }), /permission denied/);
});

test("the failing query is named, so a six-query report says which one", () => {
  assert.throws(
    () => rowsFrom({ message: "boom" }, "select count(*) from public.profiles\nwhere x"),
    /select count\(\*\) from public\.profiles/,
  );
});

test("something unrecognisable says so rather than returning nothing", () => {
  assert.throws(() => rowsFrom(null), /could not read the response/);
  assert.throws(() => rowsFrom("ok"), /could not read the response/);
  assert.throws(() => rowsFrom(42), /could not read the response/);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE REQUEST, WITHOUT A NETWORK.
// ═══════════════════════════════════════════════════════════════════════════

function fakeFetch(status: number, body: unknown, seen: { req?: RequestInit; url?: string }) {
  return (async (url: string | URL | Request, req?: RequestInit) => {
    seen.url = String(url);
    seen.req = req;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    } as Response;
  }) as unknown as typeof fetch;
}

test("it posts the sql to the project's query endpoint with the token", async () => {
  const seen: { req?: RequestInit; url?: string } = {};
  const rows = await runQuery("select 1 as n", {
    ref: REF, token: "sbp_example", fetchImpl: fakeFetch(200, [{ n: 1 }], seen),
  });
  assert.deepEqual(rows, [{ n: 1 }]);
  assert.equal(seen.url, queryUrl(REF));
  assert.equal(seen.req?.method, "POST");
  const headers = seen.req?.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer sbp_example");
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(seen.req?.body, queryBody("select 1 as n"));
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE TOKEN MUST NOT REACH THE LOG.
 *
 * This runs in Actions, where the output is readable by anybody with access to
 * the repository, and a helpful "Authorization: Bearer ..." in a stack trace is
 * how a credential ends up somewhere permanent. Actions masks registered
 * secrets, and a check that relies on masking is a check that fails the first
 * time somebody runs the script by hand.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a failure never quotes the token", async () => {
  const seen: { req?: RequestInit; url?: string } = {};
  const token = "sbp_thisisthesecret";
  await assert.rejects(
    runQuery("select 1", { ref: REF, token, fetchImpl: fakeFetch(401, { message: "Unauthorized" }, seen) }),
    (e: Error) => {
      assert.doesNotMatch(e.message, /sbp_thisisthesecret/, "the token is in the error message");
      assert.match(e.message, /Unauthorized/);
      return true;
    },
  );
});

test("a non-JSON body says so rather than throwing a parse error", async () => {
  const seen: { req?: RequestInit; url?: string } = {};
  await assert.rejects(
    runQuery("select 1", { ref: REF, token: "t", fetchImpl: fakeFetch(502, "<html>bad gateway</html>", seen) }),
    /HTTP 502, and the body was not JSON/,
  );
});

test("a 4xx carrying a readable reason gives the reason, not just the status", async () => {
  const seen: { req?: RequestInit; url?: string } = {};
  await assert.rejects(
    runQuery("select 1", { ref: REF, token: "t", fetchImpl: fakeFetch(400, { message: "syntax error at or near" }, seen) }),
    /syntax error at or near/,
  );
});

/**
 * A 200 carrying an error object. Trusting the status alone is how a run
 * reports success over an empty result.
 */
test("a 200 that is actually a refusal is still a refusal", async () => {
  const seen: { req?: RequestInit; url?: string } = {};
  await assert.rejects(
    runQuery("select 1", { ref: REF, token: "t", fetchImpl: fakeFetch(200, { error: "permission denied" }, seen) }),
    /permission denied/,
  );
});

// ═══════════════════════════════════════════════════════════════════════════

test("it knows when it can be used at all", () => {
  assert.equal(canUseManagementApi({ SUPABASE_ACCESS_TOKEN: "t", SUPABASE_PROJECT_REF: REF }), true);
  assert.equal(canUseManagementApi({ SUPABASE_ACCESS_TOKEN: "t" }), false);
  assert.equal(canUseManagementApi({ SUPABASE_PROJECT_REF: REF }), false);
  assert.equal(canUseManagementApi({}), false);
  // A secret that is set to the empty string is not set. This is how a missing
  // repository secret arrives in a workflow.
  assert.equal(canUseManagementApi({ SUPABASE_ACCESS_TOKEN: "", SUPABASE_PROJECT_REF: REF }), false);
  assert.equal(canUseManagementApi({ SUPABASE_ACCESS_TOKEN: "  ", SUPABASE_PROJECT_REF: REF }), false);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE WORKFLOW THAT MAKES THIS WORTH HAVING.
//
// The point of the Management API path is that running the retention report
// stops needing a database password. A workflow that quietly grew one back
// would undo the entire reason this module exists.
// ═══════════════════════════════════════════════════════════════════════════

const workflow = (() => {
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  return readFileSync(".github/workflows/retention-report.yml", "utf8");
})();

test("the report workflow runs the script that has the tests", () => {
  assert.match(workflow, /node --import tsx scripts\/retention-report\.mts/,
    "the workflow no longer runs the report, or runs something else");
});

/**
 * THE WHOLE POINT. A database password in this workflow would be the exact
 * credential the Management API path exists to avoid — and the one this
 * project has already leaked once and had to rotate.
 */
test("the workflow never takes a database password", () => {
  assert.doesNotMatch(workflow, /SUPABASE_DB_PASSWORD/,
    "the workflow asks for the database password, which is what this avoids");
  assert.doesNotMatch(workflow, /SUPABASE_DB_URL/,
    "the workflow takes a connection string, which contains the password");
  /**
   * MATCHED AS A REFERENCE, NOT AS A WORD. The first version of this was
   * /SERVICE_ROLE/i and it failed on the workflow's own comment explaining
   * that it does NOT take the service_role key — a guard tripping over the
   * prose that describes it. Only an actual secret reference or env
   * assignment counts.
   */
  assert.doesNotMatch(workflow, /secrets\.\w*SERVICE_ROLE\w*/i,
    "the workflow reads a service_role secret, which bypasses RLS entirely");
  assert.doesNotMatch(workflow, /^\s*\w*SERVICE_ROLE\w*\s*:/im,
    "the workflow sets a service_role variable");
  assert.match(workflow, /SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}/,
    "the access token is not read from the repository secret");
});

/**
 * Two workflows now name the same project. A ref that drifts points one of
 * them at a project that does not exist, and the error reads like the project
 * is gone rather than like a typo.
 */
test("both workflows name the same project", () => {
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const apply = readFileSync(".github/workflows/apply-sql.yml", "utf8");
  const refOf = (text: string, key: string) =>
    new RegExp(`${key}:\\s*([a-z0-9]{8,})`).exec(text)?.[1];
  const mine = refOf(workflow, "SUPABASE_PROJECT_REF");
  const theirs = refOf(apply, "PROJECT_REF");
  assert.ok(mine, "the retention workflow no longer names a project ref");
  assert.ok(theirs, "apply-sql.yml no longer names a project ref");
  assert.equal(mine, theirs, "the two workflows point at different projects");
  assert.doesNotThrow(() => queryUrl(mine!), "the ref in the workflow is not a usable ref");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AND THE CONSTRAINT THAT MAKES THE OUTPUT SHAREABLE.
 *
 * The script's own header calls it a design constraint rather than a habit:
 * "it must not contain a single thing that identifies an athlete: no ids, no
 * emails, no names, no per-person rows. Only counts, dates and rates." It is
 * the same rule migration 0045 set for funnel_events and that 0046 had to
 * enforce after funnel_summary shipped readable by anybody signed in.
 *
 * It matters more now than it did: a workflow log is readable by everybody
 * with access to the repository, where a terminal was readable by one person.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the report never prints a value that identifies anybody", () => {
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const script = readFileSync("scripts/retention-report.mts", "utf8");
  const printed = [...script.matchAll(/(?:console\.log|line)\(([^\n]*)\)/g)].map((m) => m[1]);
  assert.ok(printed.length > 5, `only ${printed.length} printed lines found — has the script moved?`);

  /**
   * ONLY THE INTERPOLATIONS, NOT THE PROSE. The first version of this checked
   * whether a printed line CONTAINED the word "email" and failed on
   * "(everything except account email is gated on it...)" — an English
   * sentence, printed deliberately, identifying nobody.
   *
   * What can leak is a VALUE: `${account.id}`, `${row.user_id}`. So the check
   * reads what is substituted in, and leaves the words alone.
   */
  const substituted = printed.flatMap((line) =>
    [...line.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]));

  for (const expression of substituted) {
    for (const forbidden of [".id", "user_id", ".email", ".name", "userId"]) {
      assert.ok(!expression.includes(forbidden),
        `a printed value comes from ${forbidden}, which identifies somebody: \${${expression.slice(0, 70)}}`);
    }
  }
  assert.match(script, /safe to share/, "the promise the output makes about itself is gone");
});

