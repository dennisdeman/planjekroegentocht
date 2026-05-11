import type { Metadata } from "next";
import Link from "next/link";
import { HeroBackground } from "@ui/hero-background";
import { JsonLd } from "@ui/json-ld";

const SITE_URL = "https://planjekroegentocht.nl";
const TITLE = "Over Plan je Kroegentocht";
const DESCRIPTION = "Plan je Kroegentocht is gemaakt door Eye Catching, een Nederlandse softwarestudio. Een tool die niet alleen plant, maar je kroegentocht ook volledig digitaal laat draaien. Voor scholen, clubs en bedrijven.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/over-ons" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/over-ons`,
    siteName: "Plan je Kroegentocht",
    type: "website",
    locale: "nl_NL",
    images: [{ url: "/heroes/over-ons.jpg", width: 2000, height: 848, alt: "Spelveld in avondlicht met joggende volwassenen, volleybal en organisatoren met klembord" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/heroes/over-ons.jpg"],
  },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Over ons", item: `${SITE_URL}/over-ons` },
  ],
};

const aboutPageSchema = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: TITLE,
  url: `${SITE_URL}/over-ons`,
  description: DESCRIPTION,
  inLanguage: "nl-NL",
  mainEntity: {
    "@type": "Organization",
    name: "Plan je Kroegentocht",
    description: "Online tool voor het plannen en digitaal draaien van kroegentochten — voor basisscholen, middelbare scholen, spelverenigingen en bedrijven.",
    url: SITE_URL,
    logo: `${SITE_URL}/logo-horizontaal.jpg`,
    email: "support@planjekroegentocht.nl",
    foundingDate: "2026",
    founder: {
      "@type": "Organization",
      name: "Eye Catching",
      url: "https://eyecatching.cloud",
    },
    parentOrganization: {
      "@type": "Organization",
      name: "Eye Catching",
      url: "https://eyecatching.cloud",
    },
    knowsAbout: [
      "Kroegentocht organiseren",
      "Schoolkroegentocht",
      "Koningsspelen",
      "Zeskamp",
      "Roostergeneratie",
      "Latin-rectangle scheduling",
      "Round-robin tournament scheduling",
      "Scoreapps voor scheidsrechters",
      "Live event management",
      "Bedrijfsuitje",
      "Personeelsdag",
    ],
    areaServed: [
      { "@type": "Country", name: "Netherlands" },
      { "@type": "Country", name: "Belgium" },
    ],
    address: {
      "@type": "PostalAddress",
      addressLocality: "Culemborg",
      addressCountry: "NL",
    },
  },
};

export default function OverOnsPage() {
  return (
    <div className="pub-page">
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={aboutPageSchema} />

      <section className="pub-page-hero">
        <HeroBackground src="/heroes/over-ons.jpg" alt="Spelveld in avondlicht met joggende volwassenen, volleybal en organisatoren met klembord" />
        <h1>Over Plan je Kroegentocht</h1>
        <p>Een tool die niet alleen plant, maar je kroegentocht ook draait.</p>
      </section>

      {/* Verhaal */}
      <section className="pub-section">
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2 className="pub-h2" style={{ textAlign: "left", marginBottom: 16 }}>Wat begon als eigen frustratie</h2>
          <p style={{ fontSize: "1rem", lineHeight: 1.8, color: "var(--text)", marginBottom: 18 }}>
            Plan je Kroegentocht is ontwikkeld door <a href="https://eyecatching.cloud" target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand)" }}>Eye Catching</a>,
            een Nederlandse softwarestudio gevestigd in Culemborg. We bouwden de tool
            oorspronkelijk voor onszelf. Als ouders en vrijwilligers op de kroegentochten van
            onze kinderen zagen we steeds hetzelfde patroon: het rooster klopte niet, groepen
            liepen elkaar in de weg, of een team stond een half uur stil omdat het spelveld
            dubbel geboekt was.
          </p>
          <p style={{ fontSize: "1rem", lineHeight: 1.8, color: "var(--text)", marginBottom: 18 }}>
            Excel is daar simpelweg niet voor gemaakt. Een gemiddelde kroegentocht of zeskamp
            combineert 16 groepen, 8 spellen en 6 rondes — dat zijn duizenden mogelijke
            combinaties met conflict-checks, eerlijke verdeling over locaties en begeleiders,
            en de regel dat geen enkele groep dezelfde spel twee keer doet. Handmatig
            roosteren kost een organisator een hele avond; en dan klopt het meestal nog
            steeds niet.
          </p>
          <p style={{ fontSize: "1rem", lineHeight: 1.8, color: "var(--text)", marginBottom: 18 }}>
            Toen ons planningsalgoritme eenmaal werkte, was de logische vervolgstap om het
            beschikbaar te maken voor andere organisatoren. Daarna zijn we doorgegaan met wat
            een kroegentocht écht nodig heeft — niet alleen het rooster, maar de hele dag dekkend:
          </p>
          <ul style={{ fontSize: "0.95rem", lineHeight: 1.8, color: "var(--text)", paddingLeft: 24, marginBottom: 18 }}>
            <li>Roostergenerator met Latin-rectangle scheduling en conflict-detectie</li>
            <li>Scoreapp voor spelbegeleiders om resultaten direct in te voeren</li>
            <li>Live scorebord voor publiek en deelnemers</li>
            <li>Programmaweergave met rolspecifieke toegang (organisator, begeleider, publiek)</li>
            <li>Foto- en chatfunctie voor de dag zelf</li>
          </ul>
          <p style={{ fontSize: "1rem", lineHeight: 1.8, color: "var(--text)", marginBottom: 18 }}>
            Eén tool, één dag, geen losse Excel-bestanden meer.
          </p>
          <p style={{ fontSize: "1rem", lineHeight: 1.8, color: "var(--text)" }}>
            Plan je Kroegentocht is gemaakt voor basisscholen, middelbare scholen, spelverenigingen,
            bedrijven en evenementenorganisatoren in Nederland en België — van schoolkroegentochten
            en zeskampen tot bedrijfsuitjes en personeelsdagen.
          </p>
        </div>
      </section>

      {/* Wat anders */}
      <section className="pub-section pub-section-blue">
        <h2 className="pub-h2">Wat we anders doen</h2>
        <div className="pub-cards-3">
          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{1F3AF}"}</div>
            <h3>Niet alleen plannen, ook draaien</h3>
            <p>
              De meeste kroegentocht-tools stoppen bij het rooster. Wij gaan door tot en met
              de scoreapp, het centrale scorebord, foto&apos;s en chat op de dag zelf.
              Eén centraal paneel voor de hele organisatie.
            </p>
          </div>
          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{1F4B6}"}</div>
            <h3>Eerlijk geprijsd</h3>
            <p>
              €0 om uit te proberen. €9,95 voor één evenement. €24,95 per jaar voor wie
              vaker organiseert. Geen abonnement-fop, geen verborgen limieten,
              geen creditcard om te starten.
            </p>
          </div>
          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{1F310}"}</div>
            <h3>Voor iedereen</h3>
            <p>
              Werkt voor 16 basisschoolklassen, 24 middelbare-scholenklassen, 30
              spelclub-teams, of 80 collega&apos;s bij een bedrijfskroegentocht. Eén tool,
              dezelfde aanpak — alleen de schaal verschilt.
            </p>
          </div>
        </div>
      </section>

      {/* Onder de motorkap */}
      <section className="pub-section">
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2 className="pub-h2" style={{ textAlign: "left", marginBottom: 16 }}>Hoe het is gebouwd</h2>
          <p style={{ fontSize: "1rem", lineHeight: 1.8, color: "var(--text)", marginBottom: 18 }}>
            Plan je Kroegentocht draait op moderne, open standaarden:
          </p>
          <ul style={{ fontSize: "0.95rem", lineHeight: 1.8, color: "var(--text)", paddingLeft: 24, marginBottom: 18 }}>
            <li><strong>Frontend</strong>: Next.js 15 + React 19 — snel, server-rendered, mobile-first.</li>
            <li><strong>Data</strong>: PostgreSQL voor je kroegentochten, Cloudflare R2 voor foto&apos;s. Allemaal in de EU.</li>
            <li><strong>Live-modus</strong>: PWA + Web Push + Service Worker — werkt offline op het spelveld.</li>
            <li><strong>Betalingen</strong>: iDEAL via Mollie. Automatische factuur per e-mail.</li>
            <li><strong>Geen lock-in</strong>: je data is van jou, exporteren naar Excel/CSV/PDF kan altijd.</li>
          </ul>
          <p style={{ fontSize: "1rem", lineHeight: 1.8, color: "var(--text)" }}>
            We zijn een klein team. Mail support@planjekroegentocht.nl en je krijgt antwoord
            van een mens — geen bot-eerstelijn, geen ticketnummers.
          </p>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="pub-cta-block">
        <h2>Vraag, idee of feedback?</h2>
        <p>We horen het graag. Een kort mailtje is genoeg om iets te veranderen.</p>
        <div className="pub-hero-cta" style={{ justifyContent: "center" }}>
          <Link href="/contact" className="button-link pub-cta-btn">Neem contact op</Link>
          <Link href="/register" className="pub-text-link" style={{ color: "rgba(255,255,255,0.85)" }}>Of begin direct gratis &rarr;</Link>
        </div>
      </section>
    </div>
  );
}
