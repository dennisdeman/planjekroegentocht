import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@ui/json-ld";
import { getPost, getAllSlugs, getAllPosts } from "@lib/blog";

const SITE_URL = "https://planjekroegentocht.nl";

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Niet gevonden" };

  const url = `${SITE_URL}/blog/${slug}`;
  const image = post.image ? `${SITE_URL}${post.image}` : `${SITE_URL}/heroes/home.jpg`;

  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      siteName: "Plan je Kroegentocht",
      type: "article",
      locale: "nl_NL",
      publishedTime: post.date,
      authors: [post.author || "Plan je Kroegentocht"],
      tags: post.tags,
      images: [{ url: image, alt: post.imageAlt || post.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [image],
    },
  };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

export default async function BlogPostPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const allPosts = getAllPosts();
  const related = allPosts.filter((p) => p.slug !== slug).slice(0, 3);

  const url = `${SITE_URL}/blog/${slug}`;
  const image = post.image ? `${SITE_URL}${post.image}` : `${SITE_URL}/heroes/home.jpg`;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    image,
    datePublished: post.date,
    dateModified: post.date,
    author: {
      "@type": post.author && post.author !== "Plan je Kroegentocht" ? "Person" : "Organization",
      name: post.author || "Plan je Kroegentocht",
    },
    publisher: {
      "@type": "Organization",
      name: "Plan je Kroegentocht",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo-horizontaal.jpg`,
      },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    inLanguage: "nl-NL",
    keywords: post.tags?.join(", "),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };

  return (
    <div className="pub-page">
      <JsonLd data={articleSchema} />
      <JsonLd data={breadcrumbSchema} />

      <article className="pub-blog-article">
        <header className="pub-blog-article-header">
          <Link href="/blog" className="pub-blog-back">&larr; Terug naar overzicht</Link>
          <h1>{post.title}</h1>
          <p className="pub-blog-article-lede">{post.description}</p>
          <div className="pub-blog-article-meta">
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            <span aria-hidden="true"> · </span>
            <span>{post.readingMinutes} min lezen</span>
            {post.author && (
              <>
                <span aria-hidden="true"> · </span>
                <span>{post.author}</span>
              </>
            )}
          </div>
          {post.image && (
            <div className="pub-blog-article-hero" style={{ backgroundImage: `url(${post.image})` }} aria-label={post.imageAlt || ""} />
          )}
        </header>

        <div className="pub-blog-article-body" dangerouslySetInnerHTML={{ __html: post.contentHtml }} />

        {post.tags && post.tags.length > 0 && (
          <div className="pub-blog-article-tags">
            {post.tags.map((t) => (
              <span key={t} className="pub-blog-tag">{t}</span>
            ))}
          </div>
        )}
      </article>

      {related.length > 0 && (
        <section className="pub-section pub-section-blue">
          <h2 className="pub-h2">Lees ook</h2>
          <div className="pub-blog-list">
            {related.map((p) => (
              <Link key={p.slug} href={`/blog/${p.slug}`} className="pub-blog-card">
                <div className="pub-blog-card-body">
                  <div className="pub-blog-card-meta">
                    <time dateTime={p.date}>{formatDate(p.date)}</time>
                    <span aria-hidden="true"> · </span>
                    <span>{p.readingMinutes} min</span>
                  </div>
                  <h3 className="pub-blog-card-title">{p.title}</h3>
                  <p className="pub-blog-card-desc">{p.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="pub-cta-block">
        <h2>Klaar om je kroegentocht te plannen?</h2>
        <p>Probeer Plan je Kroegentocht 7 dagen gratis. Geen creditcard nodig.</p>
        <Link href="/register" className="button-link pub-cta-btn">Gratis beginnen</Link>
      </section>
    </div>
  );
}
