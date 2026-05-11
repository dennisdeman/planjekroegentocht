import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { HeroBackground } from "@ui/hero-background";
import { JsonLd } from "@ui/json-ld";

const SITE_URL = "https://planjekroegentocht.nl";
const TITLE = "Voor wie — Plan je Kroegentocht";
const DESCRIPTION = "Voor basisscholen, middelbare scholen, spelverenigingen en bedrijven. Koningsspelen, schoolkroegentocht, clubdag of teambuilding — Plan je Kroegentocht past zich aan.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/voor-wie" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/voor-wie`,
    siteName: "Plan je Kroegentocht",
    type: "website",
    locale: "nl_NL",
    images: [{ url: "/heroes/voor-wie.jpg", width: 2000, height: 1091, alt: "Spelveld met joggende volwassenen, volleyballende tieners en kinderen die rondrennen" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/heroes/voor-wie.jpg"],
  },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Voor wie", item: `${SITE_URL}/voor-wie` },
  ],
};

export default function VoorWiePage() {
  return (
    <div className="pub-page">
      <JsonLd data={breadcrumbSchema} />
      <section className="pub-page-hero">
        <HeroBackground src="/heroes/voor-wie.jpg" alt="Spelveld met joggende volwassenen, volleyballende tieners en kinderen die rondrennen — verschillende leeftijdsgroepen op één locatie" />
        <h1>Voor iedereen die een kroegentocht organiseert</h1>
        <p>Of het nu voor 20 of 200 deelnemers is — plannen én op de dag zelf draaien.</p>
      </section>

      {/* Basisscholen */}
      <section className="pub-section">
        <p className="pub-section-intro" style={{ marginBottom: 48 }}>
          Vier scenario&apos;s uit de praktijk. Elk type evenement heeft z&apos;n eigen
          uitdagingen — herken je de jouwe?
        </p>
        <div className="pub-audience-row">
          <div className="pub-audience-img">
            <Image src="/basisschool.jpeg" alt="Basisschoolkinderen op een kroegentocht" fill sizes="(max-width: 768px) 100vw, 300px" style={{ objectFit: "cover" }} />
          </div>
          <div className="pub-audience-content">
            <h2>Schoolkroegentocht zonder stress</h2>
            <div className="pub-audience-scenario">
              <p>
                Je organiseert de jaarlijkse kroegentocht voor 16 klassen. Onderbouw en bovenbouw moeten
                apart spelen, maar delen hetzelfde terrein. Elke klas moet zoveel mogelijk verschillende
                spellen doen. En het rooster moet passen tussen 9:00 en 12:00. Dan moeten de ouders die
                de stations begeleiden ook nog weten hoe de spellen werken en hoe ze de score doorgeven.
              </p>
            </div>
            <div className="pub-audience-solution">
              <h4>Hoe Plan je Kroegentocht helpt</h4>
              <p>
                Maak twee pools (onderbouw/bovenbouw). De generator maakt een schema waarin elke klas
                alle spellen speelt, de velden niet overbezet raken en er genoeg wisseltijd zit tussen
                de rondes. Op de dag zelf krijgt elke ouder een QR-sticker op zijn station: hij scant,
                ziet zijn rooster en de speluitleg, en voert scores in op zijn telefoon. De
                leerkrachten en kinderen volgen via een eigen QR het programma op hun mobiel, en het
                live scorebord hangt in de aula.
              </p>
            </div>
            <Link href="/register" className="button-link btn-primary">Start een schoolkroegentocht</Link>
          </div>
        </div>
      </section>

      {/* Middelbare scholen */}
      <section className="pub-section pub-section-gray">
        <div className="pub-audience-row pub-audience-row-reverse">
          <div className="pub-audience-img">
            <Image src="/school.jpeg" alt="Middelbare scholieren tijdens een kroegentocht" fill sizes="(max-width: 768px) 100vw, 300px" style={{ objectFit: "cover" }} />
          </div>
          <div className="pub-audience-content">
            <h2>Kroegentocht voor de hele school</h2>
            <div className="pub-audience-scenario">
              <p>
                De kroegentocht op een middelbare school is groter en complexer. 24 klassen, verdeeld over
                4 jaarlagen, met 10 spellen op 2 spelvelden en een gymzaal. De brugklassers moeten
                apart van de bovenbouw spelen. Communicatie tussen de docenten op de velden gaat nu
                via WhatsApp-groepjes — chaos zodra er iets verandert.
              </p>
            </div>
            <div className="pub-audience-solution">
              <h4>Hoe Plan je Kroegentocht helpt</h4>
              <p>
                Maak pools per jaarlaag of cluster. Gebruik het blokkensysteem om groepen per blok op
                een vaste locatie te laten spelen en na de pauze te wisselen. Op de dag zelf
                communiceer je met alle docenten via de ingebouwde chat, met broadcasts naar iedereen
                tegelijk en push-notificaties. Loopt het uit? Schuif het hele programma 10 minuten op
                met één knop — alle scoreapps, scoreboards en publieke programma's volgen direct mee.
              </p>
            </div>
            <Link href="/register" className="button-link btn-primary">Plan een schoolkroegentocht</Link>
          </div>
        </div>
      </section>

      {/* Spelverenigingen */}
      <section className="pub-section">
        <div className="pub-audience-row">
          <div className="pub-audience-img">
            <Image src="/club.jpeg" alt="Spelvereniging tijdens een clubdag" fill sizes="(max-width: 768px) 100vw, 300px" style={{ objectFit: "cover" }} />
          </div>
          <div className="pub-audience-content">
            <h2>Clubdag of intern toernooi</h2>
            <div className="pub-audience-scenario">
              <p>
                Je spelvereniging organiseert een clubdag met 12 teams en 6 spellen. Elk team moet
                tegen zoveel mogelijk andere teams spelen, en iedereen moet elke spel doen. De
                vrijwilligers die de wedstrijden bijhouden zijn ouders — niet altijd bekend met de
                regels van elke spel.
              </p>
            </div>
            <div className="pub-audience-solution">
              <h4>Hoe Plan je Kroegentocht helpt</h4>
              <p>
                Gebruik de all-spellen modus zodat elk team elke spel speelt. Het systeem verdeelt
                de tegenstanders eerlijk en minimaliseert herhalingen. Print het spelbegeleider-pakket:
                één PDF per station met regels, veldopzet, materialenlijst en wedstrijdschema. Het
                centrale scorebord aan de bar wordt automatisch bijgewerkt — leden zien live wie er
                voorstaat. En foto's die vrijwilligers maken verschijnen direct in de slideshow op
                het terras.
              </p>
            </div>
            <Link href="/register" className="button-link btn-primary">Plan een clubdag</Link>
          </div>
        </div>
      </section>

      {/* Bedrijven */}
      <section className="pub-section pub-section-gray">
        <div className="pub-audience-row pub-audience-row-reverse">
          <div className="pub-audience-img">
            <Image src="/business.jpeg" alt="Collega's tijdens een bedrijfskroegentocht" fill sizes="(max-width: 768px) 100vw, 300px" style={{ objectFit: "cover" }} />
          </div>
          <div className="pub-audience-content">
            <h2>Bedrijfskroegentocht als teambuilding</h2>
            <div className="pub-audience-scenario">
              <p>
                HR organiseert een kroegentocht voor 80 medewerkers. 10 teams van 8 personen, 5 spellen,
                2 locaties. Het moet leuk en eerlijk zijn, het programma moet op een A4 passen, en
                je wil ook foto's verzamelen voor de interne nieuwsbrief.
              </p>
            </div>
            <div className="pub-audience-solution">
              <h4>Hoe Plan je Kroegentocht helpt</h4>
              <p>
                Importeer de deelnemerslijst, verdeel automatisch in teams en genereer een compact
                schema. Op de dag zelf scannen de begeleiders hun QR-code en houden direct de scores
                bij — geen Excel achteraf invoeren. Foto's die zij maken vanuit hun telefoon
                verschijnen direct in een slideshow op het hoofdpodium. Achteraf download je alle
                foto's én het complete scorebord als PDF voor de nieuwsbrief.
              </p>
            </div>
            <Link href="/register" className="button-link btn-primary">Organiseer een bedrijfskroegentocht</Link>
          </div>
        </div>
      </section>

      <section className="pub-cta-block">
        <h2>Past het bij jouw evenement?</h2>
        <p>Probeer het gratis en ontdek het zelf.</p>
        <Link href="/register" className="button-link pub-cta-btn">Gratis beginnen</Link>
      </section>
    </div>
  );
}
