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

if (repo === live) {
  console.log(`Worker in sync: ${repo}`);
  process.exit(0);
}

console.error(
  `WORKER DRIFT\n` +
    `  deployed: ${live}\n` +
    `  ${SOURCE}: ${repo}\n\n` +
    `The deployed Worker is not the one in this repo, so anything read from\n` +
    `${SOURCE} may not be what production is running.\n\n` +
    `If the DEPLOYED one is newer (the usual case, since it is edited in the\n` +
    `dashboard), copy it back first — Cloudflare dashboard → Workers & Pages →\n` +
    `apex-api → Edit code → select all → paste into ${SOURCE} and commit.\n` +
    `Do NOT deploy from this repo to close the gap: that overwrites production\n` +
    `with the older script and loses whatever was changed in the dashboard.`
);
process.exit(1);
