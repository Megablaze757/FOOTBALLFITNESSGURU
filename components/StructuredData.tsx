import { PUBLISHER, jsonLd } from "@/lib/schema";
import { PLANS } from "@/lib/subscription";

/**
 * Schema.org JSON-LD.
 *
 * Server-rendered into the HTML, which is the point — this is what lets a
 * search engine show the app as a product with a price rather than as a page
 * of blue text, and it can only do that if the markup is in the response.
 *
 * Everything here must stay true. Marking up a rating or a review count you
 * don't have is a manual-action risk, so there is deliberately no
 * aggregateRating until there are real reviews to point at.
 */
export function StructuredData() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      // The same node the page-level graphs reference. Defined once: two
      // Organization nodes with different @ids would split the entity in half,
      // and an answer engine would have two half-described publishers to choose
      // between rather than one it can attribute to.
      { ...PUBLISHER, email: "info@pocketathlete.com", areaServed: "GB" },
      {
        "@type": "WebSite",
        "@id": "https://pocketathlete.com/#site",
        url: "https://pocketathlete.com",
        name: "PocketAthlete",
        publisher: { "@id": PUBLISHER["@id"] },
      },
      {
        "@type": "SoftwareApplication",
        name: "PocketAthlete",
        applicationCategory: "HealthApplication",
        operatingSystem: "Web, iOS, Android",
        description:
          "An AI performance coach: daily readiness from sleep and soreness, training programs " +
          "built around your sport and position, and nutrition planning.",
        url: "https://pocketathlete.com",
        publisher: { "@id": PUBLISHER["@id"] },
        // Derived, not typed out. A price written twice is a price that
        // eventually disagrees with itself — and this is the copy Google
        // shows next to the result.
        offers: PLANS.map((plan) => ({
          "@type": "Offer",
          name: plan.name,
          price: String(plan.priceMonthly),
          priceCurrency: "GBP",
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "What does PocketAthlete actually do?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "You log each morning: sleep, soreness and fatigue. It scores your " +
                "readiness, adjusts that day's session, and builds four-week training blocks around " +
                "your sport, your position and the equipment you have.",
            },
          },
          {
            "@type": "Question",
            name: "Is it only for footballers?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "No. It covers football, rugby, basketball, running, weightlifting and general gym " +
                "training, with position-specific work for the team sports.",
            },
          },
          {
            "@type": "Question",
            name: "Do I need a gym?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "No. Tell it what you have and it programs around it. Many of the technical drills " +
                "need nothing but a ball and a wall.",
            },
          },
          {
            "@type": "Question",
            name: "Can it work around an injury?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "It works around soreness you log and avoids body parts you tell it to leave alone. " +
                "It is general training information, not medical advice — see a physiotherapist for " +
                "a diagnosis.",
            },
          },
        ],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is data we just built, not user input; the escape
      // guards against a "</script>" ever appearing in a copy change.
      dangerouslySetInnerHTML={{ __html: jsonLd(data) }}
    />
  );
}
