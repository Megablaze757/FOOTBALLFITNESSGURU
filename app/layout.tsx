import type { Metadata, Viewport } from "next";
import { Sora } from "next/font/google";
import "./globals.css";
import { ChunkReloader } from "@/components/ChunkReloader";

const sora = Sora({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "PocketAthlete — AI Athlete Coach",
  description: "Your daily recovery, readiness and performance coach.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a0b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sora.variable}>
      <body className="font-sans">
        <ChunkReloader />
        {children}
      </body>
    </html>
  );
}
