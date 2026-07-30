# PocketAthlete — six months after launch

**Assumes:** launch around August 2026, one developer, one paid plan at £20/mo, UK
football season running August to May.

This is a plan for **keeping people**, not for adding features. Almost everything
below exists to move one number, and each month says which.

---

## The only number that matters first

A subscription app dies at **D30 retention**, not at signup. At £20/mo, someone
who stays four months is worth four times someone who stays one — and costs the
same to acquire. Before adding anything new, know these three:

| Metric | What it tells you | Rough target by month 6 |
|---|---|---|
| **D7 retention** | Did onboarding work? | 40%+ |
| **D30 retention** | Is it a habit? | 20%+ |
| **Trial → paid** | Is the paywall in the right place? | 25%+ |

You already have `lib/funnel.ts` and the admin funnel view. **Look at it weekly.**
A roadmap that isn't corrected by real numbers is a wish list — if month 1's data
contradicts month 3's plan, the data wins.

---

## Month 1 (August) — Make the habit stick

Season starts. Motivation is naturally at its highest all year, which means this
month flatters you. Don't read early numbers as proof of anything.

**Ship:**

- **Turn push notifications on.** The code is written; the VAPID keys aren't
  generated. This is the single highest-leverage thing on the whole list and it's
  a config task, not a build.
- ~~**Streaks.** A visible run of check-in days, with one "rest day" a week.~~
  **Dropped — this contradicts the product now.** Written before the UX pass,
  which found the opposite problem: users said the app felt like "a lot of
  commitment" and "a second job". So streaks were *de-emphasised* — "Daily
  quests" became "If you fancy it today" with a Hide that sticks, "Check-ins 3/7"
  lost its denominator, and "keep the streak alive" came off the Rewards page. A
  forgiving streak is still a streak, and building a bigger one now would be
  shipping against the clearest feedback we have. See `docs/UI-AUDIT.md`.

  The retention goal this was meant to serve stands. Pursue it by making the app
  more *useful* on the day someone opens it, not by raising the cost of missing a
  day.
- **Reminder timing that learns.** Send at the hour they usually check in, not a
  fixed 8pm. Falls back to 7pm on no data.
- **First session in under three minutes.** Time the current onboarding with a
  stopwatch. Every question that isn't needed for the first program gets moved to
  later.

  *Partly done.* Onboarding already ends on "Build my first program" as the
  primary action, Home leads with one derived next action, and the check-in has a
  three-tap quick mode. **Still untimed with a stopwatch** — the goal-builder quiz
  between "Build my program" and an actual program is the unmeasured stretch, and
  it's the one that decides whether a new account ever sees the product work.

**Done when:** 60% of new accounts complete a second check-in within 7 days.

---

## Month 2 (September) — Make progress undeniable

People quit because they can't *see* it working. Per-exercise graphs (just built)
are the start of the answer, not the whole of it.

**Ship:**

- **Monthly progress report.** Auto-generated on the 1st, pushed as a
  notification: lifts up, sessions done, best week. Uses `lib/exercise-stats.ts`.
- **Benchmark re-tests.** Prompt a re-test 6 weeks after the last one, then show
  the before/after side by side. `app/(app)/benchmarks` already stores the data.
- **Shareable PR cards.** `components/ShareButton.tsx` exists — point it at
  personal bests. A teammate seeing a PR card is your cheapest acquisition
  channel and it costs nothing per install.
- **"Why this session?"** One line on each workout explaining what it's for.
  Compliance rises when people know the reason.

**Done when:** D30 retention crosses 20%, and 10% of users have shared something.

---

## Month 3 (October) — Bring the team

Social accountability is the strongest retention mechanism there is, and it is
also a referral loop. You already have `squad`, `CoachChat`, `AssignProgram` and
`TeamExercises` — this month is about making them worth opening.

**Ship:**

- **Squad challenges.** Weekly team target ("500 minutes between us"), visible
  contribution per player.
- **A coach dashboard worth paying for.** Who's trained, who's flagged pain, who's
  slipping. This is a second, higher-priced product hiding inside the one you
  have — coaches will pay more than players, and they arrive with a squad.
- **Frictionless invites.** A squad link that works before signup, so an invited
  player sees the squad first and the login second.
