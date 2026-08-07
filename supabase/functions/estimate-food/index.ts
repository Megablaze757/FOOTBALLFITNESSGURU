// =============================================================================
// Supabase Edge Function: estimate-food (Deno)
//
// Reads a photo of a meal and returns its nutrition. Authenticated.
// Returns { items: [{name, qty, unit, kcal, protein, carbs, fats}], model }.
//
// WHY THIS EXISTS WHEN THE WORKER ALREADY HAS THE ROUTE.
//
// The Cloudflare Worker has a perfectly good `/estimate-food` with a vision
// chain. The Worker RUNNING IN PRODUCTION is built from source that is not in
// this repository, and it has diverged: `/health` reports version 2026-08-04.2
// with an eight-model chain of which not one is vision-capable, and it emits no
// `vision` field at all. Every photo an athlete has ever taken was posted to a
// text-only model, which of course saw nothing, and the app told them the
// picture was unclear and invited them to take another. It could never have
// worked.
//
// Fixing it in the Worker means getting that diverged source back under version
// control and re-pasting it into the Cloudflare dashboard by hand. That is the
// right long-term fix and it is not a thing the app can do for itself.
//
// This route can be deployed with one command, from source that IS in version
// control:
//
//   supabase functions deploy estimate-food
//
// The client asks `/health` what the Worker can do and comes here for photos
// when the answer is "not vision" — see backendCapabilities() in lib/api.ts. So
// the photo path works as soon as this is deployed, and goes back to the Worker
// on its own the day the Worker can see again. Nothing to switch over.
//
// The provider chain lives in ../_shared/llm.ts: Groq first for speed, then
// OpenRouter for breadth. No Anthropic key anywhere in this app.
//
// Secrets: GROQ_API_KEY and/or OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
// Deploy:  supabase functions deploy estimate-food
// =============================================================================

import { complete, chain, ChainError } from "../_shared/llm.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

/**
 * Base64 is ~4/3 of the bytes it encodes, so this is roughly a 1.1MB image.
 *
 * The client downscales to ~768px and re-encodes as JPEG before sending — a
 * phone camera produces 3-5MB a shot, which is slow on a gym's signal and buys
 * no accuracy at all for identifying a chicken breast. This is the backstop for
 * a client that didn't.
 */
const MAX_IMAGE_CHARS = 1_500_000;

/**
 * The prompt is deliberately the Worker's, word for word.
 *
 * Same reasoning as the model list: two routes that answer the same question
 * with different prompts give the same athlete different numbers for the same
 * plate. If this is edited, edit `estimateFood` in cloudflare/src/index.ts too.
 *
 * THE PORTION IS THE WHOLE PROBLEM. Naming the food is easy. Deciding whether
 * that is 90g of rice or 250g is where nearly all the error lives, and an
 * estimate that is confidently 160% of the truth is worse than no estimate —
 * someone eats to it for a month and cannot work out why nothing moved.
 */
const PHOTO_SYS =
  "You estimate the nutrition of a meal an athlete has photographed. " +
  "Work out the portion from the picture before you estimate anything else. Use whatever is in " +
  "shot for scale: a dinner plate is about 27cm across and a side plate about 20cm, a fork is " +
  "about 19cm long, a standard mug holds about 300ml, and a closed fist is roughly 150-200g of " +
  "a dense food. State which reference you used in the name, e.g. \"Rice (fills a third of a " +
  "27cm plate)\". " +
  "Estimate the FOOD, not the container — a half-empty bowl is a half portion. " +
  "If something is stacked or partly hidden, say so in the name and estimate the visible part " +
  "plus a conservative allowance, e.g. \"Chips (pile, lower layer hidden — estimated)\". " +
  "Never invent a food you cannot see. If the picture is too dark or blurred to identify " +
  "anything, return an empty items array rather than guessing. ";

const TEXT_SYS =
  "You estimate the nutrition of a meal an athlete describes in plain language. " +
  "Where they give a household measure, convert it: a heaped tablespoon is about 15g dry rice " +
  "or 20g peanut butter, a slice of medium bread about 40g, a mug of dry oats about 90g, a " +
  "supermarket chicken breast about 170g, a large egg about 58g, a tin of tuna about 145g " +
  "drained. If they give no quantity at all, use a normal adult portion and say so in the name. ";

