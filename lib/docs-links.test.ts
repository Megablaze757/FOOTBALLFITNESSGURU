import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A FILE POINTED AT FROM AN ERROR MESSAGE HAS TO EXIST.
 *
 * docs/REELS.md was referenced four times and had never been written. One of
 * those references is inside the error thrown when the voice model is missing:
 * somebody hitting the one failure that most needs an explanation was sent to a
 * file that was not there.
 *
 * Comments go stale quietly. A path does not have to.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const SOURCE_DIRS = ["lib", "scripts", "app", ".github/workflows"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|mts|tsx|js|mjs|py|sh|yml)$/.test(entry.name)) out.push(path);
  }
  return out;
}

test("every docs/ file mentioned in the source exists", () => {
  const missing: string[] = [];
  for (const dir of SOURCE_DIRS) {
    if (!existsSync(dir)) continue;
    for (const file of sourceFiles(dir)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/docs\/[A-Za-z0-9_-]+\.md/g)) {
        if (!existsSync(m[0])) missing.push(`${file} points at ${m[0]}`);
      }
    }
  }
  assert.deepEqual(missing, [], `dangling documentation links:\n  ${missing.join("\n  ")}`);
});

/**
 * And it has to still be the page those four references promise: the voice
 * model is the thing record-reel.mts sends people here for.
 */
test("the reel doc covers what the code sends people to it for", () => {
  const doc = readFileSync("docs/REELS.md", "utf8");
  for (const needed of ["kokoro-v1.0.onnx", "voices-v1.0.bin", "kokoro-onnx==0.6.1"]) {
    assert.ok(doc.includes(needed), `docs/REELS.md never mentions ${needed}`);
  }
});
