import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExerciseHubPage, hubParams, hubMetadata } from "@/components/ExerciseHub";

export function generateStaticParams() {
  return hubParams("equipment");
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  return hubMetadata("equipment", params.slug) as Metadata;
}

export default function Page({ params }: { params: { slug: string } }) {
  const page = ExerciseHubPage({ kind: "equipment", slug: params.slug });
  if (!page) notFound();
  return page;
}
