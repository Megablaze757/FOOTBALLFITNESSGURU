// =============================================================================
// Which API the cue drafter talks to.
//
// It only spoke OpenRouter, which meant the 197 exercises with no coaching cues
// — the whole reason the script exists, and 221 of the 254 pages still under
// 200 words — were blocked on a paid key nobody had to hand.
//
// NVIDIA's inference API is free and already trusted by this project: the
// Cloudflare Worker carries its key and ranks it as a rung on the same ladder
// as the others. It also speaks the OpenAI chat-completions shape, which is
// the same shape OpenRouter speaks — so supporting it is a base URL, a header
// and a default model, not a second client.
//
// Chosen by WHICH KEY IS SET rather than by a flag, because a flag is a thing
// to remember and an unset key is a thing you already know about.
// =============================================================================

export type ProviderId = "nvidia" | "openrouter";

export interface Provider {
  id: ProviderId;
  url: string;
  model: string;
  headers: Record<string, string>;
  /** Whether a call to this provider costs money. Printed before spending any. */
  free: boolean;
}

/** Free, and good enough for three cues checked against a description. */
export const NVIDIA_DEFAULT_MODEL = "meta/llama-3.3-70b-instruct";
export const OPENROUTER_DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

/**
 * NVIDIA first when both are set.
 *
 * A drafting run is two hundred requests nobody is waiting on, so the free one
 * is right unless it is unavailable — the same trade the Worker's `freeOnly`
 * makes for the admin queue. Override with `--provider openrouter`.
 */
export function pickProvider(
  env: Record<string, string | undefined>,
  prefer?: ProviderId,
): Provider | null {
  const nvidia = env.NVIDIA_API_KEY?.trim();
  const openrouter = env.OPENROUTER_API_KEY?.trim();

  const build = (id: ProviderId): Provider | null => {
    if (id === "nvidia" && nvidia) {
      return {
        id,
        url: "https://integrate.api.nvidia.com/v1/chat/completions",
        model: env.NVIDIA_MODEL?.trim() || NVIDIA_DEFAULT_MODEL,
        headers: { Authorization: `Bearer ${nvidia}`, "Content-Type": "application/json" },
        free: true,
      };
    }
    if (id === "openrouter" && openrouter) {
      return {
        id,
        url: "https://openrouter.ai/api/v1/chat/completions",
        model: env.OPENROUTER_MODEL?.trim() || OPENROUTER_DEFAULT_MODEL,
        headers: {
          Authorization: `Bearer ${openrouter}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://pocketathlete.com",
          "X-Title": "PocketAthlete exercise cues",
        },
        free: false,
      };
    }
    return null;
  };

  if (prefer) return build(prefer);
  return build("nvidia") ?? build("openrouter");
}

/** What to tell somebody who set no key at all. */
export function missingKeyMessage(): string {
  return "No key set. NVIDIA_API_KEY is free and preferred — get one at build.nvidia.com. "
    + "OPENROUTER_API_KEY also works and is paid. Use --dry-run to see the prompt without either.";
}
