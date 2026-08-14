import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Comments out, URLs intact.
 *
 * Needed because the fix's own comment quotes the broken expression it replaced
 * — `m?.subscribers.silver` — and the guard below matched that, failing against
 * code that was already correct. The `[^:]` is what stops the `//` in an https
 * URL being read as the start of a line comment.
 */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const OVERVIEW = code(readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8"));
const SHELL = readFileSync(new URL("../components/admin/AdminShell.tsx", import.meta.url), "utf8");

/**
 * THE OVERVIEW MUST SURVIVE MISSING DATA.
 *
 * `m?.subscribers.silver` guards only `m`. PostgREST returns an empty array when
 * a function is missing or returns nothing, and `[]` is truthy — so the optional
 * chain passed, `.silver` was read off undefined, and the whole page rendered
 * "Something went wrong". Caught by a browser probe with the RPCs stubbed empty,
 * which is exactly the state between deploying this and applying 0080.
 */
test("the overview does not crash when an RPC returns nothing", () => {
  assert.ok(!/m\?\.subscribers\.\w/.test(OVERVIEW),
    "subscribers is dereferenced without a guard, so an empty RPC result white-screens the page");
  for (const field of ["silver", "gold", "comped"]) {
    assert.match(OVERVIEW, new RegExp(`m\\?\\.subscribers\\?\\.${field}`),
      `${field} is not read defensively`);
  }
  // And the array/scalar shapes are normalised at the boundary rather than at
  // each read, so a new field cannot reintroduce the same bug.
  assert.match(OVERVIEW, /Array\.isArray\(metrics\) \? metrics\[0\] : metrics/,
    "the metrics shape is not normalised, so [] reaches the render as a truthy object");
});

/**
 * COST HONESTY REACHES THE SCREEN. lib/costs.ts marks each line measured or
 * estimated; if the UI drops that, the labelling is decoration and a guess is
 * displayed with the authority of a measurement.
 */
test("the cost table shows which figures are measured", () => {
  assert.match(OVERVIEW, /l\.basis === "measured"/,
    "the measured/estimated distinction never reaches the UI");
  assert.match(OVERVIEW, /costLines\(usage\)/, "the cost breakdown is not rendered");
  // The total is rendered from the same helper the lines come from, so they
  // cannot disagree.
  assert.match(OVERVIEW, /totalMonthlyCost\(usage\)/, "the total is computed some other way");
});

/**
 * The gate lives in one place. Repeating it per page is how one page eventually
 * ships without it — and there are five now, with more likely.
 */
test("the admin gate is in the shell, not copied into each page", () => {
  assert.match(SHELL, /role.*!==?.*admin|=== "admin"/, "the shell does not check the role");
  assert.match(SHELL, /router\.replace\("\/home"\)/, "a non-admin is not redirected");
  for (const page of ["growth", "money", "people", "ops"]) {
    const src = readFileSync(new URL(`../app/admin/${page}/page.tsx`, import.meta.url), "utf8");
    assert.match(src, /<AdminShell/, `${page} does not use the shell, so it may be ungated`);
    assert.ok(!/select\("role"\)/.test(src), `${page} re-implements the role check`);
  }
});

/** Every tab must point at a page that exists, or the nav is a set of 404s. */
test("every tab has a page behind it", () => {
  const hrefs = [...SHELL.matchAll(/href: "(\/admin[^"]*)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length >= 4, "the tab list is suspiciously short");
  for (const href of hrefs) {
    const path = href === "/admin" ? "../app/admin/page.tsx" : `..${href}/page.tsx`.replace("/admin", "/app/admin");
    assert.doesNotThrow(() => readFileSync(new URL(path, import.meta.url), "utf8"),
      `${href} is a tab with no page behind it`);
  }
});
