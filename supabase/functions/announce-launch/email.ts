// =============================================================================
// The launch email.
//
// Its own module so the copy can be read, reviewed and tested without wading
// through the send loop — and so a test can assert the things that are legally
// or commercially load-bearing rather than trusting a template literal.
//
// THE FIRST SCREEN IS THE WHOLE EMAIL. Rendered at 390px — a phone — the button
// used to land 855px down, which is roughly two swipes past where most people
// stop. So the order is: what happened, why they're getting it, and the button.
// Everything that argues the case sits BELOW the first press. Someone already
// convinced should never have to scroll to act, and someone who isn't still
// gets the full pitch.
//
// IT SAYS THE SAME THING AS THE FRONT DOOR. Under the fold it leads with the
// landing page's line — "Most plans know your sport. This one knows your
// position." — and the numbers under it are the same numbers: 33 positions,
// 6 sports, 136 challenges, 68 badges, each asserted against the app by a test.
//
// WHAT IT WILL NOT CLAIM. It does NOT say the clip never leaves the phone — the
// clip is uploaded to the account, and only the ANALYSIS is local. And it does
// not mention founding-member pricing, which the waitlist page promised and the
// app does not implement: there is no discounted tier in lib/subscription.ts.
// Announcing a price that does not exist is a worse first impression than not
// mentioning one.
//
// The plain-text part is not an afterthought. A bulk HTML email with no text
// alternative scores worse in every spam filter, and this is the first bulk
// send from this domain — the one that sets its reputation.
// =============================================================================

export interface LaunchEmailInput {
  appUrl: string;
  /** Affiliate code that brought them in, if any. */
  ref: string | null;
  unsubscribeUrl: string;
}

export interface LaunchEmail {
  subject: string;
  html: string;
  text: string;
}

