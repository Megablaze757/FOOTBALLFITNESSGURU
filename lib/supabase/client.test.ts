// Guards the auth flow type at the source level.
//
// This is a source-text test rather than a behavioural one on purpose. The bug
// it exists to prevent was invisible at runtime: lib/supabase/client.ts asked
// for `flowType: "implicit"`, @supabase/ssr's createBrowserClient hard-coded
// `flowType: "pkce"` after spreading those options, and nothing anywhere
// reported the conflict. Password resets failed for weeks, the code looked
// correct, and the only evidence was `pkce_`-prefixed rows in
// auth.one_time_tokens on the production database.
//
// A behavioural test can't catch it either — you'd need a browser, a real
// Supabase project and an emailed link. So this asserts the one thing that
// actually went wrong: which factory we call.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("./client.ts", import.meta.url), "utf8");

// Comments in that file necessarily name both the package and the function, to
// explain why they're avoided. Assert against the code alone.
const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the browser client is not built with @supabase/ssr", () => {
  assert.ok(
    !/@supabase\/ssr/.test(src),
    "createBrowserClient forces flowType:'pkce' regardless of what you pass, which breaks every emailed auth link opened in a different browser. This app is a static export with no server, so it has no reason to use the SSR package."
  );
  assert.ok(
    !/createBrowserClient/.test(src),
    "createBrowserClient overrides flowType — use createClient from @supabase/supabase-js"
  );
});

test("the implicit flow is requested", () => {
  assert.match(
    src,
    /flowType:\s*"implicit"/,
    "PKCE ties an emailed link to the browser that requested it; implicit works anywhere"
  );
  assert.match(
    src,
    /detectSessionInUrl:\s*true/,
    "implicit returns tokens in the URL fragment — without this nothing reads them"
  );
});
