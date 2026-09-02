import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseIngestPayload } from "./biometrics";
import { todayLocal } from "./day";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO COPIES OF THE MORNING SYNC'S PARSER, AND A COMMENT ASKING A HUMAN TO
 * KEEP THEM THE SAME.
 *
 * The Apple Shortcut posts to the Supabase Edge Function, which runs in Deno
 * and cannot import from this app's lib/ — so parseIngestPayload exists twice,
 * and supabase/functions/wearable-ingest/index.ts says so in as many words:
 * "If you change how a payload is read, change it in both places and run that
 * suite." That instruction is a comment. Comments do not run.
 *
 * The two are one bad night's sleep apart in consequence. lib's copy decides
 * what the app SHOWS; the Edge copy decides what is STORED. A drift between
 * them is invisible on both sides — the app reads back exactly what the
 * function wrote, so a misparse looks like data, and the athlete's readiness
 * moves for a reason nobody can find.
 *
 * So: pull the Deno copy's parser out of its source and run the same payloads
 * through both. Extraction rather than import because the file opens with a
 * `jsr:` specifier node cannot resolve.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const EDGE = new URL("../supabase/functions/wearable-ingest/index.ts", import.meta.url);

async function edgeParser(): Promise<(body: unknown, today: string) => unknown[]> {
  const src = readFileSync(EDGE, "utf8");
  const start = src.indexOf("function parseIngestPayload(");
  const end = src.indexOf("const json = ", start);
  assert.ok(start > 0 && end > start,
    "the Edge Function's parser has moved — this test can no longer find it, which is "
    + "not permission to stop checking");

  const slice = src.slice(start, end);
  for (const helper of ["numOrNull", "durationTextToHours", "sleepToHours", "toISODate"]) {
    assert.ok(slice.includes(`function ${helper}(`), `${helper} is no longer inside the extracted range`);
  }

  const file = join(mkdtempSync(join(tmpdir(), "ingest-parity-")), "edge.ts");
  writeFileSync(file, `interface BiometricRow {
  metric_date: string; hrv_ms: number | null; resting_hr: number | null;
  sleep_hours: number | null; source: string;
}
${slice}
export { parseIngestPayload };
`);
  const mod = await import(pathToFileURL(file).href) as {
    parseIngestPayload: (body: unknown, today: string) => unknown[];
  };
  return mod.parseIngestPayload;
}

/**
 * Every shape a phone actually sends, including the ones that have already
 * gone wrong once: iOS renders a duration as "7 hr 32 min", which strips to 732
 * and reads as minutes — twelve and a quarter hours of sleep, fed straight into
 * readiness.
 */
const PAYLOADS: [string, unknown][] = [
  ["one plain morning", { sleep: 7.5, hrv: 55, rhr: 48 }],
  ["iOS duration text", { sleep: "7 hr 32 min", hrv: 61, rhr: 50 }],
  ["duration with no minutes", { sleep: "8 hr", hrv: 61 }],
  ["minutes, spelled out", { sleepMinutes: 452, hrv: 44 }],
  ["a bare number that must mean minutes", { sleep: 450 }],
  ["a bare number that must mean hours", { sleep: 7 }],
  ["keys typed by hand on a phone", { "Resting HR": 52, "Heart Rate Variability": 39, "Hours of Sleep": 6 }],
  ["an explicit date", { date: "2026-06-14", sleep: 6.2, hrv: 40, rhr: 55 }],
  ["a US date", { date: "06/14/2026", sleep: 6.2 }],
  ["an ISO timestamp", { startDate: "2026-06-14T23:10:00Z", sleep: 6.2 }],
  ["several days at once", [{ date: "2026-06-13", sleep: 7 }, { date: "2026-06-14", sleep: 8 }]],
  ["the same day twice — the later row wins", [{ date: "2026-06-13", sleep: 7 }, { date: "2026-06-13", sleep: 9 }]],
  ["nothing usable", { steps: 9000 }],
  ["empty", {}],
  ["not an object", "sleep=7"],
  ["null", null],
  ["an empty list", []],
  ["strings, as a query string always sends", { sleep: "7.5", hrv: "55", rhr: "48" }],
  ["zero is a value, not an absence", { hrv: 0, rhr: 0, sleep: 0 }],
  ["nonsense numbers", { hrv: -5, rhr: 999, sleep: 40 }],
];

test("both copies of the morning-sync parser read a payload the same way", async () => {
  const edge = await edgeParser();
  const today = todayLocal();

  for (const [label, payload] of PAYLOADS) {
    const ours = parseIngestPayload(payload);
    const theirs = edge(payload, today);
    assert.deepEqual(theirs, ours,
      `${label}: the Edge Function stores something different from what the app reads back.\n`
      + `  supabase/functions/wearable-ingest/index.ts: ${JSON.stringify(theirs)}\n`
      + `  lib/biometrics.ts:                          ${JSON.stringify(ours)}`);
  }
});

/** The date default is the one thing the two cannot share, so pin it explicitly. */
test("a payload with no date lands on the athlete's local today in both", async () => {
  const edge = await edgeParser();
  const today = todayLocal();
  const [ours] = parseIngestPayload({ sleep: 7.5 }) as { metric_date: string }[];
  const [theirs] = edge({ sleep: 7.5 }, today) as { metric_date: string }[];
  assert.equal(ours.metric_date, today);
  assert.equal(theirs.metric_date, today);
});
