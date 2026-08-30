# Drafting the missing coaching cues

## The gap

The bulk gym import brought in 257 movements. A person later wrote a real
how-to description for all of them — the part that teaches the movement. What
never got written was the part an athlete reads *first*:

```ts
{
  name: "Horizontal Leg Press",
  description: "Back flat against the seat, feet on the platform shoulder
                width. Press out to near-extension, then return under control
                until the knees are around 90°...",
  why: "Builds the legs.",   // ← the placeholder the importer generated
  cues: [],                  // ← nothing
}
```

197 rows look like that. The curated exercises next to them have three cues
each and a `why` that says something.

### It is also a live SEO defect

`why` is not just body copy — it is the **meta description** of the public
exercise page (`app/exercises/[slug]/page.tsx`). Counted off the built output:

```
 43 pages  "Builds the legs."
 37 pages  "Builds the whole body."
 28 pages  "Builds the back."
 20 pages  "Builds the core."
 20 pages  "Builds the chest."
 17 pages  "Builds the shoulders."
 14 pages  "Builds the biceps."
 13 pages  "Builds the triceps."
  5 pages  "Builds the forearms."
```

197 of 384 public exercise pages share one of nine strings, and the cues block
is hidden entirely when `cues` is empty. So these pages are both thin and
duplicated — on a site that was just given 600 new pages to rank. Filling this
in is the highest-value content work left.

## Why a model belongs here and not on the collection pages

The collection pages (`/collections/...`) were going to have an AI-written
intro. They don't, because the intro is *computable* — "35 recipes, the
cheapest is red lentil dhal at £1.11" is true by construction and updates
itself. Generated prose there would have bought a review step and a drift risk
for nothing.

This is the opposite case. There is no way to compute "chest up as you drive"
from a database, the gap is real, and — the part that makes it workable — **the
ground truth is already in the row**. The description says what the movement
is, so a draft can be checked against it, by a machine before a person and by
the person afterwards.

## What stops a bad cue reaching an athlete

Three things, in order of how much they matter.

**1. The output is a code change.** The catalogue is a compiled TypeScript
file. Nothing this script produces can publish itself; a draft becomes a diff
somebody reads and commits. That is a stronger gate than any admin queue.

**2. Every draft is validated against its own description**
(`lib/exercise-draft.ts`). The failure that matters is not clumsy writing —
anyone catches that. It is a cue that is fluent, confident and *about a
different exercise*: "keep the bar tight to your back" on a leg press, "squeeze
the glutes" on a chest press. Those read like coaching and are wrong in a way
that gets somebody hurt. So a cue may only name equipment the exercise actually
uses, and only name a body part its own row or description already names.

Also checked: house style (exactly three cues, 10–70 characters, no trailing
full stop — measured off the 187 curated entries, not invented); no therapeutic
or "best exercise" claims; and whether at least two of the three cues refer to
the description at all, which catches cues written from the name alone.

**3. The model's surface is two fields.** `why` and `cues`. It cannot touch the
name, description, muscles, equipment, demo animation, video or tempo. Tempo is
left alone deliberately — "Controlled" is the honest answer for most of these
and is already there.

None of this catches a cue that is merely *poor coaching*. That is what the
human review is for.

## Running it

```bash
# See the prompt and the queue size without spending anything
npm run draft:cues -- --dry-run

# Draft five and read them
OPENROUTER_API_KEY=... npm run draft:cues

# Draft the rest, once the five look right
OPENROUTER_API_KEY=... npm run draft:cues -- --all
```

`--limit` defaults to **5** on purpose. Drafting all 197 costs real money and
takes real minutes, and finding out the prompt was wrong two hundred requests
late is the expensive way to learn it.

Override the model with `OPENROUTER_MODEL`.

## Reviewing and applying

Two files land in `scripts/out/` (gitignored — regenerate rather than commit):

- `exercise-cues.json` — every draft, clean and held, with the reason each held
  one was held. **Held means "read this one", not "this one is wrong."** The
  checks lean towards holding: a leg press does train the glutes, so a cue
  mentioning them gets held even though it is fine, because the description
  does not name them. That costs you five seconds. The other kind of mistake
  costs an athlete a shoulder.
- `exercise-cues.ts` — the clean ones as `COACHING` lines, ready to paste.

To apply, paste the lines you accept into the `COACHING` record in
`lib/exercise-catalog.ts`. It is keyed by the **lowercased exercise name**, and
`build()` reads `cues` and `why` from it — so a pasted line replaces the
placeholder automatically and shows up as a normal diff.

Read each one against that exercise's description before you paste it. The
checks catch a cue about the wrong equipment; they do not catch a cue that is
simply not very good.
