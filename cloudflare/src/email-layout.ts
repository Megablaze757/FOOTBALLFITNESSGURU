// =============================================================================
// The shell every PocketAthlete email is sent inside.
//
// WHY IT EXISTS. The launch announcement was built properly — table layout, a
// preheader, a real button, and a palette worked out against Gmail's dark mode
// — and every other email the app sends was three tags:
//
//     <h2>Title</h2><p>body</p><p><a href="...">Open PocketAthlete →</a></p>
//
// Times New Roman on white, a naked blue link, no name on it anywhere. That is
// what an athlete actually receives when the app tells them their block is
// ready or their trial is ending, and it is the only thing most of them will
// ever see of the product outside the app. A reminder that looks like a system
// error does not get opened twice.
//
// So the launch email's shell is copied here rather than a second design being
// invented. One palette, one button, one set of dark-mode rules.
//
// AND YES, THE BUTTON IS DUPLICATED. The obvious tidy-up is for launch-email.ts
// to import from this file, and it is wrong: that module is GENERATED from
// supabase/functions/announce-launch/email.ts by scripts/sync-launch-email.mjs,
// and a test asserts the two are byte-identical. They run on different runtimes
// — Deno and Workers — and the announcement is the one email where a build-time
// difference between them would be discovered by twelve thousand people at
// once. Sharing code across that boundary would trade a live invariant for
// thirty lines. The copy stays, and this comment is the thing that keeps the
// two in step.
//
// WHY THE DESIGN IS LIGHT WHEN THE APP IS DARK. Inherited from the launch
// email, where it was established in a real inbox: Gmail inverts emails and
// cannot be talked out of it. A dark design was tried with every documented
// opt-out — color-scheme, supported-color-schemes, bgcolor on every surface —
// and Gmail inverted it anyway, turning the gold brown. So the inversion is
// used rather than fought. Gmail flips luminance and keeps hue, so this light
// design arrives DARK for anyone reading in dark mode, and the deep gold
// #8a6510 lands back on roughly the brand gold. Clients that honour
// prefers-color-scheme get a real dark palette from the media query instead.
//
// Inline styles win over a stylesheet unless the stylesheet says !important,
// which is why every rule in the media query does.
// =============================================================================

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

/**
 * A full-width button, not an inline-block one.
 *
 * Two reasons, both about where this gets read: on a phone a full-bleed target
 * is the easiest thing on the screen to hit, and Outlook ignores padding on an
 * <a>, which turns an inline-block button into bare underlined text. The
 * bgcolor attribute is there for the same client — it reads that when it
 * refuses to read the style.
 */
export function ctaButton(href: string, label: string): string {
  return `<tr><td style="padding-bottom:12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" bgcolor="#e3b53f" style="background:#e3b53f;border-radius:999px;">
        <a href="${escapeAttr(href)}" style="display:block;padding:17px 20px;font-size:18px;font-weight:800;color:#0b0f0d;text-decoration:none;letter-spacing:-0.01em;">${escapeHtml(label)}</a>
      </td></tr>
    </table>
  </td></tr>`;
}

/** The head and opening card. Shared so a second template cannot drift from it. */
export function emailHead(subject: string, preheader: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
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
${preheaderBlock(preheader)}
<table role="presentation" class="pa-bg" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef1ec" style="background-color:#eef1ec;padding:20px 12px;">
<tr><td align="center">
<table role="presentation" class="pa-card" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:560px;background-color:#ffffff;border-radius:20px;padding:30px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">`;
}

/**
 * The line the inbox shows next to the subject.
 *
 * Left out, every client fills it with whatever text comes first — which for
 * these emails was the heading, repeated. Two chances to say something and both
 * spent on the same words.
 */
