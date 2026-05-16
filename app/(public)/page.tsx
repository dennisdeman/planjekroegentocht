import type { Metadata } from "next";
import Link from "next/link";
import { HeroBackground } from "@ui/hero-background";
import { JsonLd } from "@ui/json-ld";

const SITE_URL = "https://planjekroegentocht.nl";
const TITLE = "Plan je Kroegentocht — voor scholen, clubs en bedrijven";
const DESCRIPTION = "Plan je kroegentocht automatisch én draai 'm volledig digitaal: scoreapp voor scheidsrechters, centraal scorebord, publiek programma, foto's en chat. Voor scholen, clubs en bedrijven.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "Plan je Kroegentocht",
    type: "website",
    locale: "nl_NL",
    images: [{ url: "/heroes/home.jpg", width: 2000, height: 1091, alt: "Kroegentocht op een grasveld met estafettelopers en organisatoren" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/heroes/home.jpg"],
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Plan je Kroegentocht",
  alternateName: "Plan je Kroegentocht — kroegentochtplanner",
  url: SITE_URL,
  logo: `${SITE_URL}/logo-horizontaal.jpg`,
  email: "support@planjekroegentocht.nl",
  description: "Online tool voor het plannen en digitaal draaien van kroegentochten. Voor basisscholen, middelbare scholen, spelverenigingen en bedrijven.",
  foundingDate: "2026",
  founder: {
    "@type": "Organization",
    name: "Eye Catching",
    url: "https://eyecatching.cloud",
  },
  contactPoint: {
    "@type": "ContactPoint",
    email: "support@planjekroegentocht.nl",
    contactType: "customer support",
    availableLanguage: ["Dutch", "Nederlands"],
  },
  areaServed: [
    { "@type": "Country", name: "Netherlands" },
    { "@type": "Country", name: "Belgium" },
  ],
  address: {
    "@type": "PostalAddress",
    addressLocality: "Culemborg",
    addressCountry: "NL",
  },
  sameAs: ["https://eyecatching.cloud"],
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Plan je Kroegentocht",
  url: SITE_URL,
  inLanguage: "nl-NL",
  publisher: {
    "@type": "Organization",
    name: "Plan je Kroegentocht",
  },
};

const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Plan je Kroegentocht",
  description: DESCRIPTION,
  url: SITE_URL,
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "EventManagementSoftware",
  operatingSystem: "Web Browser, iOS (PWA), Android (PWA)",
  inLanguage: "nl-NL",
  image: `${SITE_URL}/heroes/home.jpg`,
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "EUR",
    lowPrice: "0",
    highPrice: "24.95",
    offerCount: 3,
    offers: [
      { "@type": "Offer", name: "Uitproberen — 7 dagen gratis", price: "0", priceCurrency: "EUR", availability: "https://schema.org/InStock" },
      { "@type": "Offer", name: "Pro Event — eenmalig", price: "9.95", priceCurrency: "EUR", availability: "https://schema.org/InStock" },
      { "@type": "Offer", name: "Pro Jaar", price: "24.95", priceCurrency: "EUR", availability: "https://schema.org/InStock" },
    ],
  },
  featureList: [
    "Automatische schema-generator met 7 wiskundige strategieën",
    "Drag-and-drop planner met conflict-validatie",
    "AI-advisor voor schema-optimalisatie",
    "Live scoreapp voor scheidsrechters (mobiel + offline)",
    "Centraal scorebord op TV/beamer",
    "Publiek programma met QR-code",
    "Chat en push-notificaties tijdens de kroegentocht",
    "Foto-upload en fullscreen slideshow",
    "Drankspellen met 20 spellen en speluitleg",
    "Materialen- en opbouwlijst",
    "Spelbegeleider-pakket en groepskaarten als PDF",
  ],
  audience: {
    "@type": "Audience",
    audienceType: "Basisscholen, middelbare scholen, spelverenigingen, bedrijven",
  },
  publisher: {
    "@type": "Organization",
    name: "Plan je Kroegentocht",
    url: SITE_URL,
  },
};

