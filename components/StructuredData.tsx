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
      {
        "@type": "Organization",
        "@id": "https://pocketathlete.com/#org",
        name: "PocketAthlete",
        url: "https://pocketathlete.com",
        logo: "https://pocketathlete.com/logo.png",
        email: "info@pocketathlete.com",
      },
      {
        "@type": "WebSite",
        "@id": "https://pocketathlete.com/#site",
        url: "https://pocketathlete.com",
        name: "PocketAthlete",
        publisher: { "@id": "https://pocketathlete.com/#org" },
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
        publisher: { "@id": "https://pocketathlete.com/#org" },
        offers: [
          { "@type": "Offer", name: "Free", price: "0", priceCurrency: "GBP" },
          { "@type": "Offer", name: "Pro", price: "15", priceCurrency: "GBP" },
        ],
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
                "You check in each morning with your sleep, soreness and fatigue. It scores your " +
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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
