# Using a model to advertise this, without getting the account banned

## The split that matters

Not "automatic vs manual" — **drafting vs publishing**. A model is good at the
first and must not be given the second.

| Works | Doesn't |
|---|---|
| Drafting copy from numbers the app computed | Auto-posting at volume |
| Catching a claim before a person sends it | Auto-managing ad spend |
| Turning a data change into a weekly post | Generating pages to rank |

Auto-posting is the one people ask for and it is the one that backfires.
The blocker isn't API access, it's that generic copy earns no engagement and
platforms demote accounts that consistently post it. You would be paying to
make your own accounts worse.

## The legal part, which is not optional

This is a **fitness and nutrition product advertising in the UK**. That means
the CAP Code and the ASA, and it applies to your marketing emails and your own
brand social posts, not just paid ads.

The rules a model will walk straight into:

- **CAP s.13** — you may not claim a *rate or amount* of weight loss outside a
  medically supervised programme. "Lose 10kg by summer" is the first line most
  models write.
- **GB Nutrition and Health Claims Register** — a health claim about food is
  only permitted in its authorised wording. "Boosts metabolism", "burns fat"
  and "detox" are not on the register.
- **CAP s.12** — only a licensed medicine may claim to treat, cure or prevent
  anything. A meal planner is not one.
- **CAP s.3** — objective claims need evidence held *before* publication. That
  covers "the UK's #1", "clinically proven", and any guarantee of outcome.
- **CAP s.13.3** — weight-control marketing must not be directed at under-18s.

`lib/ad-claims.ts` encodes these as a sieve. It returns findings at two
severities: **blocked** (cannot be sent, whatever evidence you hold) and
**review** (defensible *if* you hold the evidence — a superlative, a saving, a
scarcity claim).

**It is a sieve, not a solicitor.** It catches the phrasings a model reaches
for. It cannot judge overall impression, which is what the ASA actually rules
on. Everything it passes still gets read by a person.

## The asset worth advertising

You have something almost nobody in this market does: **every ingredient is
costed**. That makes the cheapest protein in a UK supermarket a computable
fact rather than an opinion:

```
Cheapest 30g of protein:  red lentils        £0.31   (120g)
Dearest:                  cooked king prawns £3.19   (175g)
                                             10.2× spread
```

`/cheapest-protein` publishes the whole ranked list with its method stated. It
is a data product, not content — nobody wrote it, and correcting a pack price
in the food database corrects the page on the next build. That is the kind of
page that earns links, which is the only SEO that compounds.

### Two rules decide what counts as a protein source

Both are needed; either alone publishes something embarrassing.

- **The share test** is statutory: retained EU Reg 1924/2006 lets a food be
  called "high in protein" at ≥20% of energy from protein. Using the legal
  definition is what makes the page defensible — and it removes stock cubes and
  ground spices, which are cheap per gram of protein and are not food anybody
  eats for protein.
- **The portion test** is honest: the page answers "the cheapest 30g of
  protein", so you have to be able to eat 30g of protein from it. Soy sauce
  passes the share test and would take 375ml. Broccoli would take a kilogram.

Share test only, and soy sauce is a protein source. Portion test only, and so
are stock cubes.

## The weekly brief

```bash
npm run brief -- --dry-run                      # facts and prompt, costs nothing
OPENROUTER_API_KEY=... npm run brief
OPENROUTER_API_KEY=... npm run brief -- --athletes 14 --waitlist 62
```

It computes the week's facts, asks the model for an email and three social
posts, and checks the result. Output is `scripts/out/weekly-brief.md`.

The two flags are numbers off the admin dashboard. Anything you don't pass is
**left out of the brief entirely** rather than guessed at — a model handed a
blank for "new athletes this week" will fill it in.

### What gets checked

1. **Every number must come from the data.** Prices are checked absolutely;
   whole numbers from 10 up are checked too. A model that writes "under 30p"
   because it scans better than "31p" has turned the one genuinely checkable
   claim in the post into a false one, and a price is exactly what a reader
   will check.
2. **Every field goes through the CAP filter** — subject line included.
3. **House limits** — subject under 60 characters, three social posts under 280,
   email 80–150 words.

### Sending

Nothing here sends. Take the email to **Admin → Waitlist Announce**, which is
idempotent, resumable, has a dry run and never mails an unsubscribe. Dry run
first.

Under **PECR**, marketing email needs consent or soft opt-in. The waitlist
consented; a list from anywhere else has not.

## What is deliberately not built

No social API, no ad account, no scheduler, no posting. The bottleneck worth
removing is writing the first draft — not the decision to publish.
