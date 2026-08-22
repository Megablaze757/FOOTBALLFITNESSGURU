// Which of the two worker files goes in the Cloudflare dashboard.
//
// The TypeScript source was pasted into the dashboard editor and produced
//
//   Uncaught SyntaxError: Unexpected token 'export' at index.js:24
//
// which is the runtime saying it has been handed a language it does not speak.
// Two files, one of them right, and nothing in either of them said which — so
// both now say it in their first ten lines and this keeps them saying it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the bundle says it is the one to paste", () => {
  const head = read("../cloudflare/worker.js").slice(0, 900);
  assert.match(head, /PASTE THIS FILE INTO THE CLOUDFLARE DASHBOARD/);
  assert.match(head, /build-worker-bundle/, "it does not say how to rebuild itself");
});

test("the source says it is not", () => {
  const head = read("../cloudflare/src/index.ts").slice(0, 1200);
  assert.match(head, /DO NOT PASTE IT INTO THE CLOUDFLARE DASHBOARD/);
  assert.match(head, /worker\.js/, "it does not name the file that should be pasted instead");
});

test("the bundle carries no TypeScript", () => {
  // The actual difference between the two, and the reason one of them runs.
  // Checked on the code rather than the comments, which now discuss types at
  // length precisely because this went wrong.
  const bundle = read("../cloudflare/worker.js")
    .replace(/^\s*\/\/[^\n]*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/^\s*export (interface|type) /m.test(bundle), "the bundle contains type declarations");
  assert.ok(!/:\s*Promise<[A-Z]/.test(bundle), "the bundle contains type annotations");
});
