import type { Metadata } from "next";
import Link from "next/link";
import { HeroBackground } from "@ui/hero-background";
import { JsonLd } from "@ui/json-ld";

const SITE_URL = "https://planjekroegentocht.nl";
const TITLE = "Prijzen — Plan je Kroegentocht";
const DESCRIPTION = "Start gratis. Betaal alleen als je meer nodig hebt. Transparante prijzen voor Plan je Kroegentocht — inclusief live-modus, scoreapp, scorebord en foto's.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/prijzen" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/prijzen`,
    siteName: "Plan je Kroegentocht",
    type: "website",
    locale: "nl_NL",
    images: [{ url: "/heroes/prijzen.jpg", width: 2000, height: 1091, alt: "Workspace met laptop, schedule en koffie bij een raam met uitzicht op een spelveld" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/heroes/prijzen.jpg"],
  },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Prijzen", item: `${SITE_URL}/prijzen` },
  ],
};

const productSchema = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Plan je Kroegentocht",
  description: DESCRIPTION,
  brand: { "@type": "Brand", name: "Plan je Kroegentocht" },
  image: `${SITE_URL}/heroes/prijzen.jpg`,
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "EUR",
    lowPrice: "0",
    highPrice: "24.95",
    offerCount: 3,
    offers: [
      {
        "@type": "Offer",
        name: "Uitproberen",
        description: "7 dagen gratis — wizard, generator en planner. Geen creditcard nodig.",
        price: "0",
        priceCurrency: "EUR",
        availability: "https://schema.org/InStock",
        url: `${SITE_URL}/register`,
      },
      {
        "@type": "Offer",
        name: "Pro Event",
        description: "Eenmalig voor één kroegentocht — inclusief live-modus, scoreapp, scorebord, programma, chat, foto's en alle exports.",
        price: "9.95",
        priceCurrency: "EUR",
        availability: "https://schema.org/InStock",
        url: `${SITE_URL}/register`,
      },
      {
        "@type": "Offer",
        name: "Pro Jaar",
        description: "Onbeperkt kroegentochten per jaar, eigen sjablonen, eigen spellenbibliotheek, tot 5 teamleden.",
        price: "24.95",
        priceCurrency: "EUR",
        availability: "https://schema.org/InStock",
        url: `${SITE_URL}/register`,
      },
    ],
  },
};

const PRICING_FAQ = [
  { q: "Kan ik het eerst uitproberen?", a: "Ja. Je krijgt 7 dagen gratis toegang om de wizard, generator en planner uit te proberen. Tot 8 groepen, geen live-modus, geen exports. Geen creditcard nodig." },
  { q: "Wat krijg ik er extra bij Pro Event ten opzichte van gratis?", a: "Het belangrijkste verschil: Pro Event geeft je toegang tot de live-modus. Daarmee kun je je kroegentocht op de dag zelf volledig digitaal draaien — scoreapp voor begeleiders, centraal scorebord, publiek programma met QR, chat, foto's en slideshow. Plus alle PDF-exports en de AI-advisor." },
  { q: "Wat gebeurt er na de 7 dagen proefperiode?", a: "Je wordt gevraagd om te upgraden. Je configuratie blijft bewaard en is weer toegankelijk zodra je upgradet." },
  { q: "Wat gebeurt er na 30 dagen Pro Event?", a: "Je planning bevriest: je kunt hem nog bekijken maar niet meer bewerken of exporteren. De live-modus is dan ook afgesloten. Wil je weer aanpassen of een nieuwe kroegentocht maken? Koop opnieuw Pro Event of upgrade naar Pro Jaar." },
  { q: "Wat als ik elk jaar een kroegentocht organiseer?", a: "Met Pro Jaar bewaar je je sjablonen en je eigen spellenbibliotheek. Volgend jaar open je je sjabloon, past de groepsnamen aan, en je bent klaar." },
  { q: "Kan ik met collega's samenwerken?", a: "Met Pro Jaar kun je tot 5 teamleden uitnodigen in je organisatie. Iedereen kan planningen bekijken, bewerken en de spellenbibliotheek delen." },
  { q: "Wij zijn een stichting met meerdere scholen.", a: "Neem contact met ons op via support@planjekroegentocht.nl, dan bespreken we een stichtingslicentie." },
  { q: "Kan ik upgraden van Pro Event naar Pro Jaar?", a: "Ja, op elk moment. Je betaalt naar rato bij — alleen het verschil voor de resterende tijd, en je krijgt direct alle extra functies." },
  { q: "Hoe werkt betalen?", a: "Via iDEAL of bankoverschrijving (Mollie). Je ontvangt automatisch een factuur per e-mail. Voor zakelijk: je kunt bedrijfsgegevens en BTW-nummer invullen voor een correcte factuur." },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: PRICING_FAQ.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

export default function PrijzenPage() {
  return (
    <div className="pub-page">
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={productSchema} />
      <JsonLd data={faqSchema} />
      <section className="pub-page-hero">
        <HeroBackground src="/heroes/prijzen.jpg" alt="Workspace met laptop, schedule en koffie bij een raam met uitzicht op een spelveld" />
        <h1>Eerlijk geprijsd, net als je kroegentocht</h1>
        <p>Probeer het 7 dagen gratis. Betaal alleen als je meer nodig hebt.</p>
      </section>

      <section className="pub-section">
        <div className="pub-pricing-grid-3">
          {/* Free */}
          <div className="pub-pricing-card">
            <div className="pub-pricing-header">
              <h3>Uitproberen</h3>
              <div className="pub-pricing-price">&euro;0</div>
              <small className="pub-pricing-period">7 dagen gratis</small>
            </div>
            <p className="pub-pricing-desc">Ervaar het plannen met een kleine kroegentocht. Wizard, generator en planner inbegrepen.</p>
            <ul className="pub-pricing-features">
              <li>Tot 8 groepen</li>
              <li>Schema genereren en bekijken</li>
              <li>Drag-and-drop aanpassen</li>
              <li>Mobiel bekijken</li>
              <li>7 dagen toegang</li>
              <li className="pub-pricing-excluded">Geen live-modus / scoreapp</li>
              <li className="pub-pricing-excluded">Geen scorebord, programma of foto&apos;s</li>
              <li className="pub-pricing-excluded">Geen exports</li>
              <li className="pub-pricing-excluded">Geen advies-systeem</li>
            </ul>
            <Link href="/register" className="button-link btn-secondary" style={{ width: "100%", marginTop: "auto" }}>
              Gratis beginnen
            </Link>
          </div>

          {/* Pro Event */}
          <div className="pub-pricing-card">
            <div className="pub-pricing-header">
              <h3>Pro Event</h3>
              <div className="pub-pricing-price">&euro;9,95</div>
              <small className="pub-pricing-period">Eenmalig &middot; voor &eacute;&eacute;n kroegentocht</small>
            </div>
            <p className="pub-pricing-desc">Alles wat je nodig hebt voor &eacute;&eacute;n kroegentocht — van planning tot live draaien op de dag zelf.</p>
            <ul className="pub-pricing-features">
              <li>Tot 30 groepen</li>
              <li>30 dagen bewerken</li>
              <li><strong>Live-modus &mdash; volledig digitaal draaien</strong></li>
              <li>Scoreapp voor scheidsrechters (mobiel + offline)</li>
              <li>Centraal scorebord (TV-modus)</li>
              <li>Publiek programma met QR-code</li>
              <li>Chat &amp; broadcast met push-notificaties</li>
              <li>Foto-upload &amp; slideshow</li>
              <li>Spellenbibliotheek met speluitleg</li>
              <li>Materialen-/opbouwlijst</li>
              <li>Alle PDF-exports (rooster, groepskaarten, spelbegeleider-pakket, QR-codes)</li>
              <li>Excel en CSV export</li>
              <li>AI-advisor &amp; volledige validatie</li>
              <li>E-mail support</li>
            </ul>
            <Link href="/register" className="button-link btn-secondary" style={{ width: "100%", marginTop: "auto" }}>
              Pro Event kopen
            </Link>
          </div>

          {/* Pro Jaar */}
          <div className="pub-pricing-card pub-pricing-featured">
            <span className="pub-pricing-badge">Meest gekozen</span>
            <div className="pub-pricing-header">
              <h3>Pro Jaar</h3>
              <div className="pub-pricing-price">&euro;24,95</div>
              <small className="pub-pricing-period">Per jaar</small>
            </div>
            <p className="pub-pricing-desc">Voor scholen en clubs die elk jaar een kroegentocht organiseren. Bewaar je sjablonen en werk samen met collega&apos;s.</p>
            <ul className="pub-pricing-features">
              <li><strong>Alles uit Pro Event</strong></li>
              <li>Onbeperkt kroegentochten per jaar</li>
              <li>Tot 3 planningen tegelijk</li>
              <li>Eigen sjablonen opslaan</li>
              <li>Eigen spellenbibliotheek voor de organisatie</li>
              <li>Tot 5 teamleden samenwerken</li>
              <li>Planning- &amp; kroegentocht-geschiedenis</li>
              <li>Prioriteit support</li>
            </ul>
            <Link href="/register" className="button-link btn-primary" style={{ width: "100%", marginTop: "auto" }}>
              Pro Jaar starten
            </Link>
          </div>
        </div>
      </section>

      {/* Pricing FAQ */}
      <section className="pub-section pub-section-gray">
        <h2 className="pub-h2">Veelgestelde vragen over prijzen</h2>
        <div className="pub-pricing-faq">
          {PRICING_FAQ.map(({ q, a }, i) => (
            <details key={i} className="pub-faq-item">
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="pub-cta-block">
        <h2>Begin met de gratis proefperiode</h2>
        <p>7 dagen alle planning-functies zonder creditcard. Upgrade alleen als je live wil draaien.</p>
        <Link href="/register" className="button-link pub-cta-btn">Gratis beginnen</Link>
      </section>
    </div>
  );
}