- **Position-specific comparison.** "Your sprint vs other wingers your age."
  `lib/positions.ts` and the leaderboards already carry this.

**Done when:** 30% of active users belong to a squad. Squad members should retain
noticeably better than solo users — if they don't, something in the loop is broken
and it's worth finding out before building more of it.

---

## Month 4 (November) — Train through the dark

Dark evenings, cold pitches, and the point in the season when motivation dips and
injuries peak. This is the month you lose people, so plan for it now.

**Ship:**

- **Home and indoor sessions.** No pitch, no gym, 20 minutes, front room. Tag the
  library so these are filterable.
- **In-season load management.** Use the readiness engine you already have to say
  "you played Saturday, today is recovery" rather than prescribing a hard session
  into a fixture.
- **Injury-prevention blocks.** Hamstring and groin work as a standing weekly
  slot. This is the most credible thing a football app can offer and it's
  genuinely valuable.
- **A "short on time" button.** Any session compressed to 15 minutes. A shortened
  session is worth infinitely more than a skipped one.

**Done when:** November's weekly active users don't drop more than 10% from
October's.

---

## Month 5 (December) — Survive the break

Nobody trains between the 20th and the 1st. Fighting that loses; planning for it
wins, because January is coming and December is where you seed it.

**Ship:**

- **Maintenance mode.** Two short sessions a week, explicitly framed as "hold what
  you built". Permission not to be perfect keeps the app installed.
- **Streak freeze.** A holiday that doesn't destroy 90 days of work.
- **Year in review.** Total sessions, biggest lift, best month, one shareable
  card. This is the highest-sharing feature of the whole year — people post these
  — and it lands right before the biggest acquisition month in fitness.
- **Reactivation for lapsed users.** One well-written email, not a sequence.

**Done when:** 25% of active users open the year-in-review and a quarter of those
share it.

---

## Month 6 (January) — The month everything else was for

January is the biggest acquisition window in fitness by a wide margin. Everything
above exists so that the people who arrive this month find a product that keeps
them past February.

**Ship:**

- **A free January challenge.** 31 days, no card required, real programming.
  Converts to paid at the end.
- **Referral push.** Point the affiliate system at users, not just partners —
  give a free month for a friend who subscribes.
- **Annual plan.** £200/year against £240 monthly. Annual buyers retain
  structurally better because the churn decision only comes round once.
- **Goal setting for the season run-in.** February to May is the business end;
  give people a target that isn't "get fit".

**Done when:** January signups are 3× the December baseline, and the challenge
cohort converts above 20%.

---

## Not doing, and why

Saying no is most of what a roadmap is for.

- **A social feed.** Enormous to build, needs moderation you can't staff, and
  needs scale you won't have. Squads give you the social value without any of that.
- **Native iOS/Android apps.** The PWA covers it. Two more build pipelines and an
  app-store review queue would eat months for a worse product.
- **Wearable integrations beyond the existing import.** Every one is a separate
  OAuth integration and a separate thing to break. Revisit if users ask twice.
- **More AI features.** The AI you have isn't perfect yet. Make the programs and
  meal plans genuinely good before adding a sixth model call.
- **A second paid tier.** One plan is working. A second tier doubles the pricing
  decisions and halves the clarity.

---

## Blocking, before any of this

These aren't features and none of the above matters if they're not done:

- [ ] Generate VAPID keys — **month 1 depends entirely on this**
- [x] ~~Paste the current Worker into Cloudflare~~ — live, `/health` reports
      `2026-07-29.1`. Check it after every paste; the version stamp exists
      because a fix sat undeployed for days while I reasoned about source that
      wasn't running
- [ ] Add the three Stripe webhook events (`invoice.payment_succeeded`,
      `charge.refunded`, `charge.dispute.created`)
- [ ] Enable Stripe's Customer Portal
- [ ] **Rotate the Supabase database password** — it's in git history
- [ ] Add the DMARC record
- [ ] Live payment test
- [ ] Age gate
- [ ] Solicitor review of the privacy policy, terms, and the multi-level affiliate
      scheme before recruiting widely

---

## How to use this

Re-read it at the end of each month against the funnel numbers. Ship the month's
list, cut anything that isn't moving its metric, and let real data overrule
anything written here — it was written before you had any.
