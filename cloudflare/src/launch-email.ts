// =============================================================================
// GENERATED - do not edit. Copied verbatim from
// supabase/functions/announce-launch/email.ts by scripts/sync-launch-email.mjs.
//
// The launch email has exactly one source. It is rendered in three places now -
// the Edge Function, the SQL sender, and this Worker route - and three
// hand-maintained copies of the same HTML is how half a mailing list ends up
// with last week's wording. The module is plain TypeScript with no imports and
// no runtime APIs, which is what makes copying it verbatim safe; a test fails
// if this file and the original ever differ.
// =============================================================================

// =============================================================================
// The launch email.
//
// Its own module so the copy can be read, reviewed and tested without wading
// through the send loop — and so a test can assert the things that are legally
// or commercially load-bearing rather than trusting a template literal.
//
// WHAT THE COPY WILL AND WILL NOT CLAIM. Everything here is checkable against
// the app: 6 sports, 33 positions, 136 challenges, 62 badges, the Iron→Legend
// ladder, and on-device video analysis. It does NOT say the clip never leaves
// the phone — it is uploaded to the account, and only the ANALYSIS is local.
// An announcement that overclaims is one the first reply corrects.
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

  const subject = "Pocket Athlete is live — your spot is ready 🔥";

  const text = [
    "It's live.",
    "",
    "You put your name down for Pocket Athlete. It's open — go and use it.",
    "",
    "What you get:",
    "",
    "- Training built for your POSITION, not just your sport. A prop and a winger",
    "  get different sessions. 33 positions across 6 sports.",
    "- Film a rep and have it read frame by frame — depth, tempo, bar path, the",
    "  knee collapsing on rep 8 — with the drills to fix what it finds. The",
    "  analysis runs on your own phone.",
    "- Nutrition that adds up: targets, meal plans, a shopping list with prices.",
    "- 136 challenges, 62 badges and a rank ladder from Iron to Legend.",
    "",
    "And it watches your training load, so when you need to back off it says so —",
    "and pays you for the rest day rather than only for the grind.",
    "",
    `Start here: ${cta}`,
    "",
    "Free to start. No card needed.",
    "",
    "—",
    "You're getting this because you joined the Pocket Athlete waitlist.",
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#0b0f0d;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your position. Your plan. Your numbers. It's open.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f0d;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#121714;border-radius:20px;padding:32px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <tr><td style="font-size:30px;line-height:1.15;font-weight:800;color:#f1f5f3;padding-bottom:6px;">
    It's live. 🔥
  </td></tr>

  <tr><td style="font-size:16px;line-height:1.6;color:#9fb0a8;padding-bottom:22px;">
    You put your name down for Pocket Athlete. It's open — go and use it.
  </td></tr>

  <tr><td style="padding-bottom:22px;">
    <a href="${escapeAttr(cta)}" style="display:inline-block;background:#e3b53f;color:#0b0f0d;font-size:17px;font-weight:800;text-decoration:none;padding:15px 30px;border-radius:999px;">
      Open Pocket Athlete →
    </a>
  </td></tr>

  ${row("🎯", "Built for your position", "A prop and a winger get different sessions. 33 positions across 6 sports — not one generic plan with your sport's name on it.")}
  ${row("🎥", "Film a rep, have it read", "Depth, tempo, bar path, the knee collapsing on rep 8 — with the drills to fix what it finds. The analysis runs on your own phone.")}
  ${row("🍽️", "Food that adds up", "Calorie and macro targets, meal plans built round your training, and a shopping list with prices on it.")}
  ${row("🏆", "Something to chase", "136 challenges, 62 badges, and a rank ladder that runs Iron to Legend. It tracks your load too — so when you need to back off, it says so, and pays you for the rest day.")}

  <tr><td style="padding-top:8px;padding-bottom:26px;font-size:16px;line-height:1.6;color:#9fb0a8;">
    Free to start. No card needed.
  </td></tr>

  <tr><td style="border-top:1px solid rgba(255,255,255,0.08);padding-top:18px;font-size:12px;line-height:1.6;color:#6b7a73;">
    You're getting this because you joined the Pocket Athlete waitlist.<br>
    <a href="${escapeAttr(unsubscribeUrl)}" style="color:#9fb0a8;text-decoration:underline;">Unsubscribe</a> — one click, no questions.
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}

function row(icon: string, title: string, body: string): string {
  return `<tr><td style="padding-bottom:18px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td width="34" valign="top" style="font-size:20px;line-height:1.3;">${icon}</td>
      <td valign="top">
        <div style="font-size:15px;font-weight:700;color:#f1f5f3;padding-bottom:3px;">${escapeHtml(title)}</div>
        <div style="font-size:14px;line-height:1.55;color:#9fb0a8;">${escapeHtml(body)}</div>
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
