import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { backendCapabilities, resetBackendCapabilities } from "./api";

/**
 * The capability probe decides whether the photo estimator is offered at all,
 * so getting it wrong either hides a working feature or keeps inviting people
 * to photograph a plate nothing can look at.
 */

const realFetch = globalThis.fetch;
const realEnv = process.env.NEXT_PUBLIC_API_URL;

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realEnv === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = realEnv;
  resetBackendCapabilities();
});

function stubHealth(body: unknown, ok = true) {
  globalThis.fetch = (async () => ({
    ok,
    json: async () => body,
  })) as unknown as typeof fetch;
}

test("a /health with no vision field means photos cannot be read", async () => {
  // Exactly what production returns: a groq text-only chain, no `vision` key.
  process.env.NEXT_PUBLIC_API_URL = "https://example.test";
  stubHealth({ ok: true, version: "2026-08-04.2", model: "groq/openai/gpt-oss-120b", providers: ["groq"] });
  const caps = await backendCapabilities();
  assert.equal(caps.reachable, true);
  assert.equal(caps.vision, false, "no vision field must mean no vision");
  assert.equal(caps.version, "2026-08-04.2");
});

test("a /health that names a vision model means photos work", async () => {
  process.env.NEXT_PUBLIC_API_URL = "https://example.test";
  stubHealth({ ok: true, version: "2026-08-01.1", model: "x", vision: "google/gemini-2.5-flash" });
  assert.equal((await backendCapabilities()).vision, true);
});

test("an empty vision string counts as no vision", async () => {
  process.env.NEXT_PUBLIC_API_URL = "https://example.test";
  stubHealth({ ok: true, vision: "" });
  assert.equal((await backendCapabilities()).vision, false);
});

/**
 * A failed probe must never disable a feature that might work. Unknown is
 * treated as capable, and the estimate itself reports any real failure.
 */
test("an unreachable backend is assumed capable, not broken", async () => {
  process.env.NEXT_PUBLIC_API_URL = "https://example.test";
  globalThis.fetch = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
  const caps = await backendCapabilities();
  assert.equal(caps.reachable, false);
  assert.equal(caps.vision, true, "a network failure must not hide the camera");
});

test("a non-200 /health is assumed capable too", async () => {
  process.env.NEXT_PUBLIC_API_URL = "https://example.test";
  stubHealth({}, false);
  assert.equal((await backendCapabilities()).vision, true);
});

test("no Worker configured falls through to Supabase, which can see", async () => {
  delete process.env.NEXT_PUBLIC_API_URL;
  const caps = await backendCapabilities();
  assert.equal(caps.reachable, false);
  assert.equal(caps.vision, true);
});

/** Ten components mounting at once must make one request, not ten. */
test("the probe is made once per session", async () => {
  process.env.NEXT_PUBLIC_API_URL = "https://example.test";
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return { ok: true, json: async () => ({ vision: "m" }) }; }) as unknown as typeof fetch;
  await Promise.all([backendCapabilities(), backendCapabilities(), backendCapabilities()]);
  await backendCapabilities();
  assert.equal(calls, 1, `probed ${calls} times`);
});
