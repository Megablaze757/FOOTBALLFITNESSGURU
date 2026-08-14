#!/usr/bin/env node
// Copy the launch email module into the Worker source, verbatim.
//
//   node scripts/sync-launch-email.mjs
//
// Three senders render this email — the Edge Function, the SQL sender and the
// Worker route — and each needs the module in a place its own build can reach.
// Copying beats three hand-maintained versions: there is one file to edit and a
// test that fails the moment the copy drifts from it.
import { readFileSync, writeFileSync } from "node:fs";

const SRC = new URL("../supabase/functions/announce-launch/email.ts", import.meta.url);
const OUT = new URL("../cloudflare/src/launch-email.ts", import.meta.url);

const header = `// =============================================================================
// GENERATED - do not edit. Copied verbatim from
// supabase/functions/announce-launch/email.ts by scripts/sync-launch-email.mjs.
//
// The launch email has exactly one source. It is rendered in three places now -
// the Edge Function, the SQL sender, and this Worker route - and three
// hand-maintained copies of the same HTML is how half a mailing list ends up
// with last week's wording. The module is plain TypeScript with no imports and
// no runtime APIs, which is what makes copying it verbatim safe; a test fails
// if this file and the original ever differ.
// =============================================================================

`;
writeFileSync(OUT, header + readFileSync(SRC, "utf8"));
console.log("cloudflare/src/launch-email.ts updated");
