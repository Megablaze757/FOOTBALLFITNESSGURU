// =============================================================================
// The model chain every Edge Function calls: Groq first, OpenRouter after.
//
// WHY THIS FILE EXISTS. Three Edge Functions each held their own Anthropic
// client, their own model id and their own error handling — while the
// Cloudflare Worker, which serves most of the app's AI, ran an entirely
// different provider chain. Two AI stacks in one product means two sets of
// credentials, two bills, two things to rotate, and features that fail in
// different ways for reasons nobody can hold in their head at once. There is
// now one chain, and it is the Worker's.
//
// GROQ FIRST because it is by a distance the fastest of the two, and every one
// of these calls happens while somebody waits — a photo of a plate, a question
// to the coach, a program being built. OPENROUTER SECOND because breadth is
// exactly what a fallback needs: when a Groq model is retired, rate-limited or
// simply down, the same request goes out to a different company's hardware
// rather than failing.
//
// A rung whose key is missing is SKIPPED, not failed. That is what makes the
// two providers independently optional: set only GROQ_API_KEY and everything
// works with no fallback; set only OPENROUTER_API_KEY and it works a little
// slower. Set neither and the caller gets a 503 that says so.
//
// Both providers speak the OpenAI chat-completions shape, which is the whole
// reason this is one function and not two.
//
// Secrets: GROQ_API_KEY and/or OPENROUTER_API_KEY
// Optional overrides: GROQ_TEXT_MODELS, GROQ_VISION_MODELS,
//                     OPENROUTER_TEXT_MODELS, OPENROUTER_VISION_MODELS
// =============================================================================

export type Provider = "groq" | "openrouter";

export interface Rung {
  provider: Provider;
  model: string;
}

const ENDPOINT: Record<Provider, string> = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

const KEY_VAR: Record<Provider, string> = {
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

/**
 * Defaults, mirroring what the Worker runs.
 *
 * VISION IS A MUCH SHORTER LIST THAN TEXT, and that asymmetry is the entire
 * reason the meal photo estimator was broken. Most models cannot see. Groq's
 * production chain — gpt-oss-120b, llama-3.3-70b — is text-only, so photos were
 * being posted to something incapable of looking at them and the app blamed the
 * athlete's photography. A model belongs in a vision list only if it has been
 * checked to accept image input.
 *
 * `qwen/qwen3.6-27b` is Groq's multimodal model: 131K context, up to 5 images,
 * 20MB a request, and it takes a base64 data URL in `image_url` exactly like
 * the OpenRouter models below.
 */
const DEFAULTS: Record<Provider, { text: string[]; vision: string[] }> = {
  groq: {
    text: ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"],
    vision: ["qwen/qwen3.6-27b"],
  },
  openrouter: {
    text: ["deepseek/deepseek-chat", "google/gemini-2.5-flash"],
    vision: ["google/gemini-2.5-flash", "openai/gpt-4.1-mini"],
  },
};

function models(provider: Provider, kind: "text" | "vision"): string[] {
  const envVar = `${provider.toUpperCase()}_${kind.toUpperCase()}_MODELS`;
  const configured = (Deno.env.get(envVar) || "").split(",").map((s) => s.trim()).filter(Boolean);
  return configured.length ? configured : DEFAULTS[provider][kind];
}

/**
 * The rungs to try, in order, skipping any provider without a key.
 *
 * Exported so a caller can report an empty chain as "not configured" before
 * doing any work, and so `/health`-style diagnostics can say what is live.
 */
export function chain(kind: "text" | "vision"): Rung[] {
  const out: Rung[] = [];
  for (const provider of ["groq", "openrouter"] as Provider[]) {
    if (!Deno.env.get(KEY_VAR[provider])) continue;
    for (const model of models(provider, kind)) out.push({ provider, model });
  }
  // Same model twice in a row helps nobody.
  return out.filter((r, i, all) => all.findIndex((x) => x.provider === r.provider && x.model === r.model) === i);
}

export interface CompleteOptions {
  system: string;
  user: string;
  /** A `data:image/...;base64,...` URL. Its presence selects the vision chain. */
  image?: string | null;
  maxTokens: number;
  /**
   * Reject a reply that parses to nothing useful and try the next rung.
   *
   * Without this a model that answers with an apology counts as success, and
   * the caller gets "no food found" from a chain that never actually failed —
   * which is indistinguishable, from the outside, from an empty plate.
   */
  validate?: (text: string) => boolean;
}

export interface CompleteResult {
  text: string;
  model: string;
  provider: Provider;
}

/** Thrown when every rung failed. `detail` names each one and why. */
export class ChainError extends Error {
  constructor(readonly detail: string) {
    super(`no model answered — ${detail}`);
  }
}

/**
 * Try each rung until one gives a usable answer.
 *
 * Errors accumulate rather than being swallowed: when the whole chain fails,
 * the caller can say WHICH models failed and how. That matters more than it
 * sounds — the bug this replaced reported a backend problem as a bad photo,
 * and a vaguer message would have been no better.
 */
export async function complete(opts: CompleteOptions): Promise<CompleteResult> {
  const rungs = chain(opts.image ? "vision" : "text");
  if (!rungs.length) throw new ChainError("no provider key configured");

  const content = opts.image
    ? [
        { type: "image_url", image_url: { url: opts.image } },
        { type: "text", text: opts.user },
      ]
    : opts.user;

  const failures: string[] = [];
  for (const rung of rungs) {
    const label = `${rung.provider}/${rung.model}`;
    try {
      const res = await fetch(ENDPOINT[rung.provider], {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get(KEY_VAR[rung.provider])}`,
          "Content-Type": "application/json",
          // OpenRouter attributes usage by these. Harmless to Groq, which
          // ignores headers it doesn't know.
          "HTTP-Referer": "https://pocketathlete.com",
          "X-Title": "PocketAthlete",
        },
        body: JSON.stringify({
          model: rung.model,
          max_tokens: opts.maxTokens,
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content },
          ],
        }),
      });
      if (!res.ok) {
        failures.push(`${label}: ${res.status} ${(await res.text()).slice(0, 160)}`);
        continue;
      }
      const body = await res.json() as { choices?: { message?: { content?: string } }[] };
      const text = body?.choices?.[0]?.message?.content ?? "";
      if (!text.trim()) {
        failures.push(`${label}: empty reply`);
        continue;
      }
      if (opts.validate && !opts.validate(text)) {
        failures.push(`${label}: unusable reply`);
        continue;
      }
      return { text, model: rung.model, provider: rung.provider };
    } catch (e) {
      failures.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new ChainError(failures.join("; "));
}
