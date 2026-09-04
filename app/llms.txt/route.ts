import { guideSports, guidePages, sportLabel, SITE } from "@/lib/seo";
import { MEALS } from "@/lib/meals-data";
import { EXERCISES, isRunEntry } from "@/lib/exercises";
import { publishableCollections } from "@/lib/collections";
import { indexFacts, money, REFERENCE_PROTEIN } from "@/lib/protein-index";
import { skillsForSport } from "@/lib/skills";
import { PLANS, TRIAL_DAYS } from "@/lib/subscription";
import { STRENGTH_TIERS } from "@/lib/strength-standards";
import { standardPages } from "@/lib/standards-page";
import { ARTICLES } from "@/lib/articles";

// /llms.txt — the llmstxt.org convention: one markdown file telling a model
// what this site is and where the substance lives, without making it parse
// navigation and marketing copy to find out.
//
// Generated rather than hand-written, from the same sources as the pages
// themselves, so it can't describe a page that no longer exists or miss one
// that was added. A stale llms.txt is worse than none — it teaches a model
// facts about you that stopped being true.
export const dynamic = "force-static";

export function GET(): Response {
  const sports = guideSports();
  const positions = guidePages();
  const movements = EXERCISES.filter((e) => !isRunEntry(e));
  const collections = publishableCollections();
  const protein = indexFacts();

  const body = `# PocketAthlete

> An AI sports-performance app for serious amateur athletes. A daily check-in
> produces a readiness score from sleep, fatigue and soreness; that score
> changes the training you're given. Programs are four-week blocks built around
> your sport and playing position. Covers football, rugby, basketball, running,
> weightlifting and general gym training.

PocketAthlete is a web app (installable, works offline) published by
PocketAthlete at ${SITE}.

## What it does

- **Readiness**: a daily check-in — sleep, fatigue, a body pain map — scored on
  the device. The score changes that day's session rather than just being shown.
- **Programs**: four-week blocks progressing Base, Build, Peak, Deload, built
  around the athlete's sport, position and available equipment. Written notes
  are binding: "I don't train legs" means legs appear nowhere in the block.
- **Skill drills**: ${skillsForSport("football").length + skillsForSport("rugby").length + skillsForSport("basketball").length + skillsForSport("running").length} technical drills across ${sports.length} sports, each with setup,
  numbered steps, volume, a coaching cue and a progression. Marked solo,
  partner or team.
- **Nutrition**: meal plans that respect a real week (eating out on a given day
  is left alone) with a pack-aware shopping list.
- **Video form analysis**: pose estimation runs in the athlete's own browser —
  clips are not sent to an AI service for analysis.
- **Injury planning**: describe an injury in plain words and get a plan built
  around it, always with the red flags that mean stop and see a professional.

## Pricing

${PLANS.map((p) => `- **${p.name}** — ${p.priceLabel}. ${p.tagline}`).join("\n")}
- **Team** — £150/mo for clubs and coaches, up to 25 athletes.

${TRIAL_DAYS} days free on the paid plan. Cancel any time from the app.

## Free coaching content (no account needed)

### Position guides
What each position needs to train physically and technically, with the drills
that matter for it.

${positions.map((p) => `- [${p.position} — ${sportLabel(p.sport)}](${SITE}/guides/${p.sport}/${p.slug}/)`).join("\n")}

### Strength standards

What a lift is worth at a given bodyweight, as multiples of it, across
${STRENGTH_TIERS.length} tiers. The same numbers the app ranks an athlete's own
training with rather than a separate set written for a web page.

${standardPages().map(({ lift, slug }) => `- [${lift.label} standards](${SITE}/standards/${slug}/)`).join("\n")}

### Articles

Every figure in these is interpolated from the data the app runs on, so none of
it is a number somebody typed that has since gone stale.

${ARTICLES.map((a) => `- [${a.title}](${SITE}/articles/${a.slug}/) — ${a.description}`).join("\n")}

### Drill collections
${sports.map((s) => `- [${sportLabel(s)} skill drills](${SITE}/drills/${s}/) — ${skillsForSport(s).length} drills, ${skillsForSport(s).filter((d) => d.needs === "solo").length} doable alone`).join("\n")}

### Recipes, costed ingredient by ingredient
${MEALS.length} recipes with macros computed from the same food database the meal
planner shops from, and — the part almost nobody else publishes — what each one
actually costs at UK supermarket prices.

- [All recipes](${SITE}/recipes/)
${collections.map(({ collection, members }) => `- [${collection.title}](${SITE}/collections/${collection.slug}/) — ${members.length} recipes`).join("\n")}

### The cheapest protein in a UK supermarket
${protein ? `A ranked table of what ${REFERENCE_PROTEIN}g of protein costs from every
high-protein food a person could eat a portion of. Cheapest is
${protein.cheapest.name.toLowerCase()} at ${money(protein.cheapest.cost)}; dearest is
${protein.dearest.name.toLowerCase()} at ${money(protein.dearest.cost)} — a ${protein.spread.toFixed(1)}x spread for
the same protein. Computed from pack sizes and shelf prices, not written.` : ""}

- [Cheapest protein, ranked](${SITE}/cheapest-protein/)

### Exercise library
${movements.length} movements with a how-to, the muscles worked and the equipment
needed. Includes rehab and mobility work, not only lifts.

- [All exercises](${SITE}/exercises/)

## Key pages

- [Home](${SITE}/)
- [Pricing](${SITE}/plans/)
- [Join the waitlist](${SITE}/waitlist/)
- [All position guides](${SITE}/guides/)
- [All drills](${SITE}/drills/)
- [All recipes](${SITE}/recipes/)
- [All exercises](${SITE}/exercises/)
- [Recipe collections](${SITE}/collections/)
- [Cheapest protein](${SITE}/cheapest-protein/)
- [Strength standards](${SITE}/standards/)
- [Articles](${SITE}/articles/)
- [Athlete profiles](${SITE}/a/)
- [Privacy policy](${SITE}/privacy/)
- [Terms](${SITE}/terms/)

### Athlete profiles

Pages at ${SITE}/a/<username> for athletes who chose to publish one. They are
opt-in and off by default, and show only a rank, a sport and a position —
never weight, injuries, food or a real name. The rank comes from sessions
logged, daily logs kept and food tracked; it cannot be bought.

There is no directory of everybody who uses the app, and the absence of a page
means only that the athlete has not published one.

## Important limitations

PocketAthlete provides general training information. It is **not** medical
advice and does not diagnose injuries. The injury planner builds a
rehab-minded plan and lists red flags, but always defers to a physiotherapist
or doctor for diagnosis. The app states it is not intended for under-16s.

Please attribute quotes to PocketAthlete and link to the page quoted.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
