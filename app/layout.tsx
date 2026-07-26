import type { Metadata, Viewport } from "next";
import { Inter, Barlow_Semi_Condensed } from "next/font/google";
import "./globals.css";
import { ChunkReloader } from "@/components/ChunkReloader";

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
  title: "PocketAthlete — AI Athlete Coach",
  description: "Your daily recovery, readiness and performance coach.",
  icons: {
    icon: `${base}/logo.png`,
    shortcut: `${base}/logo.png`,
    apple: `${base}/logo.png`,
  },
  // What shows up when someone shares the link — currently a bare URL.
  openGraph: {
    title: "PocketAthlete — AI Athlete Coach",
    description: "Your daily recovery, readiness and performance coach.",
    images: [`${base}/logo.png`],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a0b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body className="font-sans">
        <ChunkReloader />
        {children}
      </body>
    </html>
  );
}
