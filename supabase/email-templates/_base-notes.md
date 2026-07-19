# PocketAthlete auth email templates

Paste these into **Supabase → Authentication → Email Templates**. One file per
template; the heading in each file says which one it belongs to.

## Why they look plain

Email clients are not browsers. Gmail strips `<style>` blocks, Outlook renders
through Word's HTML engine, and most clients block web fonts and background
images. So these use:

- table layout, not flexbox or grid
- inline styles only
- system fonts
- no external assets at all (no logo image — a wordmark in text always renders)

A dark theme was deliberately avoided. Several clients force their own
background behind your content, which leaves dark-on-dark text unreadable. These
are light with a gold accent, which degrades safely everywhere.

## Variables

GoTrue substitutes these — do not rename them:

| Variable | Meaning |
|---|---|
| `{{ .ConfirmationURL }}` | the action link (confirm, reset, invite…) |
| `{{ .TokenHash }}` | the raw token — used by the reset and confirm links |
| `{{ .Token }}` | 6-digit code, for the OTP flow |
| `{{ .SiteURL }}` | your Site URL setting |
| `{{ .Email }}` | recipient address |
| `{{ .NewEmail }}` | only in Change Email |

## Before these work

1. **Site URL** must be `https://pocketathlete.com`, or every link in these
   emails points at the old github.io host.
2. **Custom SMTP** must be configured (Spacemail), or Supabase rate-limits you to
   a handful of emails per hour and real signups silently fail.

## Deliverability note

Your SPF is `v=spf1 include:spf.spacemail.com ~all`. That authorises Spacemail
only. If you later send from anything else on the root domain — Resend, a CRM,
a newsletter tool — it must either be added to that one SPF record or, better,
sent from a subdomain. Do not create a second SPF TXT record on the root: two
SPF records is an automatic fail, and it takes mail down without warning.

## Why reset and confirm don't use `{{ .ConfirmationURL }}`

`{{ .ConfirmationURL }}` routes through Supabase's verify endpoint and returns
`?code=…`. Exchanging that code needs a verifier stored in the browser that
*requested* the reset, because `createBrowserClient` uses the PKCE flow. Mail
apps routinely open links in their own in-app viewer, which has different
storage — so the exchange fails and the user sees "invalid or expired".

Those two templates link to `?token_hash={{ .TokenHash }}` instead. The page
verifies the token directly, which needs no stored verifier and works in any
browser, on any device.
