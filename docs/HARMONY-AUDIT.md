# Harmony audit — do the features add up to one product?

The brief, in the user's words: *"the app is good and the features are good but
they feel seperate not like they are working together"*.

That is a different complaint from "this page is confusing", and it needs a
different method. Every finding below sat **between** two features that were
each fine on their own, which is exactly why none of them had been caught:
the body map was complete, the rehab protocols were good, the engine trained
around pain — and marking a groin changed nothing.

So the rule this audit works to:

> **A seam is only tested by a test that spans it.** Two well-tested halves
> prove nothing about the join, and a join with no owner is where a product
> stops feeling like one thing.

The four shapes a disconnect took here:

1. **One fact, several homes.** The same real-world quantity written to more
   than one table, with different screens reading different ones.
2. **A default that silently means "fine".** `x[key] ?? 0` on a lookup that was
   never populated, so the absent case reads as a real, benign answer.
3. **Two features answering one question.** Neither aware of the other, so the
   app gives two numbers for the same thing on two tabs.
4. **A finding with no action.** The app works something out, says it, and
   leaves the athlete to do something about it unaided.

---

## Fixed

### 1. Bodyweight had three homes and Progress read the empty one
*Shape 1. Commit "Give bodyweight one home".*

| table | written by | read by |
| --- | --- | --- |
| `daily_check_ins.weight_kg` | the daily check-in | nutrition, coach, report, home |
| `body_logs.weight_kg` | the /body weigh-in | the /body chart, nothing else |
| `profiles.weight_kg` | **nothing, ever** | Progress ranks, Rewards badges |

No screen in the app writes `profiles.weight_kg` — there is no weight field in
onboarding or on the profile page. So the strength ranks had never rendered for
anybody, and told athletes to "add your bodyweight in your profile", naming the
one place it cannot be done. Rewards passed `weight_kg ?? 0`, making every
strength badge unreachable by construction.

`lib/bodyweight.ts` resolves one number from every source, freshest wins, and
every reader calls it.

### 2. Six of thirteen reportable injuries changed nothing
*Shape 2. Commit "Make a sore groin change the session".*

The engine asks `m.load[area] ?? 0`, so an area no movement declared read as
costing nothing and **every** exercise claimed to spare it. `calf`, `groin`,
`glute`, `elbow` and `wrist` were all in that state — a marked groin at 8/10
still got a week of sprints, change of direction and shooting drills.

80 movements now carry loads for those five. `head` is deliberately excluded:
a suspected concussion is not a loading problem to program around.

### 3. Two features both answered "how strong is my squat"
*Shape 3. Commit "Let the ranks see the maxes you actually tested".*

The Benchmarks page has stored measured 1RMs since it shipped. The Progress
ranks estimated from rep work and ignored every one. A lift now knows both
names it answers to — its training-log aliases and its benchmark metric key.
A tested max wins when it is the biggest number seen, and can never lower a
rank.

### 4. The quad could not be reported at all
*Shapes 1 and 4. Commit "Put the quads on the body map".*

The figure faces forwards and the only thigh region was a hamstring. The map
now has front and back, using the same control the strength figure uses.

### 5. The weak link was a diagnosis with no prescription
*Shape 4. Commit "Give the Progress page a shape".*

"Your shoulders are two tiers behind" highlighted the shoulders and stopped.
The library already searched muscle names; it just had no way in. It now seeds
its search from `?q=`, and the finding links straight to the exercises that fix
it. Two tests guard the join: every rankable muscle must find at least five
exercises, and the library must still read the query string.

---

### 6. Reported pain never expired
*Shape 2 again. Commit "Let a reported injury heal".*

A knee marked 7/10 in March kept shaping things in April: a stale 7 and a
current 7 were the same value, because the number had no date attached at the
point of use. `lib/pain.ts` fades a report — full weight for three days, the
window the injury page already used, then tapering to nothing at fourteen — and
says out loud that it is doing so.

Only two screens were actually affected. Most check-in queries ask for TODAY's
row; `injury` and `train/view` took the latest whatever its date.

---

## Found, not yet fixed

Ordered by how much they cost the athlete.

### A. The check-in and the program do not close the loop
The check-in captures RPE and the engine prescribed one. Nothing compares them.
If an athlete reports 9/10 on a session prescribed at RPE 7 for three weeks
running, the block is too hard and the app has every number it needs to say so.
`docs/UI-AUDIT.md` already argues the prescribed RPE should not be asked back;
the more useful move is to use the answer.

### B. Nutrition targets ignore the injury state
Calorie and protein targets read training load. An athlete in a rehab block is
eating for a training volume they are not doing, and protein needs go *up*
during tissue repair, not down. Both facts are already in the database.

### C. The challenge board no longer aims at your weakest habit
Selection used to score challenges by how far you were from each target. That
made the board unwinnable — see the commit "Stop the challenge board deleting
the work you just did" — so selection is now activity-independent. Aiming at a
neglected habit is still the right idea; it needs a window the current period
cannot move (last month's activity, or a board persisted at period start).

---

### D. Achievements do not know about the strength ladder's own vocabulary
`lib/gamification.ts` owns Iron→Apex and `lib/strength-standards.ts` owns
Untrained→World Class, deliberately kept apart so "Gold" cannot mean two things.
That separation is right, but nothing explains it on screen, so an athlete sees
two ladders and no statement of how they relate.

---

## The pattern worth remembering

Four of the six fixed findings were the **same bug**: a missing value that
read as a real one. `profiles.weight_kg` was null and became `?? 0`. An
unmodelled body area became `?? 0`. This codebase has hit it before — the funnel
counted absent as zero, and the strength figure nearly labelled untested muscles
"Untrained".

> **Absent is not zero.** When a lookup can miss, the miss needs its own branch,
> and usually its own sentence on screen.
