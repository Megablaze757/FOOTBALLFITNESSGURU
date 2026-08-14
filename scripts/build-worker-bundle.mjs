#!/usr/bin/env node
// =============================================================================
// Rebuild cloudflare/worker.js from cloudflare/src/index.ts.
//
// wrangler deploys from `src/index.ts` (see wrangler.toml `main`), so worker.js
// is not what ships — it is the bundle you paste into the Cloudflare dashboard
// when deploying by hand, and it is what scripts/worker-drift.mjs reads the
// version out of.
//
// That makes a stale worker.js quietly dangerous in two ways: paste it and you
// deploy a Worker missing whatever src gained since, and the drift guard starts
// comparing a version that belongs to neither the repo nor production. Rebuild
// it in the same commit as any change to src.
//
//   node scripts/build-worker-bundle.mjs
// =============================================================================
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const out = mkdtempSync(join(tmpdir(), "worker-bundle-"));
try {
  // --dry-run bundles without deploying, so this needs no Cloudflare token and
  // runs offline.
  execFileSync("npx", ["wrangler", "deploy", "--dry-run", "--outdir", out], {
    cwd: join(ROOT, "cloudflare"), stdio: "pipe",
  });
  const bundled = readFileSync(join(out, "index.js"), "utf8")
    // No .map ships next to it, and a sourceMappingURL pointing at nothing
    // makes browser devtools report a fetch error on every load.
    .replace(/\n\/\/# sourceMappingURL=.*\n?$/, "\n");
  writeFileSync(join(ROOT, "cloudflare/worker.js"), bundled);
  const v = bundled.match(/WORKER_VERSION\s*=\s*"([^"]+)"/)?.[1];
  console.log(`cloudflare/worker.js rebuilt (WORKER_VERSION ${v})`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
