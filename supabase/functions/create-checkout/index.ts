// =============================================================================
// Supabase Edge Function: create-checkout (Deno)
//
// Authenticated. Creates a Stripe Checkout Session for the requested tier and
// returns its URL. The caller (frontend) redirects the user to it.
//
// Secrets:
//   STRIPE_SECRET_KEY
//   STRIPE_PRICE_SILVER, STRIPE_PRICE_GOLD   (Stripe price IDs)
//   APP_URL                                   (e.g. http://localhost:3000)
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Deploy:  supabase functions deploy create-checkout
// =============================================================================

import Stripe from "npm:stripe@17";
import { createClient } from "jsr:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);

const PRICE_BY_TIER: Record<string, string | undefined> = {
  silver: Deno.env.get("STRIPE_PRICE_SILVER"),
  gold: Deno.env.get("STRIPE_PRICE_GOLD"),
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Identify the caller from their JWT.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: "Invalid session" }, 401);

  const { tier } = await req.json().catch(() => ({ tier: null }));
  const priceId = PRICE_BY_TIER[tier];
  if (!priceId) return json({ error: `Unknown or unconfigured tier: ${tier}` }, 400);

  // Reuse an existing Stripe customer if we have one on file.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: existing } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let customerId = existing?.stripe_customer_id ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
  }

  const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/pricing?checkout=success`,
    cancel_url: `${appUrl}/pricing?checkout=cancelled`,
    // Metadata on both the session and the resulting subscription so every
    // webhook event can resolve the user and tier.
    metadata: { user_id: user.id, tier },
    subscription_data: { metadata: { user_id: user.id, tier } },
  });

  return json({ url: session.url }, 200);
});

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
