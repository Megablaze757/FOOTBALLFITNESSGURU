import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { backendCapabilities, resetBackendCapabilities } from "./api";

/**
 * The capability probe decides whether the photo estimator is offered at all,
 * so getting it wrong either hides a working feature or keeps inviting people
 * to photograph a plate nothing can look at.
 *
 * It answers about TWO backends now. The Worker in production runs an
 * eight-model chain without one vision model in it, so the photo path falls
 * through to a Supabase Edge Function — and "can a photo be read" is therefore
 * the OR of the two, not the Worker's answer alone.
 */

const realFetch = globalThis.fetch;
const realApi = process.env.NEXT_PUBLIC_API_URL;
const realSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL;

afterEach(() => {
  globalThis.fetch = realFetch;
  restore("NEXT_PUBLIC_API_URL", realApi);
  restore("NEXT_PUBLIC_SUPABASE_URL", realSupabase);
  resetBackendCapabilities();
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

/**
 * Routes by URL, because the probe makes two different calls now and a stub
 * that answers both the same way tests nothing. `edgeStatus` is what the Edge
 * Function's CORS preflight returns — 404 when it hasn't been deployed.
 */
function stub({ health, healthOk = true, edgeStatus = 200 }: {
  health?: unknown; healthOk?: boolean; edgeStatus?: number;
}) {
  const calls = { health: 0, edge: 0 };
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("/functions/v1/estimate-food")) {
      calls.edge++;
      return { ok: edgeStatus < 400, status: edgeStatus, json: async () => ({}) };
    }
    calls.health++;
    return { ok: healthOk, status: healthOk ? 200 : 500, json: async () => health };
  }) as unknown as typeof fetch;
  return calls;
}

test("a /health that names a vision model means the Worker takes photos", async () => {
  process.env.NEXT_PUBLIC_API_URL = "https://example.test";
  stub({ health: { ok: true, version: "2026-08-01.1", model: "x", vision: "google/gemini-2.5-flash" } });
  const caps = await backendCapabilities();
  assert.equal(caps.vision, true);
  assert.equal(caps.visionVia, "worker");
});

/**
 * The exact payload production returns. This is the bug: eight models, not one
 * of which can see, and no `vision` key at all.
 */
test("production's text-only chain falls through to the Edge Function", async () => {
  process.env.NEXT_PUBLIC_API_URL = "https://example.test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.co";
  const calls = stub({
    health: {
      ok: true, version: "2026-08-04.2", model: "groq/openai/gpt-oss-120b",
      providers: ["groq", "openrouter", "nvidia"],
      chain: ["groq/openai/gpt-oss-120b", "groq/llama-3.3-70b-versatile"],
    },
    edgeStatus: 200,
  });
  const caps = await backendCapabilities();
  assert.equal(caps.reachable, true);
  assert.equal(caps.version, "2026-08-04.2");
  assert.equal(caps.vision, true, "the Edge Function can see even though the Worker can't");
  assert.equal(caps.visionVia, "edge");
  assert.equal(calls.edge, 1, "it must actually ask whether the Edge Function is there");
});

test("neither backend can see, so the camera is not offered", async () => {
  process.env.NEXT_PUBLIC_API_URL = "https://example.test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.co";
  stub({ health: { ok: true, version: "2026-08-04.2", model: "groq/openai/gpt-oss-120b" }, edgeStatus: 404 });
  assert.equal((await backendCapabilities()).vision, false);
});

test("an empty vision string counts as no vision", async () => {
  process.env.NEXT_PUBLIC_API_URL = "https://example.test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.co";
  stub({ health: { ok: true, vision: "" }, edgeStatus: 404 });
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
  stub({ health: {}, healthOk: false });
  assert.equal((await backendCapabilities()).vision, true);
});

/** Same rule one level down: a flaky preflight must not take the camera away. */
test("an Edge Function probe that throws is assumed deployed", async () => {
  process.env.NEXT_PUBLIC_API_URL = "https://example.test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.co";
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("/functions/v1/")) throw new Error("offline");
    return { ok: true, status: 200, json: async () => ({ ok: true, model: "groq/text-only" }) };
  }) as unknown as typeof fetch;
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
  const calls = stub({ health: { vision: "m" } });
  await Promise.all([backendCapabilities(), backendCapabilities(), backendCapabilities()]);
  await backendCapabilities();
  assert.equal(calls.health, 1, `probed ${calls.health} times`);
});
