// Run with: npx deno test --allow-env --allow-net supabase/functions/_shared/gate.test.ts
//
// THE UI IS NOT A PERMISSION CHECK. The paid features were gated in exactly one
// place — the Cloudflare Worker — while the Edge Functions that answer the same
// requests had no tier check at all. Unsetting NEXT_PUBLIC_API_URL moved every
// call onto the ungated path, and the buttons being hidden from free users in
// the UI stopped mattering the moment anyone POSTed to the function URL with
// their own token.
//
// These tests exist because a gate that fails open is indistinguishable from no
// gate at all until someone reads the bill.

import { assertEquals } from "jsr:@std/assert@1";
import { requireTier } from "./gate.ts";

const KEYS = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];

function withEnv(fn: () => Promise<void>) {
  const saved = new Map(KEYS.map((k) => [k, Deno.env.get(k)]));
  Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service");
  return fn().finally(() => {
    for (const [k, v] of saved) { if (v === undefined) Deno.env.delete(k); else Deno.env.set(k, v); }
  });
}

/** Stubs the three lookups the gate makes: whoami, suspension, subscription. */
function stub({ user = "u1", suspended = null, tier = null, status = null, whoamiOk = true, subsOk = true }: {
  user?: string | null; suspended?: string | null; tier?: string | null;
  status?: string | null; whoamiOk?: boolean; subsOk?: boolean;
} = {}) {
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/auth/v1/user")) {
      return whoamiOk && user
        ? new Response(JSON.stringify({ id: user }), { status: 200 })
        : new Response("{}", { status: 401 });
    }
    if (u.includes("profiles?")) {
      return new Response(JSON.stringify([{ suspended_at: suspended }]), { status: 200 });
    }
    if (u.includes("subscriptions?")) {
      return subsOk
        ? new Response(JSON.stringify(tier ? [{ tier, status }] : []), { status: 200 })
        : new Response("boom", { status: 500 });
    }
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
}

const req = (token = "tok") =>
  new Request("https://x/fn", { method: "POST", headers: { Authorization: `Bearer ${token}` } });

Deno.test("no Authorization header is 401", () =>
  withEnv(async () => {
    stub();
    const gate = await requireTier(new Request("https://x/fn", { method: "POST" }), "silver", "Programs");
    assertEquals(gate.denied?.status, 401);
  }));

Deno.test("a token Supabase rejects is 401", () =>
  withEnv(async () => {
    stub({ whoamiOk: false });
    assertEquals((await requireTier(req(), "silver", "Programs")).denied?.status, 401);
  }));

/**
 * THE ONE THAT MATTERS. A real, signed-in, free account asking for a paid
 * feature. Before this gate existed the Edge Function simply answered.
 */
Deno.test("a free account is refused a paid feature with 402", () =>
  withEnv(async () => {
    stub({ tier: null });
    const gate = await requireTier(req(), "silver", "Training programs");
    assertEquals(gate.denied?.status, 402);
    const body = await gate.denied!.json();
    assertEquals(body.upgrade, "silver");
    assertEquals(body.tier, "bronze");
    assertEquals(body.error, "Training programs is part of Pro");
  }));

Deno.test("a lapsed subscription is not an active one", () =>
  withEnv(async () => {
    stub({ tier: "silver", status: "canceled" });
    assertEquals((await requireTier(req(), "silver", "Programs")).denied?.status, 402);
  }));

Deno.test("an active subscriber is allowed through", () =>
  withEnv(async () => {
    stub({ tier: "silver", status: "active" });
    const gate = await requireTier(req(), "silver", "Programs");
    assertEquals(gate.denied, undefined);
    assertEquals(gate.tier, "silver");
  }));

Deno.test("gold satisfies a silver requirement, silver does not satisfy gold", () =>
  withEnv(async () => {
    stub({ tier: "gold", status: "active" });
    assertEquals((await requireTier(req(), "silver", "F")).denied, undefined);
    stub({ tier: "silver", status: "active" });
    assertEquals((await requireTier(req(), "gold", "F")).denied?.status, 402);
  }));

Deno.test("a deactivated account is refused even on a paid tier", () =>
  withEnv(async () => {
    stub({ tier: "gold", status: "active", suspended: "2026-01-01T00:00:00Z" });
    const gate = await requireTier(req(), "silver", "Programs");
    assertEquals(gate.denied?.status, 403);
    assertEquals((await gate.denied!.json()).suspended, true);
  }));

/**
 * FAILS CLOSED. If the subscription lookup breaks we cannot show that anyone
 * has paid, and the safe reading of "I don't know" is the free tier. Getting
 * this backwards gives the product away whenever the database hiccups.
 */
Deno.test("a failed subscription lookup denies rather than allows", () =>
  withEnv(async () => {
    stub({ subsOk: false });
    assertEquals((await requireTier(req(), "silver", "Programs")).denied?.status, 402);
  }));

/**
 * Without the service-role key the gate cannot read a subscription at all, so
 * everybody would read as bronze — noisy, but the correct direction. It must
 * never be the case that a missing secret opens the door.
 */
Deno.test("a missing service-role key denies rather than allows", async () => {
  const saved = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "anon");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  stub({ tier: "gold", status: "active" });
  try {
    assertEquals((await requireTier(req(), "silver", "Programs")).denied?.status, 402);
  } finally {
    if (saved !== undefined) Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", saved);
  }
});
