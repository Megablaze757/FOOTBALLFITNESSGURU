// Run with: npx deno test --allow-env --allow-net supabase/functions/_shared/llm.test.ts
//
// The chain decides which company's hardware every AI feature in the app runs
// on, and its two interesting behaviours are both invisible until they fail:
// a provider with no key must be SKIPPED rather than attempted, and a rung that
// answers badly must fall THROUGH rather than counting as success. The second
// one is the bug that broke meal photos — a text-only model answered politely,
// nothing validated the reply, and the app reported an empty plate.

import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { chain, complete, ChainError } from "./llm.ts";

const KEYS = ["GROQ_API_KEY", "OPENROUTER_API_KEY"];

function withEnv(vars: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  const saved = new Map<string, string | undefined>();
  for (const k of [...KEYS, ...Object.keys(vars)]) saved.set(k, Deno.env.get(k));
  for (const k of KEYS) Deno.env.delete(k);
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) Deno.env.delete(k); else Deno.env.set(k, v);
  }
  const restore = () => {
    for (const [k, v] of saved) { if (v === undefined) Deno.env.delete(k); else Deno.env.set(k, v); }
  };
  const out = fn();
  return out instanceof Promise ? out.finally(restore) : (restore(), out);
}

/** Answers each call in turn from `replies`, recording the URLs it was asked. */
function stubFetch(replies: ({ status: number; content?: string } | Error)[]) {
  const seen: string[] = [];
  let i = 0;
  globalThis.fetch = (async (url: string | URL) => {
    seen.push(String(url));
    const r = replies[i++] ?? { status: 500 };
    if (r instanceof Error) throw r;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: r.content ?? "" } }] }),
      { status: r.status, headers: { "Content-Type": "application/json" } },
    );
  }) as unknown as typeof fetch;
  return seen;
}

Deno.test("a provider with no key is skipped entirely", () =>
  withEnv({ GROQ_API_KEY: undefined, OPENROUTER_API_KEY: "or-key" }, () => {
    const rungs = chain("vision");
    assertEquals(rungs.every((r) => r.provider === "openrouter"), true);
    assertEquals(rungs.length > 0, true, "OpenRouter alone must be a working configuration");
  }));

Deno.test("Groq comes first when both keys are set", () =>
  withEnv({ GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o" }, () => {
    assertEquals(chain("text")[0].provider, "groq");
    assertEquals(chain("vision")[0].provider, "groq");
  }));

Deno.test("no keys at all means an empty chain, not a crash", () =>
  withEnv({}, () => {
    assertEquals(chain("text").length, 0);
    assertEquals(chain("vision").length, 0);
  }));

/**
 * The vision list is the one that matters and the one that was wrong. Every
 * model here has to accept image input; a text-only model in this list is
 * precisely the bug that made every meal photo fail.
 */
Deno.test("the vision chain is not the text chain", () =>
  withEnv({ GROQ_API_KEY: "g" }, () => {
    const vision = chain("vision").map((r) => r.model);
    const text = chain("text").map((r) => r.model);
    assertEquals(vision.some((m) => text.includes(m)), false,
      "a text-only model in the vision chain is how meal photos broke");
  }));

Deno.test("env overrides replace the built-in list", () =>
  withEnv({ GROQ_API_KEY: "g", GROQ_VISION_MODELS: "custom/one, custom/two" }, () => {
    assertEquals(chain("vision").map((r) => r.model), ["custom/one", "custom/two"]);
  }));

Deno.test("a failed Groq rung falls through to OpenRouter", async () => {
  const real = globalThis.fetch;
  await withEnv({ GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o" }, async () => {
    // Derived, not hard-coded: Groq has more than one text model, and a stub
    // sized by hand silently tests "the second Groq rung worked" instead.
    const groqRungs = chain("text").filter((r) => r.provider === "groq").length;
    const seen = stubFetch([
      ...Array(groqRungs).fill({ status: 429 }),          // whole Groq tier down
      { status: 200, content: '{"answer":"from openrouter"}' },
    ]);
    const res = await complete({ system: "s", user: "u", maxTokens: 10 });
    assertEquals(res.provider, "openrouter");
    assertEquals(seen[0].includes("groq.com"), true);
    assertEquals(seen[groqRungs].includes("openrouter.ai"), true);
  });
  globalThis.fetch = real;
});

/**
 * The failure that started all of this: a model answers, politely, without
 * having done the job. Unvalidated, that counts as success and the caller
 * reports "no food in that photo" from a chain that never actually failed.
 */
Deno.test("a reply that fails validation falls through rather than being returned", async () => {
  const real = globalThis.fetch;
  await withEnv({ GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o" }, async () => {
    const groqRungs = chain("text").filter((r) => r.provider === "groq").length;
    stubFetch([
      ...Array(groqRungs).fill({ status: 200, content: "I'm sorry, I can't see images." }),
      { status: 200, content: '{"items":[{"name":"Rice","kcal":300}]}' },
    ]);
    const res = await complete({
      system: "s", user: "u", maxTokens: 10,
      validate: (t) => t.trim().startsWith("{"),
    });
    assertEquals(res.provider, "openrouter");
  });
  globalThis.fetch = real;
});

Deno.test("an empty reply is a failed rung", async () => {
  const real = globalThis.fetch;
  await withEnv({ GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o" }, async () => {
    const groqRungs = chain("text").filter((r) => r.provider === "groq").length;
    stubFetch([
      ...Array(groqRungs).fill({ status: 200, content: "   " }),
      { status: 200, content: "a real answer" },
    ]);
    assertEquals((await complete({ system: "s", user: "u", maxTokens: 10 })).provider, "openrouter");
  });
  globalThis.fetch = real;
});

Deno.test("when every rung fails, the error names them", async () => {
  const real = globalThis.fetch;
  await withEnv({ GROQ_API_KEY: "g" }, async () => {
    stubFetch([{ status: 500 }, { status: 500 }, { status: 500 }]);
    const err = await assertRejects(
      () => complete({ system: "s", user: "u", maxTokens: 10 }),
      ChainError,
    );
    assertEquals(err.message.includes("groq/"), true, "must say which model failed");
  });
  globalThis.fetch = real;
});

Deno.test("no key configured is reported as such, not as a model failure", async () => {
  await withEnv({}, async () => {
    const err = await assertRejects(
      () => complete({ system: "s", user: "u", maxTokens: 10 }),
      ChainError,
    );
    assertEquals(err.message.includes("no provider key configured"), true);
  });
});

Deno.test("an image is sent as an image_url block", async () => {
  const real = globalThis.fetch;
  await withEnv({ GROQ_API_KEY: "g" }, async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    }) as unknown as typeof fetch;

    await complete({ system: "s", user: "u", image: "data:image/jpeg;base64,AAAA", maxTokens: 10 });
    const messages = body.messages as { role: string; content: unknown }[];
    const content = messages[1].content as { type: string; image_url?: { url: string } }[];
    assertEquals(Array.isArray(content), true);
    assertEquals(content[0].type, "image_url");
    assertEquals(content[0].image_url?.url, "data:image/jpeg;base64,AAAA");
    // And it must have picked a model that can actually see.
    assertEquals(body.model, chain("vision")[0].model);
  });
  globalThis.fetch = real;
});
