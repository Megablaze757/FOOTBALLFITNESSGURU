import type { Metadata } from "next";
import { ogImage } from "@/lib/og";
import { notFound } from "next/navigation";
import { ARTICLES, findArticle } from "@/lib/articles";
import { ArticlePage } from "@/components/ArticleBody";
import { SITE } from "@/lib/seo";

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const article = findArticle(params.slug);
  if (!article) return { title: "Not found" };
  const url = `${SITE}/articles/${article.slug}/`;
  return {
    title: article.title,
    description: article.description,
    alternates: { canonical: url },
    openGraph: {
      title: article.title,
      description: article.description,
      url,
      type: "article",
      publishedTime: article.published,
      modifiedTime: article.updated ?? article.published,
      images: ogImage(`articles-${article.slug}`, article.title),
    },
  };
}

export default function Page({ params }: { params: { slug: string } }) {
  const article = findArticle(params.slug);
  if (!article) notFound();
  return <ArticlePage article={article} />;
}
