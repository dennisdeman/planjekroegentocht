import type { Metadata } from "next";
import Link from "next/link";
import { HeroBackground } from "@ui/hero-background";
import { JsonLd } from "@ui/json-ld";
import { getAllPosts } from "@lib/blog";

const SITE_URL = "https://planjekroegentocht.nl";
const TITLE = "Blog — Plan je Kroegentocht";
const DESCRIPTION = "Praktische gidsen, draaiboeken en inspiratie voor het organiseren van een kroegentocht, Koningsspelen, zeskamp of bedrijfskroegentocht.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/blog" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/blog`,
    siteName: "Plan je Kroegentocht",
    type: "website",
    locale: "nl_NL",
    images: [{ url: "/heroes/blog.jpg", width: 2000, height: 1091, alt: "Workspace met laptop, planning en koffie bij een raam met uitzicht op een spelveld" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/heroes/blog.jpg"],
  },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
  ],
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

export default function BlogIndexPage() {
  const posts = getAllPosts();

  const blogSchema = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Plan je Kroegentocht — Blog",
    url: `${SITE_URL}/blog`,
    description: DESCRIPTION,
    inLanguage: "nl-NL",
    blogPost: posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      description: p.description,
      url: `${SITE_URL}/blog/${p.slug}`,
      datePublished: p.date,
      author: { "@type": "Organization", name: p.author || "Plan je Kroegentocht" },
    })),
  };

  return (
    <div className="pub-page">
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={blogSchema} />

      <section className="pub-page-hero">
        <HeroBackground src="/heroes/blog.jpg" alt="Workspace met laptop en planning bij een raam met uitzicht op een spelveld" />
        <h1>Blog</h1>
        <p>Gidsen, draaiboeken en inspiratie voor jouw kroegentocht.</p>
      </section>

      <section className="pub-section">
        {posts.length === 0 ? (
          <p className="pub-section-intro">
            We zijn aan het schrijven — binnenkort vind je hier praktische gidsen
            over schoolkroegentochten, Koningsspelen, zeskampen en bedrijfskroegentochten.
          </p>
        ) : (
          <div className="pub-blog-list">
            {posts.map((p) => (
              <Link key={p.slug} href={`/blog/${p.slug}`} className="pub-blog-card">
                {p.image && (
                  <div
                    className="pub-blog-card-image"
                    style={{ backgroundImage: `url(${p.image})` }}
                    aria-label={p.imageAlt || ""}
                  />
                )}
                <div className="pub-blog-card-body">
                  <div className="pub-blog-card-meta">
                    <time dateTime={p.date}>{formatDate(p.date)}</time>
                    <span aria-hidden="true"> · </span>
                    <span>{p.readingMinutes} min lezen</span>
                  </div>
                  <h2 className="pub-blog-card-title">{p.title}</h2>
                  <p className="pub-blog-card-desc">{p.description}</p>
                  {p.tags && p.tags.length > 0 && (
                    <div className="pub-blog-card-tags">
                      {p.tags.map((t) => (
                        <span key={t} className="pub-blog-tag">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="pub-cta-block">
        <h2>Direct beginnen met je eigen kroegentocht?</h2>
        <p>Maak gratis een account aan en ontdek hoe makkelijk het is.</p>
        <Link href="/register" className="button-link pub-cta-btn">Gratis beginnen</Link>
      </section>
    </div>
  );
}
