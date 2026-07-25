import { LegalPage } from "@/components/LegalPage";
import { PRIVACY } from "@/lib/legal";

export const metadata = {
  title: "Privacy policy — PocketAthlete",
  description: "What PocketAthlete collects, where it goes, and what it never does with your health data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro="What we collect, where it goes, and what we don't do with it."
      sections={PRIVACY}
    />
  );
}
