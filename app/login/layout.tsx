import type { Metadata } from "next";

// A sign-in form has nothing to rank for, and letting it into the index means
// competing with the landing page for brand searches with a worse result.
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
