/**
 * Apex email sender — a free alternative to Resend using your own Gmail.
 *
 * Setup:
 *  1. Go to https://script.google.com → New project, paste this in.
 *  2. Set a shared secret below (must match GAS_EMAIL_SECRET in the Worker).
 *  3. Deploy → New deployment → type "Web app":
 *       - Execute as: Me
 *       - Who has access: Anyone
 *     Copy the /exec URL → set it as GAS_EMAIL_URL in the Worker.
 *  4. The first send will prompt you to authorize Gmail access (one time).
 *
 * The Cloudflare Worker POSTs JSON: { secret, to, subject, html, from }.
 * Gmail free accounts can send ~100 emails/day; Workspace ~1500/day.
 */

var SHARED_SECRET = "change-me-to-match-the-worker";

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SHARED_SECRET) {
      return json_({ ok: false, error: "unauthorized" });
    }
    if (!body.to || !body.subject) {
      return json_({ ok: false, error: "to and subject required" });
    }
    MailApp.sendEmail({
      to: body.to,
      subject: body.subject,
      htmlBody: body.html || "",
      name: (body.from || "Apex").replace(/<.*>/, "").trim() || "Apex",
    });
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// Simple health check when you open the /exec URL in a browser.
function doGet() {
  return json_({ ok: true, service: "apex-email" });
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
