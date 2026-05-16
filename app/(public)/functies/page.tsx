import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { HeroBackground } from "@ui/hero-background";
import { JsonLd } from "@ui/json-ld";

const SITE_URL = "https://planjekroegentocht.nl";
const TITLE = "Functies — Plan je Kroegentocht";
const DESCRIPTION = "Alle functies van Plan je Kroegentocht: planning, generator, drag-and-drop, scoreapp voor begeleiders, centraal scorebord, foto's, chat, drankspellen, materialenlijst en meer.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/functies" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/functies`,
    siteName: "Plan je Kroegentocht",
    type: "website",
    locale: "nl_NL",
    images: [{ url: "/heroes/functies.jpg", width: 2000, height: 848, alt: "Telefoon met kroegentocht-app, op de achtergrond touwtrekkende kinderen" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/heroes/functies.jpg"],
  },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Functies", item: `${SITE_URL}/functies` },
  ],
};

type Feature = { icon: string; title: string; text: string };

const PLANNEN: Feature[] = [
  {
    icon: "\u{1F9ED}",
    title: "Wizard — stap voor stap instellen",
    text: "De wizard begeleidt je in 8 stappen: naam, pools, groepen, verplaatsbeleid, spellen, locaties, stations en tijdschema. Elk veld heeft uitleg via vraagteken-iconen. Je kunt altijd terug naar een vorige stap.",
  },
  {
    icon: "\u{2699}️",
    title: "Configurator — voor gevorderden",
    text: "Alle instellingen op één pagina. Groepen toevoegen, spellen kiezen, velden en stations configureren, tijdsloten aanpassen. Direct JSON-editor beschikbaar voor bulk-aanpassingen.",
  },
  {
    icon: "\u{1F9E0}",
    title: "Generator — 7 wiskundige strategieën",
    text: "Het systeem probeert automatisch verschillende strategieën (round-robin, Latin Square, paired-rotation, single-pool-rotation en meer) en kiest de beste. Het resultaat: een schema met minimale herhalingen en eerlijke tegenstanders.",
  },
  {
    icon: "\u{1F4CB}",
    title: "Planner — bekijken en aanpassen",
    text: "Het gegenereerde schema als overzichtelijke tabel: tijdslot × station. Drag-and-drop om groepen te swappen. Elke wijziging wordt direct gevalideerd op conflicten.",
  },
  {
    icon: "\u{1F6A8}",
    title: "Validatie — 10 soorten conflicten",
    text: "Dubbele boekingen, overbezette stations, herhaalde spellen, cross-pool matches en meer. Elke issue heeft een ernst-niveau: fout (blokkerend), waarschuwing of opmerking.",
  },
  {
    icon: "\u{1F4A1}",
    title: "AI-advisor — slimmere configuratie",
    text: "Het systeem analyseert je huidige setup en stelt tot 5 alternatieven voor die beter scoren. Met uitleg waarom, en één klik om toe te passen. Bewijst zelfs wiskundig of 0 herhalingen mogelijk is.",
  },
  {
    icon: "\u{1F4C2}",
    title: "Import — begin niet vanaf nul",
    text: "Upload een CSV, Excel of ODS met je deelnemers of groepen. Automatische kolom-detectie. Kies of elke rij een groep is, of laat het systeem individuele deelnemers verdelen. Import-presets bewaren.",
  },
  {
    icon: "\u{1F4D1}",
    title: "Sjablonen — bewezen schema's",
    text: "9 ingebouwde sjablonen met gegarandeerd 0 herhalingen: van 6 groepen/3 spellen tot 28 groepen/14 spellen. Of sla je eigen configuratie op als sjabloon (Pro Jaar).",
  },
];

const OP_DE_DAG: Feature[] = [
  {
    icon: "\u{1F525}",
    title: "Live-modus",
    text: "Met één klik wordt je planning een live kroegentocht. Vanaf dat moment volgt het systeem de tijd, scores en voortgang. Tijdsloten worden automatisch verschoven naar de daadwerkelijke starttijd.",
  },
  {
    icon: "\u{1F4F1}",
    title: "Scoreapp voor begeleiders",
    text: "Scheidsrechter scant de QR, opent zijn station op zijn telefoon en voert scores in met +/−-knoppen. Ziet zijn eigen rooster, countdown en kan spelletjes annuleren met reden.",
  },
  {
    icon: "\u{1F3C6}",
    title: "Centraal scorebord",
    text: "Live ranglijst op TV of beamer in fullscreen modus. Goud-/zilver-/brons-badges, ticker, ranking met tiebreakers (head-to-head, doelsaldo). Updatet vanzelf bij elke score.",
  },
  {
    icon: "\u{1F4C5}",
    title: "Publiek programma",
    text: "Deelnemers en ouders volgen het programma op hun telefoon via QR-code. Met groep-zoeker, “deel deze groep”-knop en auto-scroll naar de huidige ronde.",
  },
  {
    icon: "\u{1F4CA}",
    title: "Voortgangsmonitor",
    text: "Realtime dashboard met progress-bar per station. Achterblijvers worden rood gemarkeerd — jij weet meteen waar je heen moet om bij te sturen.",
  },
  {
    icon: "\u{1F4DD}",
    title: "Audit log per spelletje",
    text: "Alle scoreswijzigingen worden bijgehouden: wie, wat en wanneer. Volledige historie zichtbaar in het spelletje-detail. Organisator kan elke score corrigeren — ook na afloop.",
  },
  {
    icon: "\u{23F1}️",
    title: "Programma-uitloop opvangen",
    text: "Loopt de dag uit? Schuif het hele programma 5/10/15 minuten op met één knop. Alle scoreapps, scoreboards en het publieke programma volgen direct mee.",
  },
  {
    icon: "\u{26A1}",
    title: "Offline & PWA",
    text: "Geen wifi op het spelveld? De scoreapp werkt offline en synchroniseert vanzelf zodra er weer verbinding is. Installeer de app op je startscherm voor de snelste werking.",
  },
];

const COMMUNICATIE: Feature[] = [
  {
    icon: "\u{1F4AC}",
    title: "Chat-systeem",
    text: "WhatsApp-stijl chat tussen organisator en alle begeleiders. Groepschat per kroegentocht, 1-op-1 berichten en broadcasts (rondemededelingen aan iedereen tegelijk).",
  },
  {
    icon: "\u{1F514}",
    title: "Push-notificaties",
    text: "Belangrijke berichten komen direct binnen op mobiel via Web Push. Met audio-ping en tab-titel-melding zodat niets gemist wordt.",
  },
  {
    icon: "\u{1F4F8}",
    title: "Foto's & slideshow",
    text: "Begeleiders maken foto's vanuit de app (camera of album). Worden veilig opgeslagen, automatisch gecomprimeerd en verschijnen direct in een fullscreen slideshow op het hoofdpodium. Met fade, schuiven of Ken Burns-effect.",
  },
  {
    icon: "\u{1F50D}",
    title: "Foto-moderatie",
    text: "Foto's automatisch goedkeuren of pas tonen na akkoord. Alle foto's in een admin-galerij met filters per station/ronde, lightbox en delete.",
  },
];

const INHOUD: Feature[] = [
  {
    icon: "\u{1F4DA}",
    title: "Drankspellen met speluitleg",
    text: "20 spellen ingebouwd met regels, veldopzet, aantal spelers per team en variant-opties. Voor vrijwilligers en ouders die de regels niet kennen — staat ook in het spelbegeleider-pakket.",
  },
  {
    icon: "\u{1F3D7}️",
    title: "Eigen spel-collectie",
    text: "Voeg spellen toe, bewerk regels of materialen, of deactiveer wat je niet nodig hebt. Werkt door op alle nieuwe configuraties binnen je organisatie.",
  },
  {
    icon: "\u{1F4E6}",
    title: "Materialen- & opbouwlijst",
    text: "Per station én totaal: precies wat moet waar liggen? Override per config of per organisatie. Print als checklist met aanvinkbare vakjes voor de opbouw 's ochtends.",
  },
  {
    icon: "\u{1F5D3}️",
    title: "Eigen dagprogramma-items",
    text: "Welkomstwoord, prijsuitreiking, lunchpauze — plaats eigen items tussen of naast de rondes op het programma. Zichtbaar in alle exports en op het publieke programma.",
  },
];

const EXPORTS: Feature[] = [
  {
    icon: "\u{1F4E4}",
    title: "Rooster & groepskaarten",
    text: "Het volledige rooster naar Excel, CSV of PDF. Groepskaarten per team met tijd, ronde, spel, locatie, tegenstander en scorekolom — ideaal om uit te delen.",
  },
  {
    icon: "\u{1F3DF}️",
    title: "Locatie-overzichten",
    text: "PDF per veld voor de begeleiders met alle spelletjes op die locatie. Inclusief leeg scorebord om handmatig in te vullen als back-up.",
  },
  {
    icon: "\u{1F4D8}",
    title: "Spelbegeleider-pakket",
    text: "Compleet PDF per station: speluitleg, materialen, veldopzet én spelletjeschema met scorekolom. Geef één papiertje aan elke vrijwilliger en hij weet alles.",
  },
  {
    icon: "\u{1F517}",
    title: "QR-codes A4-PDF",
    text: "Alle scheidsrechter-QR's op één A4. Plus losse QR's voor het scorebord en publieke programma. Uitknippen, ophangen, klaar.",
  },
  {
    icon: "\u{1F4C6}",
    title: "Dagprogramma-PDF",
    text: "Tijdlijn-export met rondes (zwart), wisseltijden (grijs) en eigen items (blauw) chronologisch. Hand-out voor deelnemers en gasten.",
  },
  {
    icon: "\u{1F5A8}️",
    title: "PDF-instellingen",
    text: "Liggend of staand voor alle PDF-exports. Eigen logo schaalt proportioneel mee. Print landscape voor brede tabellen, portrait voor groepskaarten.",
  },
];

const SAMENWERKEN: Feature[] = [
  {
    icon: "\u{1F465}",
    title: "Teams — samen organiseren",
    text: "Nodig collega's uit in je organisatie. Deel configuraties, planningen, drankspellen en sjablonen. Twee rollen: beheerder en lid. Tot 5 leden in Pro Jaar.",
  },
  {
    icon: "\u{1F5C2}️",
    title: "Soft delete & prullenbak",
    text: "Per ongeluk verwijderd? Items blijven 30 dagen in de prullenbak. Herstellen of definitief verwijderen — jij beslist.",
  },
  {
    icon: "\u{1F510}",
    title: "Veilige opslag",
    text: "Je gegevens staan op beveiligde servers in de EU. Alleen jij en de leden van je organisatie hebben toegang. Foto's veilig in de cloud (Cloudflare R2).",
  },
];

function FeatureGroup({ title, intro, features, children }: { title: string; intro?: string; features: Feature[]; children?: ReactNode }) {
  return (
    <>
      <h2 className="pub-h2">{title}</h2>
      {intro && <p className="pub-section-intro">{intro}</p>}
      {children}
      <div className="pub-features-grid">
        {features.map((f, i) => (
          <div key={i} className="pub-feature-card">
            <div className="pub-feature-card-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </div>
        ))}
      </div>
    </>
  );
}

export default function FunctiesPage() {
  return (
    <div className="pub-page">
      <JsonLd data={breadcrumbSchema} />
      <section className="pub-page-hero">
        <HeroBackground src="/heroes/functies.jpg" alt="Telefoon met dashboard van de kroegentocht-app, op de achtergrond een spelveld met touwtrekkende kinderen" />
        <h1>Alles wat je nodig hebt voor een kroegentocht</h1>
        <p>Van eerste configuratie tot laatste foto in de slideshow — één tool voor het hele proces.</p>
      </section>

      <section id="plannen" className="pub-section">
        <FeatureGroup
          title="Plannen"
          intro="Het schema is binnen 10 minuten klaar. De wizard helpt je stap voor stap, de generator rekent het uit en de planner laat je handmatig finetunen."
          features={PLANNEN}
        >
          <nav className="pub-toc" aria-label="Inhoud van deze pagina">
            <a href="#plannen">Plannen</a>
            <a href="#op-de-dag-zelf">Op de dag zelf</a>
            <a href="#communicatie">Communicatie &amp; beleving</a>
            <a href="#inhoud">Inhoud &amp; materialen</a>
            <a href="#exporteren">Exporteren</a>
            <a href="#samenwerken">Samenwerken</a>
          </nav>
        </FeatureGroup>
      </section>

      <section id="op-de-dag-zelf" className="pub-section pub-section-blue">
        <FeatureGroup
          title="Op de dag zelf"
          intro="Geen losse Excel-tabellen, scorebriefjes of WhatsApp-groepjes meer. Alles draait via één centraal paneel — jij ziet realtime wat er gebeurt op elk veld."
          features={OP_DE_DAG}
        />
      </section>

      <section id="communicatie" className="pub-section">
        <FeatureGroup
          title="Communicatie & beleving"
          intro="Communiceer met je begeleiders zonder WhatsApp-chaos en laat ouders en deelnemers meegenieten via foto's en de slideshow."
          features={COMMUNICATIE}
        />
      </section>

      <section id="inhoud" className="pub-section pub-section-gray">
        <FeatureGroup
          title="Inhoud & materialen"
          intro="Vrijwilligers hoeven de regels niet te kennen en jij weet precies wat waar moet liggen. Alles staat klaar in één bibliotheek."
          features={INHOUD}
        />
      </section>

      <section id="exporteren" className="pub-section">
        <FeatureGroup
          title="Exporteren — klaar voor het veld"
          intro="Niet alles hoeft digitaal. Voor de back-up of voor begeleiders zonder telefoon: exports met je eigen logo en aanpasbare opmaak."
          features={EXPORTS}
        />
      </section>

      <section id="samenwerken" className="pub-section pub-section-blue">
        <FeatureGroup
          title="Samenwerken & account"
          features={SAMENWERKEN}
        />
      </section>

      <section className="pub-cta-block">
        <h2>Probeer het zelf</h2>
        <p>Maak gratis een account aan en ontdek hoe makkelijk het is.</p>
        <Link href="/register" className="button-link pub-cta-btn">Gratis beginnen</Link>
      </section>
    </div>
  );
}