function preheaderBlock(text: string): string {
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(text)}</div>`;
}

export function emailFoot(): string {
  return `</table></td></tr></table></body></html>`;
}

/** The wordmark. Same lockup as the launch email, so mail from us looks like us. */
export function emailBrand(): string {
  return `<tr><td style="padding-bottom:20px;">
    <span class="pa-h" style="font-size:18px;font-weight:800;letter-spacing:-0.01em;color:#0e1411;">
      <span class="pa-gold" style="color:#8a6510;">&#9670;</span> PocketAthlete
    </span>
  </td></tr>`;
}

export interface EmailShell {
  /** What the inbox shows next to the subject. Never the heading again. */
  preheader: string;
  /** Small uppercase label above the heading — what KIND of message this is. */
  eyebrow?: string;
  heading: string;
  /** Paragraphs. Plain text; escaped here, so a title with an ampersand is safe. */
  paragraphs: string[];
  cta?: { href: string; label: string };
  /** Sits under the button in small type — a caveat, a note about timing. */
  note?: string;
  /** The grey line at the bottom. May contain a link, so it is NOT escaped. */
  footerHtml?: string;
}

/**
 * Render an ordinary transactional email.
 *
 * Everything the app sends outside the launch announcement goes through here:
 * reminders, the weekly summary, trial notices, the admin test. They differ in
 * words, not in design, and a template per message type is how six emails end
 * up looking like six products.
 */
export function renderEmail(subject: string, shell: EmailShell): string {
  const eyebrow = shell.eyebrow
    ? `<tr><td class="pa-gold" style="font-size:12px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#8a6510;padding-bottom:8px;">${escapeHtml(shell.eyebrow)}</td></tr>`
    : "";

  // 26px, not the launch email's 34. That one is an announcement and gets to
  // shout; this is a message about your Tuesday.
  const heading = `<tr><td class="pa-h" style="font-size:26px;line-height:1.18;font-weight:800;letter-spacing:-0.02em;color:#0e1411;padding-bottom:12px;">${escapeHtml(shell.heading)}</td></tr>`;

  const paragraphs = shell.paragraphs
    .filter((p) => p.trim() !== "")
    .map((p) => `<tr><td class="pa-body" style="font-size:16px;line-height:1.55;color:#495751;padding-bottom:18px;">${escapeHtml(p).replaceAll("\n", "<br>")}</td></tr>`)
    .join("");

  const cta = shell.cta ? ctaButton(shell.cta.href, shell.cta.label) : "";
  const note = shell.note
    ? `<tr><td class="pa-muted" align="center" style="font-size:13px;line-height:1.5;color:#5d6860;padding-bottom:20px;">${escapeHtml(shell.note)}</td></tr>`
    : "";
  const footer = shell.footerHtml
    ? `<tr><td class="pa-muted pa-rule" style="border-top:1px solid #e4e8e3;padding-top:20px;font-size:12px;line-height:1.5;color:#5d6860;">${shell.footerHtml}</td></tr>`
    : "";

  return emailHead(subject, shell.preheader) + emailBrand()
    + eyebrow + heading + paragraphs + cta + note + footer + emailFoot();
}

/**
 * The same message as plain text.
 *
 * NOT AN AFTERTHOUGHT. An HTML email with no text alternative scores worse in
 * every spam filter, and these emails had none at all — the Worker sent `html`
 * and nothing else. It also decides what a watch, a screen reader and a
 * text-only client show, which for a training reminder is most of the point.
 */
export function renderText(shell: EmailShell): string {
  const lines = [shell.heading.toUpperCase(), "", ...shell.paragraphs.filter((p) => p.trim() !== "")];
  if (shell.cta) lines.push("", `${shell.cta.label.replace(/\s*→\s*$/, "")}: ${shell.cta.href}`);
  if (shell.note) lines.push("", shell.note);
  if (shell.footerHtml) {
    // The footer is the one field that carries markup, because it holds a link.
    // Stripped to its text and the href kept, so the text part says the same
    // thing rather than a tidied-up version of it.
    const text = shell.footerHtml
      .replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g, "$2: $1")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    if (text) lines.push("", "—", text);
  }
  return lines.join("\n");
}
