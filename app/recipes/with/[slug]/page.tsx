import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecipeHubPage, recipeHubParams, recipeHubMetadata } from "@/components/RecipeHub";

export function generateStaticParams() {
  return recipeHubParams("ingredient");
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  return recipeHubMetadata("ingredient", params.slug) as Metadata;
}

export default function Page({ params }: { params: { slug: string } }) {
  const page = RecipeHubPage({ kind: "ingredient", slug: params.slug });
  if (!page) notFound();
  return page;
}