export default function HomePage() {
  return (
    <div className="pub-page">
      <JsonLd data={organizationSchema} />
      <JsonLd data={websiteSchema} />
      <JsonLd data={softwareApplicationSchema} />
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="pub-hero">
        <HeroBackground src="/heroes/home.jpg" alt="Kroegentocht op een grasveld met estafettelopers, tenten en organisatoren" />
        <div className="pub-hero-inner">
          <h1>Plan je kroegentocht — voor scholen, clubs en bedrijven</h1>
          <p className="pub-hero-sub">
            Plan automatisch een eerlijk schema. Draai je kroegentocht volledig digitaal:
            scoreapp, scorebord, programma, foto&apos;s en chat &mdash; in &eacute;&eacute;n tool.
          </p>
          <div className="pub-hero-cta">
            <Link href="/register" className="button-link btn-primary btn-lg">Gratis beginnen</Link>
            <Link href="/hoe-het-werkt" className="pub-text-link">Bekijk hoe het werkt &rarr;</Link>
          </div>
        </div>
      </section>

      {/* ── Kernvoordelen ─────────────────────────────────────────── */}
      <section className="pub-section">
        <div className="pub-cards-3">
          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{2696}\u{FE0F}"}</div>
            <h3>Eerlijk schema</h3>
            <p>
              Elke groep speelt zoveel mogelijk verschillende spellen. Tegenstanders worden
              automatisch eerlijk verdeeld. Geen groep die steeds tegen dezelfde speelt.
            </p>
          </div>
          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{26A1}"}</div>
            <h3>In minuten klaar</h3>
            <p>
              Kies je groepen, spellen en velden. De wizard begeleidt je stap voor stap.
              &Eacute;&eacute;n klik op &apos;Genereer&apos; en je rooster staat.
            </p>
          </div>
          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{1F39B}\u{FE0F}"}</div>
            <h3>Volledig digitaal draaien</h3>
            <p>
              Op de dag zelf: scheidsrechters voeren scores in op hun telefoon, het scorebord
              leeft mee op een TV, ouders volgen het programma op hun mobiel.
            </p>
          </div>
        </div>
      </section>

      {/* ── Hoe het werkt ─────────────────────────────────────────── */}
      <section className="pub-section pub-section-blue">
        <h2 className="pub-h2">Hoe het werkt</h2>
        <p className="pub-section-intro">
          Een kroegentocht plannen kost al snel een avond puzzelen in Excel. En op de dag zelf:
          scorebriefjes, telefoontjes, gestreste vrijwilligers. Plan je Kroegentocht doet het
          rekenwerk &eacute;n is daarna je centrale paneel: van de eerste configuratie tot
          de laatste foto in de slideshow.
        </p>
        <div className="pub-steps-row pub-steps-5">
          <div className="pub-step-item">
            <div className="pub-feature-card-icon">{"\u{1F9ED}"}</div>
            <h3>Configureer</h3>
            <p>Groepen, spellen, velden en tijdschema instellen via de wizard</p>
          </div>
          <div className="pub-step-item">
            <div className="pub-feature-card-icon">{"\u{1F9E0}"}</div>
            <h3>Genereer</h3>
            <p>&Eacute;&eacute;n klik: het systeem berekent het optimale schema</p>
          </div>
          <div className="pub-step-item">
            <div className="pub-feature-card-icon">{"\u{1F449}"}</div>
            <h3>Pas aan</h3>
            <p>Drag-and-drop om het rooster precies goed te krijgen</p>
          </div>
          <div className="pub-step-item">
            <div className="pub-feature-card-icon">{"\u{1F4F1}"}</div>
            <h3>Draai live</h3>
            <p>Op de dag zelf: scoreapp, scorebord, programma, chat en foto&apos;s</p>
          </div>
          <div className="pub-step-item">
            <div className="pub-feature-card-icon">{"\u{1F4E4}"}</div>
            <h3>Exporteer</h3>
            <p>Print groepskaarten, spelbegeleider-pakketten en materiaallijsten</p>
          </div>
        </div>
      </section>

      {/* ── Op de dag zelf ─────────────────────────────────────────── */}
      <section className="pub-section">
        <h2 className="pub-h2">Op de dag zelf — alles digitaal</h2>
        <p className="pub-section-intro">
          Geen losse Excel-tabellen, scorebriefjes of WhatsApp-groepjes meer. Alles draait
          via &eacute;&eacute;n centraal paneel &mdash; jij ziet realtime wat er gebeurt op
          elk veld.
        </p>
        <div className="pub-cards-4">
          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{1F4F1}"}</div>
            <h3>Scoreapp voor begeleiders</h3>
            <p>
              Scheidsrechter scant de QR, opent zijn station op zijn telefoon en voert scores
              in met +/&minus;. Werkt ook offline en synchroniseert vanzelf.
            </p>
          </div>
          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{1F3C6}"}</div>
            <h3>Centraal scorebord</h3>
            <p>
              Live ranglijst op TV of beamer met goud/zilver/brons-badges. Updatet vanzelf
              zodra een score wordt ingevoerd.
            </p>
          </div>
          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{1F4C5}"}</div>
            <h3>Publiek programma</h3>
            <p>
              Deelnemers en ouders volgen via QR het programma op hun telefoon. Met
              groep-zoeker en &quot;deel deze groep&quot;-knop.
            </p>
          </div>
          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{1F4F8}"}</div>
            <h3>Foto&apos;s &amp; slideshow</h3>
            <p>
              Begeleiders maken foto&apos;s vanuit de app. Verschijnen direct in de
              fullscreen slideshow op het hoofdpodium &mdash; jij modereert.
            </p>
          </div>
          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{1F4AC}"}</div>
            <h3>Chat &amp; broadcast</h3>
            <p>
              Bericht naar alle begeleiders tegelijk, of 1-op-1. Met push-notificaties zodat
              niets gemist wordt.
            </p>
          </div>
          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{1F4CA}"}</div>
            <h3>Voortgangsmonitor</h3>
            <p>
              Dashboard toont per station de voortgang. Achterblijvers worden rood gemarkeerd
              &mdash; jij weet meteen waar je heen moet.
            </p>
          </div>
          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{1F4DA}"}</div>
            <h3>Drankspellen</h3>
            <p>
              20 spellen met speluitleg, materialen en veldopzet ingebouwd. Vrijwilligers
              hoeven de regels niet te kennen.
            </p>
          </div>
          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{1F4E6}"}</div>
            <h3>Materialen-checklist</h3>
            <p>
              Per station &eacute;n totaal: wat moet waar liggen? Print als checklist
              voor de opbouw &apos;s ochtends.
            </p>
          </div>
        </div>
      </section>

      {/* ── Voor wie ──────────────────────────────────────────────── */}
      <section className="pub-section pub-section-gray">
        <h2 className="pub-h2">Voor wie?</h2>
        <p className="pub-section-intro">
          Of je nu de Koningsspelen organiseert voor 8 klassen of een bedrijfskroegentocht voor
          80 medewerkers, het werkt hetzelfde: groepen instellen, spellen kiezen, schema
          genereren en op de dag zelf de scoreapp en het scorebord uitdelen.
        </p>
        <div className="pub-cards-4">
          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{1F3EB}"}</div>
            <h3>Basisscholen</h3>
            <p>
              Schoolkroegentocht, Koningsspelen, onderbouw/bovenbouw apart of samen.
              Met pools kun je leeftijdsgroepen scheiden.
            </p>
            <Link href="/voor-wie" className="pub-card-link">Meer lezen &rarr;</Link>
          </div>
          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{1F393}"}</div>
            <h3>Middelbare scholen</h3>
            <p>
              Kroegentocht voor brugklassers of de hele school. Meer groepen, meer spellen,
              pools per jaarlaag.
            </p>
            <Link href="/voor-wie" className="pub-card-link">Meer lezen &rarr;</Link>
          </div>
          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{26BD}"}</div>
            <h3>Spelverenigingen</h3>
            <p>
              Clubdag, intern toernooi, meerdere spellen tegelijk. Van 6 tot 30 teams.
            </p>
            <Link href="/voor-wie" className="pub-card-link">Meer lezen &rarr;</Link>
          </div>
          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{1F3E2}"}</div>
            <h3>Bedrijven</h3>
            <p>
              Bedrijfskroegentocht, teambuilding. Snel een eerlijk schema voor afdelingen of teams.
            </p>
            <Link href="/voor-wie" className="pub-card-link">Meer lezen &rarr;</Link>
          </div>
        </div>
      </section>

      {/* ── CTA afsluiter ─────────────────────────────────────────── */}
      <section className="pub-cta-block">
        <h2>Klaar om je kroegentocht te plannen?</h2>
        <p>Gratis account aanmaken, wizard doorlopen, schema genereren. Binnen 10 minuten.</p>
        <Link href="/register" className="button-link pub-cta-btn">Gratis beginnen</Link>
      </section>
    </div>
  );
}
