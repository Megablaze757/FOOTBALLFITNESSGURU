import { LegalPage } from "@/components/LegalPage";
import { TERMS } from "@/lib/legal";

export const metadata = {
  title: "Terms of service — PocketAthlete",
  description: "The agreement for using PocketAthlete, including the health disclaimer and subscription terms.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      intro="The rules of the road. The short version: this is training guidance, not medical advice."
      sections={TERMS}
    />
  );
}