const COMMON_SYS =
  "Output ONLY valid minified JSON: {items:[{name:string,qty:number,unit:\"g\"|\"ml\"|\"each\",kcal:number,protein:number,carbs:number,fats:number}]}. " +
  "One entry per distinct food. Use UK supermarket products and typical British home cooking. " +
  "For rice, pasta, couscous and oats give the DRY weight, and say \"(dry)\" in the name. " +
  "Include cooking fat if the dish obviously used it — a fried egg or a stir fry carries oil the " +
  "athlete did not mention and it is often 100+ kcal. " +
  "Round quantities to something a person would say: to the nearest 10g under 200g, nearest 25g " +
  "above. Never give a quantity to the gram. " +
  "Put any real uncertainty in the name, in brackets, in plain words. Do not hedge in the numbers. " +
  "kcal must be the total for the stated qty, not per 100g, and must be greater than zero, and must " +
  "be consistent with the macros you give (protein and carbs 4 kcal/g, fat 9 kcal/g, within 10%). " +
  "No prose outside the JSON.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (!chain("vision").length) return json({ error: "AI not configured" }, 503);

  // Authenticated, like every other route that spends money. The Worker checks
  // the subscription tier and a per-user budget as well; this route cannot see
  // either, so it verifies identity and leans on Supabase's own rate limits.
  // If this becomes the permanent home for the photo path rather than a bridge
  // while the Worker is fixed, the tier gate needs to move here too.
  const user = await authUser(req);
  if (!user) return json({ error: "unauthorized" }, 401);

  const { text, image } = await req.json().catch(() => ({})) as { text?: string; image?: string };
  const meal = (text ?? "").trim().slice(0, 300);

  const photo = typeof image === "string" && image.startsWith("data:image/") ? image : null;
  if (image && !photo) return json({ error: "image must be a data: URL" }, 400);
  if (photo && photo.length > MAX_IMAGE_CHARS) {
    return json({ error: "that photo is too large — try again, or describe the meal instead" }, 413);
  }
  if (!photo && meal.length < 2) return json({ error: "text or image required" }, 400);

  try {
    const { text: raw, model, provider } = await complete({
      system: (photo ? PHOTO_SYS : TEXT_SYS) + COMMON_SYS,
      user: photo
        ? (meal ? `Estimate this meal. The athlete also says: ${meal}` : "Estimate this meal from the photo.")
        : `The athlete ate: ${meal}`,
      image: photo,
      // A photo produces more items than a typed sentence usually does, so it
      // needs a little more room to finish the JSON.
      maxTokens: photo ? 900 : 700,
      // A rung that answers with prose, an apology or half a JSON object is a
      // failed rung — fall through to the next rather than reporting "no food
      // found", which is what an empty plate looks like and is not the same
      // thing at all. A deliberate `{"items":[]}` passes, because the prompt
      // asks for exactly that when the picture is too dark to read.
      validate: (t) => parseFoodItems(t) !== null || looksLikeEmptyItems(t),
    });
    return json({ items: parseFoodItems(raw) ?? [], model: `${provider}/${model}` }, 200);
  } catch (e) {
    // Names WHICH models failed and why. The whole reason this route exists is
    // that the old failure mode blamed the athlete's photo for a backend
    // problem; repeating that with a vaguer message would be worse, not better.
    if (e instanceof ChainError) return json({ error: e.message }, 502);
    return json({ error: String(e) }, 500);
  }
});

/** Who is calling. Uses the caller's own JWT, so RLS and expiry both apply. */
async function authUser(req: Request): Promise<{ id: string } | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return null;
  try {
    const res = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey: anon } });
    if (!res.ok) return null;
    const body = await res.json() as { id?: string };
    return body?.id ? { id: body.id } : null;
  } catch {
    return null;
  }
}

/**
 * Did the model deliberately answer "I can see nothing"?
 *
 * `parseFoodItems` returns null both for a broken reply and for a well-formed
 * `{"items":[]}`, and those need opposite handling: one should fall through to
 * the next model, the other is the final answer for a photo of a dark room.
 */
function looksLikeEmptyItems(raw: string): boolean {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return false;
  try {
    const parsed = JSON.parse(match[0]) as { items?: unknown };
    return Array.isArray(parsed.items) && parsed.items.length === 0;
  } catch {
    return false;
  }
}

/**
 * Same shape, same clamping and same rounding as the Worker's parser.
 *
 * Kept identical deliberately — see the note on the prompt. A caller must not
 * be able to tell which backend answered by looking at the numbers.
 */
function parseFoodItems(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { items?: unknown };
    const items = parsed.items;
    if (!Array.isArray(items) || items.length === 0) return null;
    const out = items
      .map((i) => i as Record<string, unknown>)
      .filter((i) => typeof i.name === "string" && Number(i.kcal) > 0)
      .map((i) => ({
        name: String(i.name).slice(0, 60),
        qty: Math.max(1, Math.round(Number(i.qty) || 1)),
        unit: i.unit === "ml" ? "ml" : i.unit === "each" ? "each" : "g",
        kcal: Math.round(Number(i.kcal) || 0),
        protein: Math.round(Number(i.protein) || 0),
        carbs: Math.round(Number(i.carbs) || 0),
        fats: Math.round(Number(i.fats) || 0),
      }));
    return out.length ? out : null;
  } catch {
    return null;
  }
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