export function launchEmail({ appUrl, ref, unsubscribeUrl }: LaunchEmailInput): LaunchEmail {
  // The link carries ?ref= when we know who brought them. Attribution does not
  // depend on it (0057 binds the email to its referrer permanently), but it is
  // the only signal for someone who signs up with a different address.
  const cta = ref ? `${appUrl}/?ref=${encodeURIComponent(ref)}` : `${appUrl}/`;

  // Leads with the event, not with the reader. "You're in" is meaningless in a
  // notification bar next to twelve other subjects; the product name and the
  // word live are the two things worth spending the truncation budget on.
  const subject = "Pocket Athlete is live 🔥 you're in";

  const text = [
    "POCKET ATHLETE IS LIVE.",
    "",
    "You put your name down before there was anything to see. It's open now, and",
    "you're getting this before anyone else.",
    "",
    `Open it: ${cta}`,
    "",
    "Free to start. No card. About two minutes to your first four-week block.",
    "",
    "---",
    "",
    "MOST PLANS KNOW YOUR SPORT. THIS ONE KNOWS YOUR POSITION.",
    "",
    "A prop and a winger need different bodies, so they get different sessions.",
    "33 positions across 6 sports, each with their own movements, drills and",
    "challenges. Not one generic plan with your sport's name on the front.",
    "",
    "WHAT'S WAITING FOR YOU",
    "",
    "- Film a rep, watch it get read. Depth, tempo, bar path, the knee caving in",
    "  on rep 8 - with the drills to fix what it finds. The analysis runs on your",
    "  own phone.",
    "- A plan that reacts. Slept badly? Three taps and today eases off by itself.",
    "  It watches your training load and tells you to back off BEFORE the niggle.",
    "- Food that adds up. Calorie and macro targets, meal plans built round your",
    "  training, a shopping list with prices on it.",
    "- Something to chase. 136 challenges, 68 badges, and a rank ladder from Iron",
    "  to Legend. It pays you for rest days too, not just for grinding.",
    "",
    `Start here: ${cta}`,
    "",
    "See you in there.",
    "",
    "-",
    "You're getting this because you joined the Pocket Athlete waitlist.",
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");

  // WHY THIS EMAIL IS LIGHT, WHEN THE APP IS DARK.
  //
  // Gmail's dark mode inverts emails and cannot be talked out of it. A dark
  // design was tried first with every documented opt-out — the color-scheme and
  // supported-color-schemes meta tags, the CSS property, bgcolor attributes on
  // every surface — and Gmail inverted it anyway: white background, gold turned
  // brown. That was confirmed in a real inbox, twice, with the copy-id in the
  // subject line proving the right version was being looked at.
  //
  // So the inversion is used rather than fought. Gmail flips luminance and keeps
  // hue, which means a light design arrives DARK for anyone reading in dark
  // mode, and the deep gold #8a6510 lands back on roughly the brand gold. The
  // palette is chosen so both directions work: every pairing here clears WCAG AA
  // against its own background as designed.
  //
  // Clients that honour prefers-color-scheme — Apple Mail, Outlook.com — get a
  // real dark palette from the media query instead of an approximation, which
  // is what the pa-* classes are for. Inline styles win over a stylesheet unless
  // the stylesheet says !important, which is why those rules all do.
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  /* For clients that actually honour the query — Apple Mail, Outlook.com. Gmail
     ignores it and inverts the light design instead, which lands in the same
     place. !important is what lets a stylesheet beat the inline styles. */
  @media (prefers-color-scheme: dark) {
    .pa-bg    { background-color: #0b0f0d !important; }
    .pa-card  { background-color: #121714 !important; }
    .pa-h     { color: #f1f5f3 !important; }
    .pa-gold  { color: #e3b53f !important; }
    .pa-body  { color: #9fb0a8 !important; }
    .pa-muted { color: #6b7a73 !important; }
    .pa-tile  { background-color: #1a201c !important; }
    .pa-rule  { border-color: rgba(255,255,255,0.09) !important; }
    .pa-chip  { background-color: #1e1c14 !important; border-color: #4a3d17 !important; color: #e3b53f !important; }
  }
</style>
</head>
<body bgcolor="#eef1ec" style="margin:0;padding:0;background-color:#eef1ec;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">It's open. 33 positions, 6 sports, and your first plan is two minutes away.</div>
<table role="presentation" class="pa-bg" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef1ec" style="background-color:#eef1ec;padding:20px 12px;">
<tr><td align="center">
<table role="presentation" class="pa-card" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:560px;background-color:#ffffff;border-radius:20px;padding:30px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <tr><td style="padding-bottom:20px;">
    <span class="pa-h" style="font-size:18px;font-weight:800;letter-spacing:-0.01em;color:#0e1411;">
      <span class="pa-gold" style="color:#8a6510;">&#9670;</span> PocketAthlete
    </span>
  </td></tr>

  <tr><td class="pa-gold" style="font-size:12px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#8a6510;padding-bottom:8px;">
    Now live
  </td></tr>

  <tr><td class="pa-h" style="font-size:34px;line-height:1.1;font-weight:800;letter-spacing:-0.02em;color:#0e1411;padding-bottom:12px;">
    Pocket Athlete<br><span class="pa-gold" style="color:#8a6510;">is live.</span>
  </td></tr>

  <tr><td class="pa-body" style="font-size:16px;line-height:1.55;color:#495751;padding-bottom:20px;">
    You put your name down before there was anything to see. It's open now — and you're
    getting this before anyone else.
  </td></tr>

  ${ctaButton(cta, "Open Pocket Athlete →")}

  <tr><td class="pa-muted" align="center" style="font-size:13px;line-height:1.5;color:#5d6860;padding-bottom:26px;">
    Free to start. No card. About two minutes to your first four-week block.
  </td></tr>

  <tr><td class="pa-h pa-rule" style="border-top:1px solid #e4e8e3;padding-top:26px;font-size:23px;line-height:1.22;font-weight:800;letter-spacing:-0.01em;color:#0e1411;padding-bottom:10px;">
    Most plans know your sport.<br><span class="pa-gold" style="color:#8a6510;">This one knows your position.</span>
  </td></tr>

  <tr><td class="pa-body" style="font-size:15px;line-height:1.6;color:#495751;padding-bottom:18px;">
    A prop and a winger need different bodies, so they get different sessions.
  </td></tr>

  ${positionStrip()}

  ${statRow()}

  <tr><td class="pa-muted" style="font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#5d6860;padding-bottom:16px;">
    What's waiting for you
  </td></tr>

  ${row("🎥", "Film a rep, watch it get read", "Depth, tempo, bar path, the knee caving in on rep 8 — with the drills to fix what it finds. The analysis runs on your own phone.")}
  ${row("🩺", "A plan that reacts", "Slept badly? Three taps and today eases off by itself. It watches your training load and tells you to back off before the niggle, not after.")}
  ${row("🍽️", "Food that adds up", "Calorie and macro targets, meal plans built round your training, and a shopping list with prices on it.")}
  ${row("🏆", "Something to chase", "136 challenges, 68 badges and a rank ladder from Iron to Legend. It pays you for rest days too, not just for grinding.")}

  <tr><td style="padding-top:8px;"></td></tr>
  ${ctaButton(cta, "Build my first plan →")}

  <tr><td class="pa-muted pa-rule" style="border-top:1px solid #e4e8e3;padding-top:22px;font-size:12px;line-height:1.6;color:#5d6860;">
    You're getting this because you joined the Pocket Athlete waitlist.<br>
    <a href="${escapeAttr(unsubscribeUrl)}" class="pa-body" style="color:#495751;text-decoration:underline;">Unsubscribe</a> — one click, no questions.
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}

/**
 * The button.
 *
 * Full width and table-based rather than a padded inline-block anchor. Two
 * reasons, both about where this actually gets read: on a phone a full-bleed
 * target is the easiest thing on the screen to hit, and Outlook ignores padding
 * on an <a>, which turns an inline-block button into bare underlined text. The
 * bgcolor attribute is there for the same client — it reads that when it
 * refuses to read the style.
 */
function ctaButton(href: string, label: string): string {
  return `<tr><td style="padding-bottom:12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" bgcolor="#e3b53f" style="background:#e3b53f;border-radius:999px;">
        <a href="${escapeAttr(href)}" style="display:block;padding:17px 20px;font-size:18px;font-weight:800;color:#0b0f0d;text-decoration:none;letter-spacing:-0.01em;">${escapeHtml(label)}</a>
      </td></tr>
    </table>
  </td></tr>`;
}

/**
 * A strip of real position names.
 *
 * The email was entirely text, and the one thing worth looking at is also the
 * thing being claimed: these are genuinely different plans. Naming them is a
 * better argument than a stock photo of somebody squatting, and it renders
 * everywhere — chips are spans with a background, not images.
 */
function positionStrip(): string {
  const chip = (s: string) =>
    `<span class="pa-chip" style="display:inline-block;background-color:#fbf4e0;border:1px solid #ecdfb6;` +
    `color:#7d5c0c;font-size:12px;font-weight:700;padding:6px 11px;border-radius:999px;margin:0 5px 7px 0;` +
    `white-space:nowrap;">${escapeHtml(s)}</span>`;
  const names = ["Prop", "Winger", "Goalkeeper", "Point guard", "Scrum-half", "Marathon", "+27 more"];
  return `<tr><td style="padding-bottom:20px;">${names.map(chip).join("")}</td></tr>`;
}

/**
 * The numbers, as a row of tiles.
 *
 * Every one is checkable in the app and pinned by a test, which is the only
 * reason to put figures in an announcement at all — a number that turns out to
 * be wrong costs more trust than four vague adjectives ever bought.
 */
function statRow(): string {
  const stats: [string, string][] = [
    ["33", "positions"],
    ["6", "sports"],
    ["136", "challenges"],
    ["68", "badges"],
  ];
  const cells = stats
    .map(
      ([n, label]) => `<td align="center" style="padding:0 4px;">
        <div class="pa-h" style="font-size:22px;font-weight:800;color:#0e1411;">${n}</div>
        <div class="pa-muted" style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#5d6860;">${label}</div>
      </td>`
    )
    .join("");
  return `<tr><td style="padding-bottom:26px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      class="pa-tile" bgcolor="#f5f7f4" style="background-color:#f5f7f4;border-radius:14px;padding:14px 6px;">
      <tr>${cells}</tr>
    </table>
  </td></tr>`;
}

function row(icon: string, title: string, body: string): string {
  return `<tr><td style="padding-bottom:18px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td width="34" valign="top" style="font-size:20px;line-height:1.3;">${icon}</td>
      <td valign="top">
        <div class="pa-h" style="font-size:15px;font-weight:700;color:#0e1411;padding-bottom:3px;">${escapeHtml(title)}</div>
        <div class="pa-body" style="font-size:14px;line-height:1.55;color:#495751;">${escapeHtml(body)}</div>
      </td>
    </tr></table>
  </td></tr>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
