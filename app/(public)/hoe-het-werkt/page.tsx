import type { Metadata } from "next";
import Link from "next/link";
import { ImageLightbox } from "@ui/image-lightbox";
import { HeroBackground } from "@ui/hero-background";
import { JsonLd } from "@ui/json-ld";

const SITE_URL = "https://planjekroegentocht.nl";
const TITLE = "Hoe het werkt — Plan je Kroegentocht";
const DESCRIPTION = "Ontdek wat je allemaal kunt met Plan je Kroegentocht. Slim plannen, drag-and-drop, scoreapp voor scheidsrechters, centraal scorebord, foto's, chat en exports.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/hoe-het-werkt" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/hoe-het-werkt`,
    siteName: "Plan je Kroegentocht",
    type: "website",
    locale: "nl_NL",
    images: [{ url: "/heroes/hoe-het-werkt.jpg", width: 2000, height: 848, alt: "Laptop met planning-grid op een picknicktafel, op de achtergrond kinderen die het spelveld op rennen" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/heroes/hoe-het-werkt.jpg"],
  },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Hoe het werkt", item: `${SITE_URL}/hoe-het-werkt` },
  ],
};

const howToSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "Hoe organiseer je een kroegentocht met Plan je Kroegentocht",
  description: "Van eerste configuratie tot live draaien op de dag zelf, in 5 stappen.",
  totalTime: "PT10M",
  step: [
    {
      "@type": "HowToStep",
      position: 1,
      name: "Configureer",
      text: "Stel groepen, spellen, velden en het tijdschema in via de wizard. De wizard begeleidt je stap voor stap.",
    },
    {
      "@type": "HowToStep",
      position: 2,
      name: "Genereer",
      text: "Eén klik en het systeem berekent automatisch het optimale schema, met minimale herhalingen en eerlijke tegenstanders.",
    },
    {
      "@type": "HowToStep",
      position: 3,
      name: "Pas aan",
      text: "Met drag-and-drop kun je het rooster handmatig finetunen. Elke wijziging wordt direct gevalideerd op conflicten.",
    },
    {
      "@type": "HowToStep",
      position: 4,
      name: "Draai live",
      text: "Op de dag zelf: scoreapp voor scheidsrechters, centraal scorebord, publiek programma, foto's en chat — alles via één centraal paneel.",
    },
    {
      "@type": "HowToStep",
      position: 5,
      name: "Exporteer",
      text: "Print groepskaarten, spelbegeleider-pakketten en materiaallijsten als back-up of voor begeleiders zonder telefoon.",
    },
  ],
};

export default function HoeHetWerktPage() {
  return (
    <div className="pub-page">
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={howToSchema} />
      <section className="pub-page-hero">
        <HeroBackground src="/heroes/hoe-het-werkt.jpg" alt="Laptop met planning-grid op een picknicktafel met fluitje en checklist, op de achtergrond kinderen die het spelveld op rennen" />
        <h1>Wat kun je ermee?</h1>
        <p>Van eerste configuratie tot live draaien op de dag zelf — zo werkt Plan je Kroegentocht.</p>
      </section>

      {/* ── Plannen — feature rows met afbeeldingen ──────────────── */}
      <section className="pub-section">
        <h2 className="pub-h2">Eerst: het schema rondkrijgen</h2>

        <div className="pub-feature-row">
          <div className="pub-feature-text">
            <span className="pub-step-badge">Stap 1 · plannen</span>
            <h3>Slimme generator</h3>
            <p>
              Het systeem kiest automatisch de beste strategie uit 7 wiskundige methodes.
              Of je nu 6 of 28 groepen hebt, 3 of 14 spellen — het vindt een schema
              met zo min mogelijk herhalingen, eerlijke tegenstanders en zonder dubbele boekingen.
            </p>
          </div>
          <div className="pub-feature-visual">
            <ImageLightbox src="/generator.png" alt="Planner grid met gegenereerd schema" />
          </div>
        </div>

        <div className="pub-feature-row pub-feature-reverse">
          <div className="pub-feature-text">
            <span className="pub-step-badge">Stap 2 · finetunen</span>
            <h3>AI-advisor</h3>
            <p>
              Niet tevreden? De advisor analyseert je planning en stelt tot 5 betere
              configuraties voor. Hij bewijst zelfs wiskundig of 0 herhalingen mogelijk is.
              Eén klik en de aanpassing is doorgevoerd.
            </p>
          </div>
          <div className="pub-feature-visual">
            <ImageLightbox src="/advies.png" alt="Advies-panel met suggesties" />
          </div>
        </div>
      </section>

      {/* ── Live draaien — kerntekst over de digitale uitvoering ─── */}
      <section className="pub-section pub-section-blue">
        <h2 className="pub-h2">Op de dag zelf: volledig digitaal draaien</h2>
        <p className="pub-section-intro">
          Eén klik op &quot;Live zetten&quot; en je planning wordt een live kroegentocht. Vanaf
          dat moment is Plan je Kroegentocht je centrale paneel: scoreapp voor begeleiders,
          scorebord op de TV, programma op de telefoons van ouders, en chat voor de communicatie.
        </p>

        <div className="pub-cards-3">
          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{1F4F1}"}</div>
            <h3>Scoreapp voor scheidsrechters</h3>
            <p>
              Elke begeleider krijgt een unieke QR-code. Hij scant, voert zijn naam in en
              ziet meteen welke spelletjes er bij hem horen. Score invoeren met +/−,
              spelletje annuleren met reden, vorige rondes terugkijken. Werkt ook offline.
            </p>
          </div>

          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{1F3C6}"}</div>
            <h3>Centraal scorebord</h3>
            <p>
              Op een TV of beamer: live ranglijst in fullscreen donkere modus. Goud-,
              zilver- en bronsbadges, ticker met laatst ingevoerde scores, automatische
              tiebreakers. Updatet vanzelf zodra een score binnenkomt.
            </p>
          </div>

          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{1F4C5}"}</div>
            <h3>Programma voor het publiek</h3>
            <p>
              Ouders en deelnemers volgen via een QR-code wat er gebeurt op hun telefoon.
              Met groep-zoeker (&quot;waar is groep 3a?&quot;), &quot;deel deze groep&quot;-knop en
              auto-scroll naar de huidige ronde.
            </p>
          </div>

          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{1F4F8}"}</div>
            <h3>Foto&apos;s &amp; slideshow</h3>
            <p>
              Begeleiders maken foto's tijdens de spelletjes vanuit hun app. Foto's
              komen direct binnen en verschijnen in een fullscreen slideshow op het
              hoofdpodium. Met fade, schuiven of Ken Burns-effect.
            </p>
          </div>

          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{1F4AC}"}</div>
            <h3>Chat & broadcast</h3>
            <p>
              Snel een groepschat met alle begeleiders, of een 1-op-1 berichtje. Met
              broadcast stuur je in &eacute;&eacute;n klik een mededeling naar iedereen (&quot;ronde 3
              start over 5 min&quot;). Push-notificaties zorgen dat niets gemist wordt.
            </p>
          </div>

          <div className="pub-card">
            <div className="pub-feature-card-icon">{"\u{1F4CA}"}</div>
            <h3>Voortgangsmonitor</h3>
            <p>
              Realtime dashboard met progress-bar per station. Achterblijvers worden
              rood gemarkeerd. Loopt het uit? Schuif het hele programma 5/10/15 min
              op met één knop — alle apps en schermen volgen.
            </p>
          </div>
        </div>
      </section>

      {/* ── Inhoud & opbouwlijst ─────────────────────────────────── */}
      <section className="pub-section">
        <h2 className="pub-h2">Geen onverwachte vragen op de dag zelf</h2>

        <div className="pub-feature-row">
          <div className="pub-feature-text">
            <span className="pub-step-badge">drankspellen</span>
            <h3>20 spellen met speluitleg</h3>
            <p>
              Elke ingebouwde spel heeft regels, veldopzet en spelersaantal. Vrijwilligers
              en ouders die een spel begeleiden krijgen alles op één papier — ze hoeven de
              regels niet te kennen. Eigen spellen toevoegen, bewerken of deactiveren kan ook.
            </p>
          </div>
          <div className="pub-feature-visual">
            <ImageLightbox src="/speluitleg-spellenbibliotheek.png" alt="Speluitleg-editor met spelregels en veldopzet voor een spel in de drankspellen" />
          </div>
        </div>

        <div className="pub-feature-row pub-feature-reverse">
          <div className="pub-feature-text">
            <span className="pub-step-badge">opbouw &apos;s ochtends</span>
            <h3>Materialen- & inventarislijst</h3>
            <p>
              Per station én totaal: wat moet er waar liggen? Het systeem rekent uit
              hoeveel pionnen, ballen en hesjes je nodig hebt. Print de lijst met
              vinkvakjes — geef hem aan de opbouwploeg, je vergeet niets.
            </p>
          </div>
          <div className="pub-feature-visual">
            <ImageLightbox src="/materialen-inventarislijst.png" alt="Materialen-editor voor hockey: hockeysticks, hockeybal, doelen en hesjes met aantallen" />
          </div>
        </div>

        <div className="pub-feature-row">
          <div className="pub-feature-text">
            <span className="pub-step-badge">programma</span>
            <h3>Eigen dagprogramma-items</h3>
            <p>
              Welkomstwoord om 8:45, lunchpauze, prijsuitreiking om 12:30 — voeg eigen
              items toe naast de spelletjerondes. Verschijnen op het publieke programma,
              in de PDF en in alle exports. Als de starttijd verschuift, blijven ze waar
              ze horen (absolute tijden).
            </p>
          </div>
          <div className="pub-feature-visual">
            <ImageLightbox src="/dagprogramma-items.png" alt="Dagprogramma-editor: eigen items toevoegen tussen de spelletjerondes met titel, beschrijving en tijden" />
          </div>
        </div>
      </section>

      {/* ── Exports ──────────────────────────────────────────────── */}
      <section className="pub-section pub-section-gray">
        <h2 className="pub-h2">Voor de back-up: papier</h2>

        <div className="pub-feature-row">
          <div className="pub-feature-text">
            <span className="pub-step-badge">exporteren</span>
            <h3>Spelbegeleider-pakket</h3>
            <p>
              Per station één compleet PDF: speluitleg, materialen, veldopzet én
              spelletjeschema met scorekolom. Geef één papiertje aan elke vrijwilliger
              en hij weet alles. Met je eigen logo erop.
            </p>
          </div>
          <div className="pub-feature-visual">
            <ImageLightbox src="/exporteren.png" alt="Export modal met spelbegeleider-pakket" />
          </div>
        </div>

        <div className="pub-feature-row pub-feature-reverse">
          <div className="pub-feature-text">
            <span className="pub-step-badge">exporteren</span>
            <h3>QR-codes op A4</h3>
            <p>
              Alle scheidsrechter-QR's op één A4. Plus losse QR's voor het scorebord
              en publieke programma. Uitknippen, ophangen of in het spelbegeleider-pakket
              plakken — klaar.
            </p>
          </div>
          <div className="pub-feature-visual">
            <ImageLightbox src="/qr-codes-export.png" alt="QR-codes voor publiek programma en publiek scorebord met links en kopieer-/openen-knoppen" />
          </div>
        </div>
      </section>

      <section className="pub-cta-block">
        <h2>Probeer het zelf</h2>
        <p>Je eerste kroegentocht plannen duurt minder dan 10 minuten.</p>
        <Link href="/register" className="button-link pub-cta-btn">Gratis beginnen</Link>
      </section>
    </div>
  );
}
