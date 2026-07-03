// =============================================================================
// Supabase Edge Function: stripe-webhook (Deno)
//
// Receives Stripe events, verifies the signature, and syncs the subscriptions
// table. Deploy WITHOUT JWT verification (Stripe can't send a Supabase JWT):
//
//   supabase functions deploy stripe-webhook --no-verify-jwt
//
// Then add the function URL as a webhook endpoint in the Stripe Dashboard and
// set STRIPE_WEBHOOK_SECRET to the signing secret.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// =============================================================================

import Stripe from "npm:stripe@17";
import { createClient } from "jsr:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req: Request) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    return new Response(`Invalid signature: ${err}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          await upsertFromSubscription(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await upsertFromSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.user_id;
        if (userId) {
          // Downgrade to the free baseline.
          await admin
            .from("subscriptions")
            .update({ status: "canceled", tier: "bronze", cancel_at_period_end: false })
            .eq("user_id", userId);
        }
        break;
      }
      default:
        break; // ignore unrelated events
    }
  } catch (err) {
    return new Response(`Handler error: ${err}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

async function upsertFromSubscription(sub: Stripe.Subscription) {
  const userId = sub.metadata?.user_id;
  const tier = sub.metadata?.tier;
  if (!userId || !tier) return; // can't attribute without our metadata

  const item = sub.items.data[0];
  const status = mapStatus(sub.status);

  await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      tier: status === "active" ? tier : "bronze",
      status,
      stripe_customer_id: sub.customer as string,
      stripe_subscription_id: sub.id,
      stripe_price_id: item?.price.id ?? null,
      current_period_start: toIso(item?.current_period_start),
      current_period_end: toIso(item?.current_period_end),
      cancel_at_period_end: sub.cancel_at_period_end,
    },
    { onConflict: "user_id" },
  );
}

// Map Stripe statuses onto our enum (active | canceled | past_due | incomplete).
function mapStatus(s: Stripe.Subscription.Status): string {
  if (s === "active" || s === "trialing") return "active";
  if (s === "past_due" || s === "unpaid") return "past_due";
  if (s === "canceled") return "canceled";
  return "incomplete";
}

function toIso(unixSeconds: number | null | undefined): string | null {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;
}
