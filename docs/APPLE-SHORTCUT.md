# Publishing the Apple Health Shortcut

The Apple Health setup has two routes, and this document is about switching the
good one on.

**Today (no link published):** the athlete builds a Shortcut by hand from the
three-step guide inside the app. It works, and people do not finish it. Every
step in it is about the transport — which Health sample, which sort order,
which unit a duration is in — and none of it is anything a footballer should
have to learn to see last night's sleep in their log.

The panel now opens by saying they do not need it at all: sleep is one number
and there is a box for it further down the same page. That is the honest
default, and it is what makes the rest of the panel readable for the people who
genuinely do want to stop typing.

**Once the link is published:** they copy one link, tap **Add the Shortcut**,
paste, and tap Add. Two taps and one paste. The hand-built guide stays, demoted
to a "Rather build it yourself?" disclosure — it is still the only route on a
phone that will not install from iCloud, and it is the honest description of
what the ready-made shortcut is doing.

## Why a human has to do this once

An iCloud shortcut link can only be produced by an iPhone signed into iCloud,
sharing a shortcut it has installed. There is no API that mints one, and a
`.shortcut` file served from this site cannot be signed, so a phone will refuse
it. So somebody builds it once, on a phone, and pastes the link into
`lib/apple-shortcut.ts`.

**Nothing account-specific goes in the shortcut.** A shared shortcut is the same
shortcut for everybody who installs it, so anything baked into it is public. The
athlete's upload link is a credential — it writes biometrics to their account —
so it arrives on their own phone, at install time, through an import question.
`lib/apple-shortcut.test.ts` fails the build if a query string ever appears in
the configured link.

## Building it — the checklist

On the iPhone, in **Shortcuts**, make a new shortcut and add these seven actions
in order. **Search for each name in the action list.** Do not go looking for
buttons in particular corners — Apple moves those between iOS versions, which is
exactly why athletes report that "the app looks different to the instructions".

| # | Search for | Set it to |
|---|---|---|
| 1 | **Text** | Leave it empty. This is the one the athlete fills in — their upload link. |
| 2 | **Find Health Samples** | `Sleep` · sort by `Start Date` · `Latest First` · **Limit on, 1** |
| 3 | **Get Details of Health Sample** | `Duration` — then tap the Duration variable and set its unit to **Hours** |
| 4 | **Find Health Samples** | `Heart Rate Variability` · `Latest First` · Limit 1 → **Get Details of Health Sample** → `Value` |
| 5 | **Find Health Samples** | `Resting Heart Rate` · `Latest First` · Limit 1 → **Get Details of Health Sample** → `Value` |
| 6 | **Text** | `[Text from 1]&sleep=[Duration]&hrv=[HRV value]&rhr=[Resting HR value]` |
| 7 | **Get Contents of URL** | Input is the Text from 6. Nothing else — no method, no headers, no body. |

Two things that will otherwise cost you twenty minutes:

- **Step 3's unit is not optional.** Health renders a duration as `7 hr 32 min`,
  and a URL cannot contain a space, so Shortcuts refuses the whole field. Set it
  to Hours and you get `7.53`. This is the single most reported problem with the
  hand-built version.
- **The link from step 1 already ends `?t=…`**, so every key in step 6 starts
  with `&`.
- **The sample type is `Sleep`, not `Sleep Analysis`.** It reads as "Sleep
  Analysis" in the Health app and in Apple's own HealthKit docs, which is where
  that name came from — but the Shortcuts picker lists it as plain `Sleep`, and
  searching the longer name finds nothing.

Name it something obvious — *Pocket Athlete — Morning Sync* — and run it once on
your own account. It should answer with the hours it read.

## Making the athlete's link an import question

This is what turns it from "edit action 1 yourself" into "it asks you", and it
is the whole reason the shared version is easier than building it.

Open the shortcut's settings (the details / ⓘ control) and find **Import
Questions**. Add a question pointing at the **Text** action from step 1 —
something like *Paste your Pocket Athlete link*. When anybody installs from your
iCloud link, Shortcuts asks that question and drops their answer into that
action.

**Verify it.** Install your own link on a second device, or delete your copy and
re-add it. If it does not ask, the question is not attached to the right action,
and every installer silently shares your token.

## Publishing it

Shortcuts → the shortcut → share → **Copy iCloud Link**.

Then in the app: **Admin → Ops → Integrations → Apple Health shortcut**, paste
it, and press *Publish it*. It is live for everyone immediately — no code
change, no deploy. The box refuses anything that is not a real iCloud shortcut
link, and so does the database (migration 0103).

`CONFIGURED` in `lib/apple-shortcut.ts` and `NEXT_PUBLIC_APPLE_SHORTCUT_URL` are
still honoured as a build-time fallback, for a deployment that would rather
commit the link than store it. Anything saved in Admin overrides them.

## Afterwards

- **Editing the shortcut does not change the link** for people who already
  installed it — they keep the version they installed. Meaningful fixes need a
  re-share, and re-sharing produces a **new** iCloud link, so paste the new one
  into Admin when you do.
- **Do not un-share it.** Revoking the iCloud link breaks new installs
  immediately; the button keeps rendering and the install fails.
- The daily run is still an Automation the athlete sets up themselves
  (Automation → Time of Day → 8am, *Ask Before Running* off). A shared shortcut
  cannot bring its own automation.
