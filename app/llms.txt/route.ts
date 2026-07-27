import { guideSports, guidePages, sportLabel, SITE } from "@/lib/seo";
import { skillsForSport } from "@/lib/skills";
import { PLANS, TRIAL_DAYS } from "@/lib/subscription";

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

### Drill collections
${sports.map((s) => `- [${sportLabel(s)} skill drills](${SITE}/drills/${s}/) — ${skillsForSport(s).length} drills, ${skillsForSport(s).filter((d) => d.needs === "solo").length} doable alone`).join("\n")}

## Key pages

- [Home](${SITE}/)
- [Pricing](${SITE}/plans/)
- [All position guides](${SITE}/guides/)
- [All drills](${SITE}/drills/)
- [Privacy policy](${SITE}/privacy/)
- [Terms](${SITE}/terms/)

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
