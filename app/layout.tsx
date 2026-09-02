import type { Metadata, Viewport } from "next";
import { Inter, Barlow_Semi_Condensed } from "next/font/google";
import "./globals.css";
import { ChunkReloader } from "@/components/ChunkReloader";
import { PWA } from "@/components/PWA";
import { StructuredData } from "@/components/StructuredData";
import { themeBootScript } from "@/lib/theme";

// Body: Inter — a workhorse UI face, less of an "AI-template default" than Sora.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// Headings: a semi-condensed grotesque with real athletic character — the kind
// of type performance brands use on kit and scoreboards.
const display = Barlow_Semi_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

// basePath is set on GitHub Pages project sites; icon hrefs are plain strings
// that Next does NOT rewrite, so they have to carry it themselves.
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  // The template gives every child page a distinct title without repeating the
  // brand by hand. Duplicate titles across pages are one of the fastest ways to
  // stop a site ranking for anything.
  title: {
    default: "PocketAthlete — AI Athlete Coach",
    template: "%s | PocketAthlete",
  },
  description:
    "An AI performance coach in your pocket: daily readiness from your sleep and soreness, " +
    "training programs built around your sport and position, and nutrition that fits how you actually eat.",
  metadataBase: new URL("https://pocketathlete.com"),
  alternates: { canonical: "/" },
  keywords: [
    "athlete training app", "football fitness program", "sports readiness score",
    "position specific training", "AI training program", "recovery tracking",
  ],
  manifest: `${base}/manifest.webmanifest`,
  // Tells iOS to open from the home screen without Safari's chrome. iOS ignores
  // the manifest's display mode and reads this instead.
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "PocketAthlete" },
  // Sized deliberately: the tab favicon is fetched on every single page, so it
  // is the 5.7KB 64px one. The heavier artwork is reserved for the install icon
  // and link previews, which are fetched once.
  icons: {
    icon: `${base}/icon-64.png`,
    shortcut: `${base}/icon-64.png`,
    // THE HOME-SCREEN ICON MUST BE OPAQUE. This pointed at logo.png, which has
    // a transparent background — and iOS composites transparency onto WHITE.
    // So a gold mark designed for a near-black app sat on a white tile among
    // the user's other icons, looking like a different product.
    //
    // apple-touch-icon.png is the same artwork flattened onto #0a0a0b, the
    // app's own background and the manifest's, at 180px — the size iOS asks
    // for — with 12% padding. iOS does not mask this icon, it rounds the
    // corners, so artwork running to the edge gets clipped at the radius.
    apple: `${base}/apple-touch-icon.png`,
  },
  // What shows up when someone shares the link — it was a bare URL before.
  openGraph: {
    type: "website",
    siteName: "PocketAthlete",
    title: "PocketAthlete — AI Athlete Coach",
    description: "Daily readiness, position-specific programs and nutrition that fits how you actually eat.",
    url: "https://pocketathlete.com",
    // icon-512, not logo.png: the latter is transparent, and link-preview
    // renderers composite that onto whatever they like — usually white, which
    // is the same wrong-looking tile the home-screen icon had.
    images: [{ url: `${base}/icon-512.png`, width: 512, height: 512, alt: "PocketAthlete" }],
  },
  twitter: {
    card: "summary",
    title: "PocketAthlete — AI Athlete Coach",
    description: "Daily readiness, position-specific programs and nutrition that fits how you actually eat.",
    images: [`${base}/icon-512.png`],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // NO maximumScale. It was 1, which silently disables pinch-zoom — a WCAG 1.4.4
  // failure, and one that hits exactly the people who most need it: anyone
  // reading a 10px macro label or a rehab instruction with less than perfect
  // eyesight, on a phone, outdoors.
  //
  // It is almost always added to stop iOS zooming when a text input is focused.
  // The actual cause of that is a font-size below 16px on the input, and the
  // fix is to size the input properly (see `.field` in globals.css), not to
  // take zoom away from everyone. Caught by axe in the e2e suite.
  themeColor: "#0a0a0b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${inter.variable} ${display.variable}`}>
      <head>
        {/*
          BEFORE THE FIRST PAINT, and it has to be here rather than in a
          component. Without it the page renders dark, hydrates, then turns
          light — a full-screen flash on every load for anybody who chose
          light, which is the one thing people remember about theme switching.

          Blocking and inline on purpose: an async script runs after paint,
          which is the bug. It stamps nothing when the preference is "system",
          because the stylesheet's media query already handles that.
        */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript() }} />
      </head>
      <body className="font-sans">
        <StructuredData />
        <ChunkReloader />
        <PWA />
        {children}
      </body>
    </html>
  );
}
