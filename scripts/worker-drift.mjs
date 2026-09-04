#!/usr/bin/env node
// =============================================================================
// Does the deployed Worker match the one in this repo?
//
// WHY THIS EXISTS. The Worker is pasted into the Cloudflare dashboard by hand,
// so nothing forces the deployed script and `cloudflare/worker.js` to agree —
// and for a while they did not. Production ran 2026-08-04.2 against a repo at
// 2026-08-01.1, with an eight-model provider chain that existed nowhere in
// version control. Four separately-reported bugs traced back to that gap, and
// each one cost a debugging session that started by reading the wrong code.
//
// A silent divergence is the expensive kind. This makes it loud.
//
//   node scripts/worker-drift.mjs https://apex-api.<subdomain>.workers.dev
//   WORKER_URL=https://... node scripts/worker-drift.mjs
//
// Exit 0 when they agree, 1 when they don't, 2 when the check couldn't run
// (no URL, Worker unreachable). 2 is deliberately distinct from 1: "I could not
// tell" must never be reported as "they match".
// =============================================================================

import { readFileSync } from "node:fs";

const SOURCE = "cloudflare/worker.js";

function repoVersion() {
  const src = readFileSync(new URL(`../${SOURCE}`, import.meta.url), "utf8");
  // Matches `var WORKER_VERSION = "..."` and the const/let spellings, since the
  // file is a build output and the declaration keyword is not ours to fix.
  const m = src.match(/(?:var|const|let)\s+WORKER_VERSION\s*=\s*["']([^"']+)["']/);
  if (!m) throw new Error(`no WORKER_VERSION found in ${SOURCE}`);
  return m[1];
}

async function deployedVersion(base) {
  const url = `${base.replace(/\/+$/, "")}/health`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  const body = await res.json();
  if (!body?.version) throw new Error(`${url} returned no version field`);
  return body.version;
}

// Used as a deploy guard (see cloudflare/package.json), where refusing is the
// whole point. An explicit override exists because a guard nobody can get past
// gets deleted; one that makes you say so on the command line does not.
if (process.env.WORKER_DEPLOY_OVERRIDE === "1") {
  console.error("WORKER_DEPLOY_OVERRIDE=1 — skipping the drift check. You are on your own.");
  process.exit(0);
}

const base = process.argv[2] || process.env.WORKER_URL;
if (!base) {
  console.error(
    "No Worker URL. Pass it as an argument or set WORKER_URL.\n" +
      "  node scripts/worker-drift.mjs https://apex-api.<subdomain>.workers.dev\n" +
      "Find it in the Cloudflare dashboard under Workers & Pages → apex-api."
  );
  process.exit(2);
}

let repo;
try {
  repo = repoVersion();
} catch (e) {
  console.error(`Could not read the repo version: ${e.message}`);
  process.exit(2);
}

let live;
try {
  live = await deployedVersion(base);
} catch (e) {
  console.error(`Could not reach the deployed Worker: ${e.message}`);
  console.error("Not reporting a match — this check did not run.");
  process.exit(2);
}

// =============================================================================
// WHICH WAY THE GAP GOES IS THE WHOLE QUESTION.
//
// This compared the two versions with `===` and refused on any difference —
// which sounds cautious and made the deploy IMPOSSIBLE. Bump the version to
// ship a fix and the gate refuses, because the versions now differ; leave it
// alone and there is nothing to ship. Every push to cloudflare/ has therefore
// failed this job since it was written, the red X became part of the scenery,
// and the Worker has been pasted by hand ever since — which is exactly the
// hand-editing the gate exists to protect against. A guard that blocks the
// correct action teaches people to route around it.
//
// The safety property was never about difference. It is: NEVER OVERWRITE
// PRODUCTION WITH SOMETHING OLDER. So compare the versions in order.
//
//   repo AHEAD   → this is a deploy. That is the point of the workflow.
//   equal        → nothing to do, and nothing to lose by doing it.
//   repo BEHIND  → refuse. Production has changes that exist nowhere else.
//   unorderable  → refuse. "I cannot tell" must never read as "they match",
//                  which is the same reason an unreachable Worker exits 2.
// =============================================================================

/** "2026-09-04.2" → [2026, 9, 4, 2]. Null when it is not that shape. */
function order(version) {
  const m = /^(\d{4})-(\d{2})-(\d{2})\.(\d+)$/.exec(version.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] : null;
}

function compare(a, b) {
  const x = order(a);
  const y = order(b);
  if (!x || !y) return null;
  for (let i = 0; i < x.length; i++) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

const direction = compare(repo, live);

if (direction === 0) {
  console.log(`Worker in sync: ${repo}`);
  process.exit(0);
}

if (direction === 1) {
  console.log(
    `Deploying ${live} → ${repo}.\n` +
      `The repo is ahead of production, which is what this workflow is for.`
  );
  process.exit(0);
}

if (direction === null) {
  console.error(
    `CANNOT ORDER THESE VERSIONS\n` +
      `  deployed: ${live}\n` +
      `  ${SOURCE}: ${repo}\n\n` +
      `Expected YYYY-MM-DD.N. Refusing rather than guessing which is newer —\n` +
      `guessing wrong overwrites production with older code.`
  );
  process.exit(2);
}

console.error(
  `PRODUCTION IS AHEAD OF THIS REPO\n` +
    `  deployed: ${live}\n` +
    `  ${SOURCE}: ${repo}\n\n` +
    `The deployed Worker is NEWER than the one here, so it was edited in the\n` +
    `dashboard and those changes exist nowhere else. Deploying would overwrite\n` +
    `them with older code.\n\n` +
    `Copy it back first — Cloudflare dashboard → Workers & Pages → apex-api →\n` +
    `Edit code → select all → paste into ${SOURCE} and commit.`
);
process.exit(1);
