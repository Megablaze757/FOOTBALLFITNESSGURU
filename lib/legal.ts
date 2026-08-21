import { TRIAL_DAYS } from "./subscription";

// =============================================================================
// Privacy policy and terms, as structured content so both pages render from one
// component and the "last updated" date can't drift between them.
//
// NOT LEGAL ADVICE. This is a good-faith draft describing what the app actually
// does — the data it stores, where it goes, and what it does not do. It is
// written to be accurate about this codebase, which is the part a template
// cannot give you. Have a solicitor review it before launch, especially the
// health-data and liability sections: PocketAthlete collects injury and pain
// information, which is special-category data under UK/EU GDPR and carries
// obligations a generic template will not cover.
// =============================================================================

export const LEGAL_UPDATED = "17 August 2026";
export const LEGAL_CONTACT = "info@pocketathlete.com";
export const LEGAL_ENTITY = "PocketAthlete";

export interface LegalSection {
  heading: string;
  body: string[];
  bullets?: string[];
}

export const PRIVACY: LegalSection[] = [
  {
    heading: "Who we are",
    body: [
      `${LEGAL_ENTITY} ("we") provides a training and recovery app at pocketathlete.com. We are the data controller for the information described here. You can reach us at ${LEGAL_CONTACT}.`,
      "PocketAthlete is currently a trading name. The operator's full legal name and postal address must be added here before public launch; email is not a substitute for that required controller identity information.",
    ],
  },
  {
    heading: "What we collect",
    body: ["Only what the app needs to function. In practice that is:"],
    bullets: [
      "Account details — your email address, and a name if you give one.",
      "Health and training data — daily check-ins covering sleep, fatigue, soreness and a body pain map; body weight and body-fat entries; training sessions, benchmark tests and nutrition logs.",
      "Video and photos — training clips and progress photos you choose to upload.",
      "Payment records — your subscription tier and status. Card details are handled by Stripe and never reach our servers.",
      "Referral source — if you arrived through an affiliate link, the code that brought you.",
    ],
  },
  {
    heading: "Health data, specifically",
    body: [
      "Pain, injury, sleep, fatigue, body-composition and some training and nutrition entries can reveal health information, which the law treats more strictly than ordinary personal data. Before personalised processing starts, we ask you to make a separate express statement of explicit consent. Merely entering data is not treated as consent.",
      "You can withdraw that consent from Profile. Personalised processing then stops until you opt in again. Withdrawal does not make earlier lawful processing unlawful. You can delete your account to erase its data, or email us if you want to make a narrower deletion or restriction request.",
      "We do not sell it, share it with advertisers, or use it to make automated decisions with legal or similarly significant effects. Your readiness score is guidance, not a decision about you.",
    ],
  },
  {
    heading: "Why we use data and our legal bases",
    body: ["We use each category only for the purpose described below:"],
    bullets: [
      "Contract — to create and secure your account, provide the features you request, save your training history, administer a subscription and provide support.",
      "Explicit consent — in addition to an ordinary UK GDPR lawful basis, for health and other special-category data used to personalise readiness, recovery, nutrition, injury and training guidance.",
      "Legitimate interests — to prevent fraud and abuse, secure and debug the service, and understand a small set of non-sensitive product milestones. Our interests are running and improving a safe service; we do not use this basis for health-data profiling or advertising.",
      "Legal obligation and legal claims — where records must be retained for tax, accounting, dispute or regulatory purposes.",
    ],
  },
  {
    heading: "Where your data goes",
    body: ["We keep the number of third parties deliberately small. As of the date above:"],
    bullets: [
      "Supabase — hosts the database, authentication and private file storage in the project region selected by us.",
      "Cloudflare — runs the API and scheduled notification jobs.",
      "Groq, OpenRouter and NVIDIA — our configured AI-provider chain. A provider receives the coach question or generation request plus the relevant athlete context needed to answer it. Depending on the feature, that can include age, height, weight, sex, goals, training history, nutrition preferences, fatigue, sleep, pain or injury details. They do not need your payment-card details. Only the provider that handles a request processes that request.",
      "Stripe — processes payments. They receive your email and payment details directly.",
      "GitHub Pages — serves the website itself.",
      "Google Apps Script/Gmail or Resend — whichever sender we configure sends account, training and billing emails.",
    ],
  },
  {
    heading: "International transfers",
    body: [
      "Some suppliers may process information outside the UK. Before relying on such a supplier we must verify its processing locations and contract, and use a lawful transfer mechanism where required — for example UK adequacy regulations or the UK International Data Transfer Agreement/Addendum — together with a transfer risk assessment. You can ask us for the current supplier and safeguard details.",
    ],
  },
  {
    heading: "What happens to your videos",
    body: [
      "Video analysis runs entirely in your browser. Clips are never sent to an AI service or analysed on our servers — the pose model downloads to your device and the measurements are computed there. The file itself is stored privately so you can watch it back, readable only by your account.",
      "Legacy free-plan clips are deleted automatically after 14 days and current Pro clips after 180 days. You can delete any clip yourself at any time, and doing so removes the file as well as the record.",
    ],
  },
  {
    heading: "How long we keep things",
    body: [
      "Training and health entries are kept while your account is open, because their value is the history. Delete your account and we delete them.",
      "Videos follow the period above. Progress photos remain private until you delete them or the account. Notification records and Ask Coach conversations remain with the account so the history works; we should set and document shorter operational limits before public launch. Waitlist emails are kept until launch or until you ask us to remove them.",
      "Payment, fraud, complaint and legal-claim records may be kept after account deletion for the period required by law or reasonably needed to establish or defend a claim. They are not kept in the live training profile.",
    ],
  },
  {
    heading: "Notifications and email",
    body: [
      "Profile lets you switch training reminder categories and in-app training reminders on or off. Trial-ending, payment, security and other essential service messages are still sent when needed to administer your account. We keep those messages factual and do not add promotions to them.",
      "A notification record shows whether an email was accepted by the sender. Delivery, bounce and complaint events may also be retained to protect sender reputation and avoid repeatedly contacting a bad address.",
    ],
  },
  {
    heading: "Your rights",
    body: [
      "Under UK and EU data protection law you can ask us for a copy of your data, correct it, delete it, restrict or object to how we use it, or ask for it in a portable format. Most of this you can do in the app directly. For anything else, email us and we will respond within one month.",
      "You can also complain to the Information Commissioner's Office (ico.org.uk) if you think we have got something wrong. We would rather you told us first.",
    ],
  },
  {
    heading: "Security",
    body: [
      "Data is protected by row-level security in the database, meaning access is checked per row on every request rather than trusted from the app. Videos and photos sit in private buckets readable only by their owner. Payment card details never touch our systems.",
      "No system is perfect. If you find a security problem, email us and we will take it seriously.",
    ],
  },
  {
    heading: "Cookies",
    body: [
      "We do not use advertising or analytics cookies, and there is no third-party tracker anywhere in the app — no Google Analytics, no advertising pixel, nothing that reports you to another company. The app stores your login session in your browser so you stay signed in, plus a referral code if you arrived through one. That is all.",
    ],
  },
  {
    heading: "How we measure the product",
    body: [
      "When you are signed in we record a small number of product milestones — that an account was created, that onboarding finished, that a check-in happened, that a paid feature was viewed, that checkout was opened or completed. We use them to find where the app confuses people, and nothing else.",
      "These records hold the fact an event happened and its shape, such as which plan a button belonged to. They never contain your training data, your injuries, what you ate, or anything you typed. Signed-out visitors are not recorded at all, and we do not store any identifier on your device to follow you between visits.",
      "Nothing is shared with anyone. Delete your account and these records go with it.",
    ],
  },
  {
    heading: "Children",
    body: [
      "You must be at least 16 to create an account. The service is not directed at children under 16. If we learn that an under-16 has created an account, we will stop processing it and arrange deletion.",
    ],
  },
  {
    heading: "Changes",
    body: [
      "If we change this policy materially we will tell you in the app before it takes effect.",
    ],
  },
];

