import { test } from "node:test";
import assert from "node:assert/strict";
import { jsonLd, graph, drillHowTo, faqPage, guideArticle, PUBLISHER } from "./schema";
import { SKILL_DRILLS } from "./skills";
import { SITE } from "./seo";

const URL = `${SITE}/drills/football/`;

test("a drill becomes a valid HowTo with ordered steps", () => {
  const d = SKILL_DRILLS[0];
  const h = drillHowTo(d, "Football", URL) as Record<string, unknown>;
  assert.equal(h["@type"], "HowTo");
  assert.equal(h.name, d.name);
  const steps = h.step as { position: number; text: string }[];
  assert.equal(steps.length, d.how.length);
  steps.forEach((s, i) => {
    assert.equal(s.position, i + 1, "steps must be numbered from 1 in order");
    assert.equal(s.text, d.how[i]);
  });
});

test("every drill produces markup that matches the page", () => {
  // Schema describing something the page doesn't show is a manual action, and
  // anything quoting it quotes a claim we never made in public.
  for (const d of SKILL_DRILLS) {
    const h = drillHowTo(d, "Football", URL) as Record<string, unknown>;
    assert.ok((h.step as unknown[]).length > 0, `${d.id} has no steps`);
    assert.ok(String(h.description).includes(d.coaching), `${d.id} drops its coaching cue`);
    const supply = h.supply as { name: string }[];
    assert.equal(supply[0].name, d.setup, `${d.id} misstates its setup`);
  }
});

test("solo drills claim no tools, partner drills do", () => {
  const solo = SKILL_DRILLS.find((d) => d.needs === "solo")!;
  const partner = SKILL_DRILLS.find((d) => d.needs === "partner")!;
  assert.equal((drillHowTo(solo, "Football", URL) as { tool: unknown[] }).tool.length, 0);
  assert.ok((drillHowTo(partner, "Football", URL) as { tool: unknown[] }).tool.length > 0);
});

test("drill ids are unique within a page's graph", () => {
  // Duplicate @id collapses nodes and silently loses drills.
  const ids = SKILL_DRILLS.filter((d) => d.sport === "football")
    .map((d) => (drillHowTo(d, "Football", URL) as { "@id": string })["@id"]);
  assert.equal(new Set(ids).size, ids.length);
});

test("faqPage pairs each question with its answer", () => {
  const f = faqPage([{ q: "How much?", a: "£15 a month." }]) as Record<string, unknown>;
  assert.equal(f["@type"], "FAQPage");
  const [entry] = f.mainEntity as { name: string; acceptedAnswer: { text: string } }[];
  assert.equal(entry.name, "How much?");
  assert.equal(entry.acceptedAnswer.text, "£15 a month.");
});

test("an article carries the dates answer engines look for", () => {
  const a = guideArticle({ url: URL, headline: "H", description: "D", keywords: ["k"] }) as unknown as Record<string, string>;
  assert.match(a.datePublished, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(a.dateModified, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(a.dateModified >= a.datePublished, "modified must not precede published");
  assert.equal(a.inLanguage, "en-GB");
});

test("the graph names one publisher, and nodes point at it", () => {
  const g = graph([guideArticle({ url: URL, headline: "H", description: "D", keywords: [] })]) as
    { "@graph": Record<string, unknown>[] };
  const orgs = g["@graph"].filter((n) => n["@type"] === "Organization");
  assert.equal(orgs.length, 1, "duplicate Organization nodes fragment the entity");
  assert.equal(orgs[0]["@id"], PUBLISHER["@id"]);
  const article = g["@graph"].find((n) => n["@type"] === "Article") as { publisher: { "@id": string } };
  assert.equal(article.publisher["@id"], PUBLISHER["@id"]);
});

test("output is valid JSON and safe to inline in a script tag", () => {
  const out = jsonLd(graph([faqPage([{ q: "</script><script>alert(1)</script>", a: "x" }])]));
  assert.ok(!out.includes("</script>"), "a raw closing tag would break out of the script element");
  assert.doesNotThrow(() => JSON.parse(out.replace(/\\u003c/g, "<")));
});

test("every graph parses as JSON", () => {
  const g = graph([
    guideArticle({ url: URL, headline: "H", description: "D", keywords: ["a", "b"] }),
    ...SKILL_DRILLS.slice(0, 5).map((d) => drillHowTo(d, "Football", URL)),
  ]);
  const parsed = JSON.parse(jsonLd(g).replace(/\\u003c/g, "<"));
  assert.equal(parsed["@context"], "https://schema.org");
  assert.ok(Array.isArray(parsed["@graph"]));
});
