import { test } from "node:test";
import assert from "node:assert/strict";
import { pickProvider, missingKeyMessage, NVIDIA_DEFAULT_MODEL, OPENROUTER_DEFAULT_MODEL } from "./draft-provider";

/**
 * The free one wins when both are available. A drafting run is two hundred
 * requests nobody is waiting on — the same trade the Worker's freeOnly makes.
 */
test("NVIDIA is preferred when both keys are set", () => {
  const p = pickProvider({ NVIDIA_API_KEY: "n", OPENROUTER_API_KEY: "o" });
  assert.equal(p?.id, "nvidia");
  assert.equal(p?.free, true);
  assert.equal(p?.model, NVIDIA_DEFAULT_MODEL);
  assert.match(p!.url, /nvidia\.com/);
});

test("either key alone is enough", () => {
  assert.equal(pickProvider({ NVIDIA_API_KEY: "n" })?.id, "nvidia");
  const or = pickProvider({ OPENROUTER_API_KEY: "o" });
  assert.equal(or?.id, "openrouter");
  assert.equal(or?.free, false, "the UI has to be able to warn before spending");
  assert.equal(or?.model, OPENROUTER_DEFAULT_MODEL);
});

test("an explicit preference is honoured, and refused when its key is missing", () => {
  assert.equal(pickProvider({ NVIDIA_API_KEY: "n", OPENROUTER_API_KEY: "o" }, "openrouter")?.id, "openrouter");
  assert.equal(pickProvider({ NVIDIA_API_KEY: "n" }, "openrouter"), null,
    "asking for a provider with no key must fail, not silently use the other one");
});

test("no key is null, not a guess", () => {
  assert.equal(pickProvider({}), null);
  assert.equal(pickProvider({ NVIDIA_API_KEY: "" }), null, "an empty string is not a key");
  assert.equal(pickProvider({ NVIDIA_API_KEY: "   " }), null, "nor is whitespace");
  assert.match(missingKeyMessage(), /NVIDIA_API_KEY/);
  assert.match(missingKeyMessage(), /free/);
});

test("the model is overridable per provider", () => {
  assert.equal(pickProvider({ NVIDIA_API_KEY: "n", NVIDIA_MODEL: "other/model" })?.model, "other/model");
  assert.equal(pickProvider({ OPENROUTER_API_KEY: "o", OPENROUTER_MODEL: "x/y" })?.model, "x/y");
  // An override that is only whitespace falls back rather than sending nothing.
  assert.equal(pickProvider({ NVIDIA_API_KEY: "n", NVIDIA_MODEL: "  " })?.model, NVIDIA_DEFAULT_MODEL);
});

/** A key must never reach anywhere but the Authorization header. */
test("the key goes in the header and nowhere else", () => {
  const p = pickProvider({ NVIDIA_API_KEY: "secret-key-value" })!;
  assert.equal(p.headers.Authorization, "Bearer secret-key-value");
  assert.ok(!p.url.includes("secret-key-value"), "a key in a URL lands in logs and referrers");
  assert.ok(!p.model.includes("secret-key-value"));
});
