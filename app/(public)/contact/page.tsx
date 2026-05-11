import type { Metadata } from "next";
import Link from "next/link";
import { HeroBackground } from "@ui/hero-background";
import { ContactForm } from "@ui/contact-form";
import { JsonLd } from "@ui/json-ld";

const SITE_URL = "https://planjekroegentocht.nl";
const TITLE = "Contact — Plan je Kroegentocht";
const DESCRIPTION = "Vraag of feedback over Plan je Kroegentocht? Stuur een bericht via het formulier of mail support@planjekroegentocht.nl. We reageren binnen 1-2 werkdagen.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/contact" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/contact`,
    siteName: "Plan je Kroegentocht",
    type: "website",
    locale: "nl_NL",
    images: [{ url: "/heroes/contact.jpg", width: 2000, height: 848, alt: "Picknicktafel met twee mokken, fruit en notitieboek bij een spelveld" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/heroes/contact.jpg"],
  },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Contact", item: `${SITE_URL}/contact` },
  ],
};

const contactPageSchema = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: "Contact — Plan je Kroegentocht",
  url: `${SITE_URL}/contact`,
  description: DESCRIPTION,
  inLanguage: "nl-NL",
  mainEntity: {
    "@type": "Organization",
    name: "Plan je Kroegentocht",
    email: "support@planjekroegentocht.nl",
    contactPoint: {
      "@type": "ContactPoint",
      email: "support@planjekroegentocht.nl",
      contactType: "customer support",
      availableLanguage: ["Dutch", "Nederlands"],
    },
  },
};

export default function ContactPage() {
  return (
    <div className="pub-page">
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={contactPageSchema} />
      <section className="pub-page-hero">
        <HeroBackground src="/heroes/contact.jpg" alt="Picknicktafel met twee mokken, fruitschaal en notitieboek bij een spelveld" />
        <h1>Vraag of feedback? We horen het graag.</h1>
        <p>Stuur je bericht en we reageren binnen 1-2 werkdagen.</p>
      </section>

      <section className="pub-section">
        <div className="pub-contact-grid">
          <div className="pub-contact-form-wrap">
            <ContactForm />
          </div>
          <div className="pub-contact-info">
            <h3>Of mail direct</h3>
            <a href="mailto:support@planjekroegentocht.nl" className="pub-contact-email">support@planjekroegentocht.nl</a>
            <p>We proberen binnen 1-2 werkdagen te reageren.</p>
            <hr style={{ border: "none", borderTop: "1px solid var(--line)", margin: "20px 0" }} />
            <p style={{ fontSize: "0.88rem", color: "var(--muted)" }}>
              Bekijk ook de <Link href="/faq" style={{ color: "var(--brand)" }}>veelgestelde vragen</Link> —
              misschien staat je antwoord er al tussen.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
