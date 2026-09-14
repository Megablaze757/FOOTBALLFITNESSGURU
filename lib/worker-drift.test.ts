import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

const SCRIPT = new URL("../scripts/worker-drift.mjs", import.meta.url).pathname;
const BUNDLE = new URL("../cloudflare/worker.js", import.meta.url).pathname;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A GUARD THAT BLOCKS THE CORRECT ACTION TEACHES PEOPLE TO ROUTE AROUND IT.
 *
 * This compared the deployed and repo versions with `===` and refused on any
 * difference. Which sounds cautious and made deployment impossible: bump the
 * version to ship a fix and it refuses because they now differ; leave it alone
 * and there is nothing to ship. Every push to cloudflare/ failed the Deploy API
 * Worker job, the red X became scenery, and the Worker got pasted by hand
 * instead — which is the very hand-editing the gate exists to protect against.
 *
 * The safety property was never "they must match". It is: NEVER OVERWRITE
 * PRODUCTION WITH SOMETHING OLDER. Both halves are pinned below, because
 * loosening this wrongly silently discards work that exists nowhere else.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** A stand-in Worker reporting one version from /health. */
async function withLiveWorker<T>(version: string | null, body: (url: string) => Promise<T>): Promise<T> {
  const server = createServer((req, res) => {
    if (!req.url?.endsWith("/health")) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(version === null ? { ok: true } : { ok: true, version }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  try {
    return await body(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

/**
 * Run the gate against a repo bundle pinned to `repoVersion`.
 *
 * ASYNC, AND THAT IS NOT A STYLE CHOICE. The first version used execFileSync,
 * which blocks this process's event loop — the same loop the stub Worker above
 * is listening on. The child's request could never be answered, so every case
 * below silently tested the "could not reach the deployed Worker" path instead
 * of the comparison it was written for, and reported the gate as broken.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A COPY OF THE REPO LAYOUT, NOT THE REPO.
 *
 * This used to rewrite the real cloudflare/worker.js in place and put it back
 * in a `finally`, and both ways that can go wrong were seen on one afternoon.
 *
 * The test runner runs FILES IN PARALLEL, so lib/worker-paste.test.ts and
 * lib/admin-cancel.test.ts read the bundle while this file had a version of
 * its own invention in it, and failed — intermittently, in a way that passed
 * on every re-run of those files alone. And a run killed between the write
 * and the `finally` leaves the TRACKED FILE MODIFIED, which is how
 * `WORKER_VERSION = "2026-09-04.2"` turned up in a working tree nobody had
 * edited.
 *
 * worker-drift.mjs resolves the bundle relative to its own URL, so putting a
 * copy of the script and a copy of the bundle in one temp directory exercises
 * exactly the same resolution against files this test owns. No production
 * code learned about a test, and nothing outside the temp directory is
 * written at all.
 * ═══════════════════════════════════════════════════════════════════════════
 */
async function run(url: string, repoVersion: string): Promise<{ code: number; out: string }> {
  const dir = mkdtempSync(join(tmpdir(), "drift-"));
  mkdirSync(join(dir, "scripts"));
  mkdirSync(join(dir, "cloudflare"));
  writeFileSync(join(dir, "scripts", "worker-drift.mjs"), readFileSync(SCRIPT, "utf8"));
  writeFileSync(join(dir, "cloudflare", "worker.js"), readFileSync(BUNDLE, "utf8").replace(
    /(var|const|let)\s+WORKER_VERSION\s*=\s*"[^"]+"/,
    `$1 WORKER_VERSION = "${repoVersion}"`,
  ));
  try {
    return await new Promise((resolve) => {
      execFile("node", [join(dir, "scripts", "worker-drift.mjs"), url], { encoding: "utf8" }, (err, stdout, stderr) => {
        const code = (err as { code?: number } | null)?.code ?? 0;
        resolve({ code, out: `${stdout}${stderr}` });
      });
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a repo ahead of production deploys — that is what the workflow is for", async () => {
  await withLiveWorker("2026-09-04.1", async (url) => {
    for (const ahead of ["2026-09-04.2", "2026-09-05.1", "2026-10-01.1", "2027-01-01.1"]) {
      const { code, out } = await run(url, ahead);
      assert.equal(code, 0, `${ahead} over 2026-09-04.1 was refused:\n${out}`);
      assert.match(out, /Deploying/);
    }
  });
});

test("production ahead of the repo is refused, and says why", async () => {
  await withLiveWorker("2026-09-10.3", async (url) => {
    for (const behind of ["2026-09-10.2", "2026-09-04.9", "2025-12-31.1"]) {
      const { code, out } = await run(url, behind);
      assert.equal(code, 1, `${behind} under 2026-09-10.3 was allowed to overwrite production`);
      assert.match(out, /PRODUCTION IS AHEAD/);
      assert.match(out, /paste into/, "it refuses without saying how to resolve it");
    }
  });
});

test("identical versions are a no-op, not a refusal", async () => {
  await withLiveWorker("2026-09-04.2", async (url) => {
    const { code, out } = await run(url, "2026-09-04.2");
    assert.equal(code, 0);
    assert.match(out, /in sync/);
  });
});

/**
 * "I could not tell" must never read as "they match" — the same reason an
 * unreachable Worker exits 2 rather than 0.
 */
test("a version it cannot order is refused rather than guessed", async () => {
  await withLiveWorker("main", async (url) => {
    const { code, out } = await run(url, "2026-09-04.2");
    assert.equal(code, 2, "an unorderable version was treated as a decision");
    assert.match(out, /CANNOT ORDER/);
  });

  await withLiveWorker(null, async (url) => {
    const { code } = await run(url, "2026-09-04.2");
    assert.equal(code, 2, "a Worker reporting no version at all was treated as a decision");
  });
});

test("an unreachable Worker never reports a match", async () => {
  // Port 1 is reserved and refuses instantly on every platform.
  const { code, out } = await run("http://127.0.0.1:1", "2026-09-04.2");
  assert.equal(code, 2);
  assert.match(out, /this check did not run/);
});