export const TERMS: LegalSection[] = [
  {
    heading: "The agreement",
    body: [
      `These terms are between you and ${LEGAL_ENTITY}. By creating an account you accept them. If you do not, please do not use the app.`,
    ],
  },
  {
    heading: "This is not medical advice",
    body: [
      "PocketAthlete provides general fitness and training information. It is not a doctor, physiotherapist or dietitian, and nothing it produces is a diagnosis, treatment or medical advice.",
      "Readiness scores, programs, drill recommendations, nutrition targets and video analysis are estimates generated from what you enter. They can be wrong. Treat them as a starting point for your own judgement, not an instruction.",
      "Consult a qualified professional before starting any training or nutrition programme, particularly if you are injured, have a medical condition, are pregnant, or are under 18. If you feel sharp or persistent pain, stop and see a physiotherapist or doctor. Do not use this app to decide whether an injury is safe to train through.",
    ],
  },
  {
    heading: "Training carries risk",
    body: [
      "Exercise carries inherent risks. Train within your capability, use appropriate equipment and technique, and stop if you feel sharp or persistent pain. The app cannot supervise your environment or replace a qualified professional's assessment.",
      "We are not responsible for harm caused by using the app contrary to its warnings or by information you enter inaccurately. That does not reduce our duty to use reasonable care and skill or any responsibility that cannot lawfully be excluded.",
    ],
  },
  {
    heading: "Your account",
    body: [
      "Keep your login details to yourself; you are responsible for what happens under your account. Give us accurate information — the guidance is only as good as what you enter. One account per person, and do not share access.",
      "You must be at least 16 to hold an account.",
    ],
  },
  {
    heading: "Subscriptions and payment",
    body: [
      `New subscribers start with a ${TRIAL_DAYS}-day free trial. We take your card details at sign-up but charge nothing until the trial ends; cancel before then and you pay nothing at all. The trial is once per person — if you have subscribed before, your plan starts immediately.`,
      "About 72 hours before a trial converts, we send an in-app notice and an essential email showing the planned first charge date, the actual Stripe price and billing interval, and a direct route to cancellation. Opening the in-app notice does not suppress this billing email.",
      "Paid plans are billed monthly in advance through Stripe and renew automatically until cancelled. Prices are shown before you buy.",
      "You can cancel in Profile at any time without calling or emailing us. During a trial, cancellation prevents the first charge. After payment, the plan normally runs to the end of the period paid for and does not renew. We do not normally pro-rate part months, except where the law requires a refund or another remedy.",
      "If a payment fails we may downgrade you to the free plan until it succeeds. If we change prices we will tell you first, and the change applies from your next renewal.",
      "Where you have a statutory right to cancel, that right is unaffected by anything here.",
    ],
  },
  {
    heading: "Fair use of the AI features",
    body: [
      "AI coaching runs on paid infrastructure and reasonable technical safeguards may limit abuse or unusually high automated use. We will not describe an unpublished usage cap as part of a plan unless it is shown before purchase.",
      "Uploads are limited per plan and older clips are removed on the schedule set out in the privacy policy. Do not attempt to circumvent these limits, automate requests, or resell access.",
    ],
  },
  {
    heading: "Your content",
    body: [
      "Your videos, photos and logs remain yours. You give us only the permission needed to store and display them back to you, and to share them with a coach if you choose to.",
      "Do not upload anything unlawful, or anything featuring another person without their agreement.",
    ],
  },
  {
    heading: "Our content and software",
    body: [
      "The app itself — the software, the design, the exercise and drill instructions, the position guides and the coaching text — belongs to us and is protected by copyright. Your subscription buys you the right to use it, not to own it.",
      "You may not copy, republish or redistribute our content, build a competing product from it, or reverse engineer it, except to the extent the law gives you a right that cannot be excluded. You may not use our written coaching content to train a machine-learning model.",
      "You are welcome to quote a short passage with credit and a link, and to share your own screenshots. Our name and logo remain ours.",
    ],
  },
  {
    heading: "Availability",
    body: [
      "We aim to keep the app running but do not promise it will always be available or error-free. Features may change. We may suspend accounts that break these terms or put the service at risk.",
    ],
  },
  {
    heading: "Our responsibility",
    body: [
      "Nothing here excludes or limits responsibility where the law does not allow it, including liability for death or personal injury caused by our negligence, fraud, or your mandatory consumer rights.",
      "If we fail to use reasonable care and skill, we are responsible for loss or damage that was a foreseeable result of that failure. The app is supplied for personal, non-commercial use, so we are not responsible for business losses such as lost profit or revenue. These terms do not reduce any remedy you have under consumer law.",
    ],
  },
  {
    heading: "Ending it",
    body: [
      "You can delete your account at any time, which removes your data as described in the privacy policy. We may close an account for a serious or repeated breach, and will tell you why where we can.",
    ],
  },
  {
    heading: "Law",
    body: [
      "These terms are governed by the law of England and Wales. If you live elsewhere in the UK, you keep any mandatory protections and rights to bring proceedings available where you live.",
    ],
  },
];
