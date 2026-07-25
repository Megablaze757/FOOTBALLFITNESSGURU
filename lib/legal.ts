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

export const LEGAL_UPDATED = "25 July 2026";
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
      "Pain, injury and body-composition entries are health data, which the law treats more strictly than ordinary personal data. We process it solely to give you the training and recovery guidance you asked for, on the basis of your explicit consent — given by entering it. You can withdraw that consent at any time by deleting the entries or your account.",
      "We do not sell it, share it with advertisers, or use it to make automated decisions with legal or similarly significant effects. Your readiness score is guidance, not a decision about you.",
    ],
  },
  {
    heading: "Where your data goes",
    body: ["We keep the number of third parties deliberately small. As of the date above:"],
    bullets: [
      "Supabase — hosts the database, authentication and file storage. Data is held in the EU (eu-west-3).",
      "Cloudflare — runs the API that talks to the services below.",
      "OpenRouter — receives the text of AI coach requests so a model can answer them. This includes what you type into the coach and the goals, soreness areas and notes attached to a program request. It does not receive your email, name, videos or photos.",
      "Stripe — processes payments. They receive your email and payment details directly.",
      "GitHub Pages — serves the website itself.",
      "An email provider — sends reminders and account emails.",
    ],
  },
  {
    heading: "What happens to your videos",
    body: [
      "Video analysis runs entirely in your browser. Clips are never sent to an AI service or analysed on our servers — the pose model downloads to your device and the measurements are computed there. The file itself is stored privately so you can watch it back, readable only by your account.",
      "Clips are deleted automatically after 14 days on the free plan, 60 days on Silver and 180 days on Gold. You can delete any clip yourself at any time, and doing so removes the file as well as the record.",
    ],
  },
  {
    heading: "How long we keep things",
    body: [
      "Training and health entries are kept while your account is open, because their value is the history. Delete your account and we delete them.",
      "Videos and photos follow the retention periods above. Waitlist emails are kept until we launch or you ask us to remove you.",
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
      "We do not use advertising or analytics cookies. The app stores your login session in your browser so you stay signed in, plus a referral code if you arrived through one. That is all.",
    ],
  },
  {
    heading: "Children",
    body: [
      "The app is not intended for under-16s. If you are under 16, please do not sign up without a parent or guardian, and speak to a qualified coach before following any training plan.",
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
      "Exercise can cause injury. You take part at your own risk and are responsible for training within your capability, using proper technique, and stopping when something hurts. To the fullest extent the law allows, we are not liable for injury, loss or damage arising from following guidance in the app.",
      "Nothing in these terms limits liability for death or personal injury caused by our negligence, for fraud, or for anything else that cannot lawfully be excluded.",
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
      "Paid plans are billed monthly in advance through Stripe and renew automatically until cancelled. Prices are shown before you buy.",
      "You can cancel any time; the plan runs to the end of the period you have paid for and does not renew. We do not pro-rate part months.",
      "If a payment fails we may downgrade you to the free plan until it succeeds. If we change prices we will tell you first, and the change applies from your next renewal.",
      "Where you have a statutory right to cancel, that right is unaffected by anything here.",
    ],
  },
  {
    heading: "Fair use of the AI features",
    body: [
      "AI coaching runs on paid infrastructure, so each plan carries a monthly allowance. Reaching it does not break the app — the on-device coach continues to work — but AI-written responses pause until the next month or until you upgrade.",
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
    heading: "Availability",
    body: [
      "We aim to keep the app running but do not promise it will always be available or error-free. Features may change. We may suspend accounts that break these terms or put the service at risk.",
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
      "These terms are governed by the law of England and Wales, and its courts have jurisdiction.",
    ],
  },
];
