import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PAGE = readFileSync(new URL("../app/(app)/coach/page.tsx", import.meta.url), "utf8");

/**
 * A slow provider chain must not become a slow program engine.
 *
 * The deterministic builder produces a complete plan in milliseconds, but the
 * page once waited on invokeAI's 60-second default before reaching it. This is
 * a source-level boundary test because importing a Next client page into the
 * node test runner would initialise browser-only auth code.
 */
test("program generation has a short AI window before local fallback", () => {
  const declared = PAGE.match(/const PROGRAM_AI_TIMEOUT_MS\s*=\s*([\d_]+);/);
  assert.ok(declared, "program generation needs an explicit route-specific timeout");
  const timeoutMs = Number(declared[1].replaceAll("_", ""));
  assert.ok(timeoutMs <= 8_000, `program AI timeout regressed to ${timeoutMs}ms`);
  assert.ok(timeoutMs >= 2_000, "the model is not being given a realistic chance to answer");

  assert.match(
    PAGE,
    /invokeAI<\{ plan\?: ProgramPlan \}>\(\s*["']generate-program["'][\s\S]*?PROGRAM_AI_TIMEOUT_MS\s*\)/,
    "generate-program is not using the short timeout",
  );
  assert.match(
    PAGE,
    /startJob\("program"[\s\S]*?finally\s*\{[\s\S]*?setCreating\(false\)[\s\S]*?setBuildingId\(null\)/,
    "a failed job can leave the page permanently stuck in its building state",
  );
});
