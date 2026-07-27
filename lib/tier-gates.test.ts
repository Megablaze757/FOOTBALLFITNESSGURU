import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PAID_TIER, CAPABILITY_TIER, can, PLANS, type Capability } from "./subscription";

/**
 * Guards against the bug class that bit when the plans changed: code that asks
 * "is this user gold?" instead of "can this user do X?".
 *
 * Every one of those looked harmless until Gold stopped being sold, at which
 * point paying subscribers silently lost features they'd bought — video
 * analysis, and the fast AI path. A tier id in a conditional is a time bomb
 * with the pricing page as its fuse.
 */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "out") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(name) && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

const ROOT = join(import.meta.dirname, "..");

test("no feature is gated on a literal tier id", () => {
  // Allowed: places that legitimately reason about the tier ladder itself.
  const allowed = [
    join("lib", "subscription.ts"),
    join("cloudflare", "src", "index.ts"), // has its own targeted test below
    join("app", "admin"),                  // paid-vs-free reporting
  ];
  const offenders: string[] = [];

  for (const dir of ["app", "components", "lib"]) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      const rel = file.slice(ROOT.length + 1);
      if (allowed.some((a) => rel.includes(a))) continue;
      const src = readFileSync(file, "utf8");
      src.split("\n").forEach((line, i) => {
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) return;
        if (/(?:tier|need|plan)\s*(?:===|!==)\s*["'](?:gold|silver)["']/.test(line)) {
          offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
        }
      });
    }
  }

  assert.deepEqual(offenders, [],
    `gate on a capability with can(), not a tier id:\n${offenders.join("\n")}`);
});

test("everything a paid plan advertises is actually reachable", () => {
  // If a capability needs a tier that isn't sold, someone pays and still can't
  // use it. That is exactly what happened to video analysis.
  for (const c of Object.keys(CAPABILITY_TIER) as Capability[]) {
    assert.ok(can(PAID_TIER, c), `paying for ${PAID_TIER} still can't ${c}`);
  }
});

test("the checkout doesn't let the client pick the price", () => {
  const worker = readFileSync(join(ROOT, "cloudflare", "src", "index.ts"), "utf8");
  const sold = PLANS.filter((p) => p.paid).map((p) => p.id);
  assert.deepEqual(sold, [PAID_TIER], "there should be exactly one plan on sale");

  const checkout = worker.slice(worker.indexOf("async function createCheckout"));
  const body = checkout.slice(0, checkout.indexOf("\n}\n"));

  // This validated a `tier` string sent by the browser, which coupled the
  // deployed site to the deployed Worker: rename the tier, ship one of them,
  // and every checkout 400s with "unknown tier" until the other catches up.
  // That is exactly what took payments down. The server picks the price.
  assert.ok(
    !/if \(tier !== "\w+"\) return json\(\{ error: "unknown tier" \}/.test(body),
    "createCheckout must not reject on a tier name the client supplied",
  );
  assert.ok(
    body.includes("env.STRIPE_PRICE_GOLD"),
    "createCheckout should read the price from config, not from the request",
  );
});

test("the fast AI path follows payment, not a tier name", () => {
  const worker = readFileSync(join(ROOT, "cloudflare", "src", "index.ts"), "utf8");
  assert.ok(
    !/const priority = \(await tierOf\(env, userId\)\) === "gold"/.test(worker),
    'priority was pinned to "gold", which pushed paying Pro users onto the free model queue',
  );
  assert.ok(/const priority = meetsTier\(/.test(worker), "priority should ask whether they paid");
});
