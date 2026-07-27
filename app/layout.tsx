import type { Metadata, Viewport } from "next";
import { Inter, Barlow_Semi_Condensed } from "next/font/google";
import "./globals.css";
import { ChunkReloader } from "@/components/ChunkReloader";
import { PWA } from "@/components/PWA";
import { StructuredData } from "@/components/StructuredData";

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
  // Sized deliberately: the 512 is a 295KB brushed-gold texture that doesn't
  // compress losslessly, so it's reserved for the install icon and link
  // previews. The tab favicon — fetched on every single page — is the 5.7KB one.
  icons: {
    icon: `${base}/icon-64.png`,
    shortcut: `${base}/icon-64.png`,
    apple: `${base}/logo.png`,
  },
  // What shows up when someone shares the link — it was a bare URL before.
  openGraph: {
    type: "website",
    siteName: "PocketAthlete",
    title: "PocketAthlete — AI Athlete Coach",
    description: "Daily readiness, position-specific programs and nutrition that fits how you actually eat.",
    url: "https://pocketathlete.com",
    images: [{ url: `${base}/logo.png`, width: 512, height: 512, alt: "PocketAthlete" }],
  },
  twitter: {
    card: "summary",
    title: "PocketAthlete — AI Athlete Coach",
    description: "Daily readiness, position-specific programs and nutrition that fits how you actually eat.",
    images: [`${base}/logo.png`],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a0b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${inter.variable} ${display.variable}`}>
      <body className="font-sans">
        <StructuredData />
        <ChunkReloader />
        <PWA />
        {children}
      </body>
    </html>
  );
}
