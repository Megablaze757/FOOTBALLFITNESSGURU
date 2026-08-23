#!/usr/bin/env node
// =============================================================================
// Are the hand-picked form-guide videos still there?
//
// WHY THIS EXISTS. Two of the twelve curated links were dead when this was
// written — "nordic hamstring curl" and "copenhagen plank", the two exercises
// on the list where the failure mode is a torn hamstring rather than a wasted
// set. Nobody noticed, because nothing looks wrong from inside the app: the
// button renders, the link is well-formed, and the apology page is YouTube's.
//
// A curated link rots silently and a search never does, which is the whole
// argument for keeping the list short. This makes the rot findable.
//
// It prints the TITLE as well as the status, because a video id that still
// resolves can point at something else entirely — a channel re-uploading, an
// id reused. A 200 is not the same as the right video.
//
//   node scripts/check-form-guides.mjs
//
// Exits non-zero if any link is dead, so it can be a scheduled job later.
// Deliberately not a unit test: it depends on the network and on YouTube being
// up, and a test suite that fails because someone else's site is down teaches
// people to ignore red.
// =============================================================================

import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../lib/form-guide.ts", import.meta.url), "utf8");
const block = source.slice(source.indexOf("const CURATED"), source.indexOf("};", source.indexOf("const CURATED")));
const entries = [...block.matchAll(/"([^"]+)":\s*"(https:\/\/www\.youtube\.com\/watch\?v=[\w-]+)"/g)]
  .map(([, name, url]) => ({ name, url }));

if (!entries.length) {
  console.error("No curated links found — has lib/form-guide.ts changed shape?");
  process.exit(1);
}

let dead = 0;
for (const { name, url } of entries) {
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  let status = 0;
  let title = "";
  try {
    const res = await fetch(endpoint);
    status = res.status;
    if (res.ok) title = (await res.json()).title ?? "";
  } catch (e) {
    title = `request failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  const ok = status === 200;
  if (!ok) dead += 1;
  console.log(`${ok ? "ok  " : "DEAD"} ${status}  ${name.padEnd(24)} ${title}`);
}

console.log(`\n${entries.length - dead} of ${entries.length} still live.`);
if (dead) {
  console.error("Remove or replace the dead ones — they fall back to a search, which always works.");
  process.exit(1);
}
