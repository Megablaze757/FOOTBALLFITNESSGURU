# PocketAthlete auth email templates

Paste these into **Supabase → Authentication → Email Templates**. One file per
template; the heading in each file says which one it belongs to.

## ⚠️ These files are not live until someone pastes them

Nothing syncs them. On 2026-07-29 the live Reset Password template was still
Supabase's `{{ .ConfirmationURL }}` version while this directory had held the
fix for days, and password resets were failing in production the whole time.
The signature in `auth.users` was a recent `recovery_sent_at` with the
`recovery_token` already cleared and `last_sign_in_at` unchanged — the link had
been spent without ever giving anyone a session.

If you change a file here, paste it. If a link is misbehaving, check the
dashboard before you debug the code.

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

1. **Site URL** must be `https://pocketathlete.com`, with **no trailing slash** —
   these templates build links as `{{ .SiteURL }}/reset-password/`, so a
   trailing slash produces `//reset-password/`. It also must not be the old
   github.io host, or every link in every email points at the wrong place.
2. **Redirect allow-list** must contain `https://pocketathlete.com/reset-password/`
   and `https://pocketathlete.com/login/`.
3. **Custom SMTP** must be configured, or Supabase rate-limits you to a handful
   of emails per hour and real signups fail with
   `Error sending confirmation email`.

## Deliverability note

Whichever provider actually sends (Resend now, Spacemail before), SPF has to
authorise **that** sender. Check the live record before assuming:

```
dig +short TXT pocketathlete.com | grep spf
```

Do not create a second SPF TXT record on the root — two SPF records is an
automatic fail and takes mail down without warning. Add the include to the
existing record, or send from a subdomain.

## Which page consumes which link

A `token_hash` link only works if the page it lands on calls `verifyOtp`. Get
this wrong and the link looks fine and silently does nothing — which is exactly
what `confirm-signup.html` did until the login page grew a handler.

| Template | Lands on | Handled by |
|---|---|---|
| Reset Password | `/reset-password/` | `app/reset-password/page.tsx` |
| Confirm signup | `/login/` | `app/login/page.tsx` |
| Magic Link | `/login/` | `app/login/page.tsx` |
| Change Email | `/login/` | `app/login/page.tsx` |
| Invite | Supabase verify endpoint | still `{{ .ConfirmationURL }}` — the flow isn't used, and there's no page to set a first password on |
| Reauthentication | n/a | sends `{{ .Token }}`, a 6-digit code, no link |

## Why reset and confirm don't use `{{ .ConfirmationURL }}`

`{{ .ConfirmationURL }}` routes through Supabase's verify endpoint and returns
`?code=…`. Exchanging that code needs a verifier stored in the browser that
*requested* the reset, because `createBrowserClient` uses the PKCE flow. Mail
apps routinely open links in their own in-app viewer, which has different
storage — so the exchange fails and the user sees "invalid or expired".

Those two templates link to `?token_hash={{ .TokenHash }}` instead. The page
verifies the token directly, which needs no stored verifier and works in any
browser, on any device.
