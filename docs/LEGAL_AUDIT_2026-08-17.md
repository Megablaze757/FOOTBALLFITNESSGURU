# PocketAthlete UK legal and privacy audit

Date: 17 August 2026

Scope: the repository's signup, health-data flows, AI coach, payments, subscriptions, email/push/in-app notifications, privacy policy and terms.

Status: engineering review, not legal advice. A UK solicitor and data-protection professional should sign off before public launch.

## Executive decision

Do not treat the current build as legally launch-ready yet. This release fixes the most serious code/policy mismatches, but four owner/legal actions remain release blockers: identify the controller, complete a DPIA, verify processor/international-transfer contracts, and implement the current Consumer Contracts Regulations checkout/cancellation evidence with legal advice.

## Release blockers

### 1. Controller identity and postal address are missing — critical

The privacy policy names only a product/trading name and email address. UK GDPR privacy information needs the controller's identity and contact details. The operator's full legal name (or sole trader's name) and a genuine postal address cannot be inferred from source code and must not be invented.

Owner action: replace the warning in `lib/legal.ts` with the full controller identity, postal address and, if applicable, company number and data-protection contact.

Source: [ICO — what information you must supply](https://ico.org.uk/for-organisations/advice-for-small-organisations/getting-started-with-gdpr/data-protection-self-assessment/what-information-you-must-supply-under-the-gdpr/).

### 2. Complete and approve a DPIA — critical

The app combines health/special-category data, AI-generated personal guidance, injury information, behavioural history and multiple processors. ICO guidance says likely high-risk processing requires a DPIA and identifies innovative AI and special-category processing as risk indicators.

Owner action: document necessity/proportionality, data flows, failure modes, vulnerable users, model/provider risks, access controls, deletion, residual risk and sign-off. Consult the ICO before processing if high residual risk cannot be reduced.

Sources: [ICO — when a DPIA is required](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/when-do-we-need-to-do-a-dpia/), [ICO — special-category rules](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-are-the-rules-on-special-category-data/).

### 3. Verify every processor and international transfer — critical

The code can route contextual athlete data to Groq, OpenRouter or NVIDIA, with Supabase, Cloudflare, Stripe and Gmail/Resend elsewhere in the flow. A list in the policy is not a processing agreement. Regions, subprocessors, retention/training settings and transfer mechanisms were not verifiable from the repository.

Owner action: execute Article 28 terms; record processing locations/subprocessors; disable provider training/retention where available; and document UK adequacy, the UK IDTA/Addendum and transfer-risk assessment as applicable. Keep only configured providers in production.

### 4. Consumer-contract checkout and cooling-off evidence — critical

The app starts a digital service immediately and takes a deferred-payment subscription through Stripe. The repository does not prove that all required pre-contract information is presented together immediately before order, saved on a durable medium, or that any request to start services during the current 14-day cancellation period is captured correctly. Terms alone are not evidence of this flow.

Owner action: have counsel classify the supply (service/digital content/mixed), configure Stripe Checkout and confirmation email accordingly, retain the exact terms/price/version accepted, provide the prescribed cancellation information/form where applicable, and test refund handling.

Sources: [GOV.UK — online and distance selling](https://www.gov.uk/online-and-distance-selling-for-businesses), [Consumer Contracts Regulations guidance](https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/429300/bis-13-1368-consumer-contracts-information-cancellation-and-additional-payments-regulations-guidance.pdf), [GOV.UK — fair consumer contracts](https://www.gov.uk/guidance/writing-a-fair-contract-for-customers).

## High-priority findings

### Explicit health consent — materially fixed, legacy review still required

The old policy said consent was "given by entering" health data. ICO guidance says explicit consent needs an express statement and cannot be inferred from actions. This release adds a separate signup statement, server-recorded timestamp/version, a gate for accounts with no recorded consent and a Profile withdrawal control.

Remaining action: decide how to handle health data collected before recorded consent; test withdrawal, selective deletion/export and support procedures; keep an auditable consent text/version history.

Source: [ICO — explicit consent for health information](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/information-about-workers-health/data-protection-and-workers-health-information/).

### Retention and rights operations — partially fixed

The policy now distinguishes video from progress-photo retention and discloses coach-message/notification retention. However, no short operational limit exists for coach conversations, notifications or delivery logs, and there is no in-app export or selective health-data deletion.

Action: approve a retention schedule per table, automate deletion/anonymisation, create a DSAR/export runbook, and test account deletion against database, object storage, Stripe cancellation and processor copies.

### Children and health safety — policy fixed, controls remain

The minimum age is now consistently 16. There is no age-assurance or parent/guardian workflow, so this is a statement rather than an effective control. The injury-plan prompt and medical disclaimers are useful safeguards, but they do not replace clinical safety review, red-team tests, incident escalation or consumer-law duties to use reasonable care and skill.

Action: decide whether the product excludes under-16s in practice; add proportionate age controls; clinically review injury/nutrition outputs; and maintain test cases for emergency/red-flag symptoms, eating disorders and unsafe training load.

### Security governance — code controls exist, governance is not evidenced

Positive controls include RLS, private storage, service-role separation, signed Stripe/Resend webhooks, bounded AI context and account deletion. Missing evidence includes incident response, breach assessment/notification, access review, backup/restore testing, secret rotation, dependency scanning and a vulnerability contact/runbook.

## Email, in-app and subscription findings

- Training reminders now originate as one deduplicated notification record and obey existing category preferences.
- In-app reminders have a separate switch. Essential trial/billing messages are not treated as marketing opt-ins.
- Email provider failures are checked and logged; failed messages remain pending rather than being marked sent.
- Service messages must remain purely administrative. Adding an upgrade, offer or promotional copy can turn them into direct marketing subject to PECR consent/soft-opt-in and opt-out rules.
- The Worker now sends a trial-ending email and in-app notice about 72 hours before the first charge using Stripe's actual amount, interval and date, with a cancellation route.
- Do not run the old Supabase email crons and the Worker scheduler together. Pick the Worker as the production scheduler or duplicate reminders may be sent.

Sources: [ICO — service messages vs direct marketing](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/direct-marketing-guidance/identify-direct-marketing/), [ICO — electronic mail marketing rules](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/).

## DMCCA subscription regime timing

As at this audit date, the government says the new DMCCA subscription-contract regime is anticipated to commence in spring 2027; it is not safe to describe it as already in force. The 72-hour reminder is a good consumer outcome and prepares for part of that regime, but it is not complete future compliance. Before commencement, implement the final prescribed pre-contract information, reminder cadence/content, easy-exit rules, renewal cooling-off/refunds and records once secondary legislation and guidance are final.

Sources: [GOV.UK — April 2026 government response](https://www.gov.uk/government/consultations/consultation-on-the-implementation-of-the-new-subscription-contracts-regime/outcome/government-response-to-consultation-on-the-implementation-of-the-new-subscription-contracts-regime-web-accessible-version), [DMCCA explanatory notes](https://www.legislation.gov.uk/ukpga/2024/13/notes/division/9/index.htm).

## Deployment checklist

1. Fill in controller legal identity and postal address.
2. Have counsel approve Privacy, Terms, checkout, cancellation and refund flows.
3. Complete DPIA, processor agreements and transfer records.
4. Paste migration `0091_notifications_trials_and_consent.sql` before deploying the site/Worker.
5. Paste/deploy the generated Worker and configure both `0 8 * * *` and `0 19 * * *` UTC triggers.
6. Configure a verified sender (`GAS_EMAIL_URL` + secret, or Resend key) and a production `REMINDER_FROM` domain.
7. Disable/unschedule overlapping Supabase reminder jobs if the Worker is authoritative.
8. Send a real trial through Stripe test mode; verify in-app row, email delivery log, exact amount/date and one-click cancellation.
9. Test consent capture, withdrawal, legacy-account gate, account deletion and failed-email retry.
