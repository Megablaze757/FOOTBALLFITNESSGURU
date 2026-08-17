// Resend delivery-status webhook. Deploy without JWT verification because
// authenticity is provided by Resend's signed Svix headers.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_WEBHOOK_SECRET
// Deploy:  supabase functions deploy resend-webhook --no-verify-jwt

import { createClient } from "jsr:@supabase/supabase-js@2";
import { Webhook } from "npm:svix";

type DeliveryStatus = "sent" | "delivered" | "delayed" | "failed" | "bounced" | "complained";
interface ResendEvent {
  type: string;
  data?: {
    email_id?: string;
    bounce?: { message?: string };
    failed?: { reason?: string };
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!secret) return response({ error: "RESEND_WEBHOOK_SECRET is not configured" }, 500);

  const payload = await request.text();
  let event: ResendEvent;
  try {
    event = new Webhook(secret).verify(payload, {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    }) as ResendEvent;
  } catch {
    return response({ error: "Invalid webhook signature" }, 400);
  }

  const status = statusFor(event.type);
  const providerId = event.data?.email_id;
  if (!status || !providerId) return response({ ignored: true }, 200);

  const errorMessage = event.data?.bounce?.message ?? event.data?.failed?.reason ?? null;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await supabase.from("email_delivery_logs")
    .update({ status, error_message: errorMessage })
    .eq("provider_id", providerId)
    // Resend documents at-least-once delivery and does not guarantee event
    // ordering. This prevents a late "delayed" event from downgrading an
    // already delivered/bounced/complained message.
    .in("status", allowedPrevious(status));
  if (error) return response({ error: error.message }, 500);
  return response({ updated: true }, 200);
});

function statusFor(type: string): DeliveryStatus | null {
  const statuses: Record<string, DeliveryStatus> = {
    "email.sent": "sent",
    "email.delivered": "delivered",
    "email.delivery_delayed": "delayed",
    "email.failed": "failed",
    "email.bounced": "bounced",
    "email.complained": "complained",
  };
  return statuses[type] ?? null;
}

function allowedPrevious(status: DeliveryStatus): string[] {
  if (status === "sent") return ["attempted", "sent"];
  if (status === "delayed") return ["attempted", "sent", "delayed"];
  if (status === "delivered") return ["attempted", "sent", "delayed", "delivered"];
  if (status === "failed") return ["attempted", "sent", "delayed", "failed"];
  if (status === "bounced") return ["attempted", "sent", "delayed", "delivered", "bounced"];
  return ["attempted", "sent", "delayed", "delivered", "bounced", "complained"];
}

function response(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
