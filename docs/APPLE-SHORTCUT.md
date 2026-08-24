# Publishing the Apple Health Shortcut

The Apple Health setup has two routes, and this document is about switching the
good one on.

**Today (no link published):** the athlete builds a Shortcut by hand from the
five-step guide inside the app. It works, and people do not finish it. Every
step in it is about the transport — which Health sample, which sort order,
which unit a duration is in — and none of it is anything a footballer should
have to learn to see last night's sleep in their log.

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

## Building it

On an iPhone, in Shortcuts, new shortcut. Add these actions in order.

1. **Text** — leave it empty. This is the one the athlete fills in: it holds
   their personal upload link. Name the shortcut something obvious first, e.g.
   *Pocket Athlete — Morning Sync*.

2. **Find Health Samples** — `Sleep Analysis`, sorted by `Start Date`,
   `Latest First`, **Limit on, set to 1**.
   Then **Get Details of Health Sample** → `Duration`.
   Tap the Duration variable and set its unit to **Hours**, so it comes out as
   `7.53` rather than `7 hr 32 min`. A URL cannot contain spaces, and this is
   the single thing that breaks the hand-built version most often.

3. **Find Health Samples** — `Heart Rate Variability`, `Latest First`, limit 1.
   Then **Get Details of Health Sample** → `Value`.

4. **Find Health Samples** — `Resting Heart Rate`, `Latest First`, limit 1.
   Then **Get Details of Health Sample** → `Value`.

5. **Text** — build the URL:

   ```
   [Text from step 1]&sleep=[Duration]&hrv=[HRV value]&rhr=[Resting HR value]
   ```

   The link from step 1 already ends `?t=…`, so every one of these starts with
   `&`.

6. **Get Contents of URL** — its input is the Text from step 5. Nothing else:
   no method to change, no headers, no JSON body. The endpoint takes a plain
   GET.

Run it once on your own account to check it answers with the hours it read.

## Making the athlete's link an import question

This is what turns it from "edit action 1" into "it asks you".

Open the shortcut's settings (the ⓘ / details button) and find **Import
Questions**. Add a question pointing at the **Text** action from step 1 —
something like *Paste your Pocket Athlete link*. When anybody installs the
shortcut from your iCloud link, Shortcuts asks that question and drops their
answer into that action.

Verify it by installing your own link on a second device (or after deleting
your copy): if it does not ask, the question is not attached to the right
action, and every installer will silently share your token.

## Publishing and wiring it up

Shortcuts → the shortcut → share → **Copy iCloud Link**.

Paste it into `CONFIGURED` in `lib/apple-shortcut.ts`:

```ts
const CONFIGURED = "https://www.icloud.com/shortcuts/0123456789abcdef0123456789abcdef";
```

Or set `NEXT_PUBLIC_APPLE_SHORTCUT_URL` at build time if the link should not be
committed. Either way it is read at build time — this app is a static export, so
there is no runtime environment to read from.

Only a real iCloud shortcut link switches the button on. A placeholder, a
shortened link or a marketing page renders as *not configured*, which falls back
to the hand-built guide rather than showing a button that goes nowhere.

## Afterwards

- **Editing the shortcut does not change the link** for people who already
  installed it — they keep the version they installed. Meaningful fixes need a
  re-share, and re-sharing produces a **new** iCloud link, so update
  `CONFIGURED` when you do.
- **Do not un-share it.** Revoking the iCloud link breaks new installs
  immediately; the button keeps rendering and the install fails.
- The daily run is still an Automation the athlete sets up themselves
  (Automation → Time of Day → 8am, *Ask Before Running* off). A shared shortcut
  cannot bring its own automation.
