import type { Metadata } from "next";
import Link from "next/link";
import { HeroBackground } from "@ui/hero-background";
import { JsonLd } from "@ui/json-ld";

const SITE_URL = "https://planjekroegentocht.nl";
const TITLE = "Veelgestelde vragen — Plan je Kroegentocht";
const DESCRIPTION = "Antwoorden op veelgestelde vragen over Plan je Kroegentocht. Plannen, live draaien op de dag zelf, scoreapp, scorebord, foto's, chat, exports en accounts.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/faq" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/faq`,
    siteName: "Plan je Kroegentocht",
    type: "website",
    locale: "nl_NL",
    images: [{ url: "/heroes/faq.jpg", width: 2000, height: 1091, alt: "Persoon met krullend haar aan een picknicktafel met een tablet" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/heroes/faq.jpg"],
  },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Veelgestelde vragen", item: `${SITE_URL}/faq` },
  ],
};

const FAQ_SECTIONS = [
  {
    title: "Over de tool",
    items: [
      { q: "Wat is Plan je Kroegentocht?", a: "Een online tool waarmee je een kroegentocht kunt plannen én op de dag zelf volledig digitaal draaien. Je stelt groepen, spellen en locaties in, het systeem genereert automatisch een eerlijk schema. Op de dag zelf voeren scheidsrechters scores in op hun telefoon, verschijnt een live scorebord op TV, volgen ouders het programma op hun mobiel, en komen foto's binnen via de slideshow." },
      { q: "Voor wie is het bedoeld?", a: "Voor iedereen die een kroegentocht organiseert: basisscholen (schoolkroegentocht, Koningsspelen), middelbare scholen, spelverenigingen (clubdag, toernooi) en bedrijven (teambuilding)." },
      { q: "Is het gratis?", a: "Je kunt 7 dagen gratis uitproberen — wizard, generator en planner zonder creditcard. Voor de live-modus, alle exports en grotere groepen heb je Pro Event (€9,95 eenmalig) of Pro Jaar (€24,95 per jaar) nodig." },
      { q: "Heb ik een account nodig?", a: "Ja, een account is nodig om je configuraties en planningen op te slaan. Registreren kost minder dan een minuut." },
    ],
  },
  {
    title: "Over het plannen",
    items: [
      { q: "Hoeveel groepen kan ik aanmaken?", a: "Tot 8 groepen in de gratis proefperiode, tot 30 groepen met Pro Event, en onbeperkt met Pro Jaar. Het systeem werkt het beste met 4 tot 30 groepen. Bij meer dan 30 groepen raden we aan om pools te gebruiken." },
      { q: "Kan ik onderbouw en bovenbouw apart laten spelen?", a: "Ja, met pools. Maak een pool voor onderbouw en een voor bovenbouw. Groepen uit verschillende pools spelen niet tegen elkaar. Met blokken kun je ook fysieke locatie-scheiding afdwingen." },
      { q: "Wat als ik een oneven aantal groepen heb?", a: "Bij een oneven aantal rust er elke ronde een groep (een 'bye'). Je kunt een pauze-activiteit instellen (bijv. 'Puzzels & Quiz') zodat die groep iets te doen heeft." },
      { q: "Hoe werkt het als ik meer groepen dan spellen heb?", a: "Dan speelt elke groep sommige spellen vaker. Het systeem kiest de verdeling met de minste herhalingen en biedt via de AI-advisor alternatieven aan." },
      { q: "Kan elke groep elke spel spelen?", a: "In de 'alle spellen' modus wel. Het systeem voegt extra rondes toe zodat iedereen aan bod komt. Bij de ingebouwde sjablonen is 0 herhalingen gegarandeerd." },
    ],
  },
  {
    title: "Over het schema",
    items: [
      { q: "Hoe worden tegenstanders verdeeld?", a: "Het algoritme verdeelt tegenstanders zo eerlijk mogelijk. In round-robin modus speelt elke groep precies 1× tegen elke andere groep. De generator probeert 7 verschillende strategieën en kiest de beste." },
      { q: "Wat als er conflicten zijn?", a: "Het systeem detecteert 10 soorten conflicten: dubbele boekingen, overbezette stations, herhaalde spellen en meer. Fouten worden direct gemeld als gekleurde badges in het rooster." },
      { q: "Kan ik het schema handmatig aanpassen?", a: "Ja, met drag-and-drop. Sleep een groep naar een andere positie. Het systeem controleert direct of de wijziging geldig is en welke conflicten ontstaan." },
      { q: "Wat doet de AI-advisor?", a: "Hij analyseert je planning en stelt tot 5 betere alternatieven voor. Elke suggestie toont wat er verandert en waarom het beter is. Eén klik om toe te passen. Hij bewijst ook wiskundig of 0 herhalingen mogelijk is." },
    ],
  },
  {
    title: "Tijdens de kroegentocht",
    items: [
      { q: "Hoe werkt de scoreapp voor scheidsrechters?", a: "Elke begeleider krijgt een unieke QR-code per station. Hij scant met zijn telefoon, vult zijn naam in en ziet meteen welke spelletjes er bij zijn station horen. Score invoeren met +/−-knoppen, spelletje annuleren met reden, vorige rondes terugkijken. Ook werkbaar offline — scores komen automatisch binnen zodra er weer wifi is." },
      { q: "Wat als er geen wifi op het spelveld is?", a: "Geen probleem. De scoreapp werkt offline en bewaart de scores lokaal. Zodra de telefoon weer verbinding heeft, synchroniseert alles vanzelf. Voor de snelste werking kun je de app op je startscherm installeren (PWA)." },
      { q: "Hoe werkt het centrale scorebord?", a: "Open de scorebord-link of scan de QR op een TV of beamer. Fullscreen donkere modus, automatische updates bij elke score, ranking met goud-/zilver-/bronsbadges, ticker met laatst ingevoerde scores. Tiebreakers (head-to-head, doelsaldo) worden automatisch toegepast." },
      { q: "Kunnen ouders en deelnemers het programma volgen?", a: "Ja, via een aparte QR-code voor het publieke programma. Ze openen het op hun mobiel, zoeken hun groep ('waar is groep 3a?') en zien meteen wat ze nu doen en wat er nog komt. Auto-scroll naar de huidige ronde, plus een 'deel deze groep'-knop." },
      { q: "Hoe werkt het maken en delen van foto's?", a: "Begeleiders kunnen vanuit hun scoreapp een foto maken (camera of uit album). De foto wordt automatisch gecomprimeerd, veilig opgeslagen in de cloud en verschijnt direct in de fullscreen slideshow op het hoofdpodium. Je kunt foto's automatisch laten goedkeuren of zelf modereren in het admin-paneel." },
      { q: "Hoe werkt de chat?", a: "WhatsApp-stijl: een groepschat met alle begeleiders, 1-op-1 berichten en broadcasts (bericht aan iedereen tegelijk). Met push-notificaties op mobiel, audio-ping en tab-titel-melding zodat niets gemist wordt. Op iOS moet de app als PWA op het startscherm staan voor pushberichten." },
      { q: "Wat als het programma uitloopt?", a: "Schuif het hele programma 5/10/15 minuten op met één knop. Alle scoreapps, scoreboards en het publieke programma volgen direct mee. De countdown bij de begeleiders past zich automatisch aan." },
      { q: "Kan ik scores achteraf nog corrigeren?", a: "Ja. Vanuit het admin-paneel kun je elke score op elk moment aanpassen — ook na afloop. Alle wijzigingen worden bijgehouden in een audit log: wie heeft wat veranderd en wanneer." },
      { q: "Hoe weet ik of alle stations bijblijven?", a: "Het admin-dashboard toont een realtime voortgangsmonitor: per station een progress-bar, achterblijvers worden rood gemarkeerd. Je weet meteen waar je heen moet om bij te sturen." },
      { q: "Kunnen vrijwilligers de regels van de spel zien?", a: "Ja. Elke ingebouwde spel heeft regels, veldopzet en spelersaantal. Dit staat in het spelbegeleider-pakket (één PDF per station) én is digitaal beschikbaar in de scoreapp van de begeleider via het tabblad 'Speluitleg'." },
    ],
  },
  {
    title: "Over exporteren",
    items: [
      { q: "Welke bestanden kan ik exporteren?", a: "Het rooster als Excel (.xlsx), CSV of PDF. Groepskaarten per team. Locatie-overzichten per veld. Een leeg scorebord. Het spelbegeleider-pakket (compleet PDF per station met speluitleg, materialen, veldopzet en spelletjeschema). Een dagprogramma-PDF. En alle QR-codes op één A4-PDF. Liggend of staand naar keuze, met je eigen logo." },
      { q: "Wat is het spelbegeleider-pakket?", a: "Eén PDF per station, klaar om uit te delen aan de scheidsrechter of begeleider. Bevat speluitleg met regels en variant-opties, materialenlijst, veldopzet én het spelletjeschema met scorekolom als back-up." },
      { q: "Krijg ik een lijst van benodigde materialen?", a: "Ja. Het systeem rekent uit hoeveel pionnen, ballen, hesjes en andere materialen je nodig hebt — per station én totaal. Print de lijst met aanvinkbare vakjes voor de opbouw 's ochtends." },
      { q: "Kan ik groepskaarten per team printen?", a: "Ja. Elke groepskaart heeft: tijd, ronde, spel, locatie, tegenstander en een kolom voor de score. Ideaal om uit te delen aan teams." },
    ],
  },
  {
    title: "Technisch",
    items: [
      { q: "Welke browsers worden ondersteund?", a: "Alle moderne browsers: Chrome, Firefox, Safari en Edge. Op mobiel werkt het in iOS Safari en Android Chrome." },
      { q: "Werkt het op iPhone en Android?", a: "Ja. De scoreapp en publieke views zijn geoptimaliseerd voor mobiel. Voor de beste werking — vooral push-notificaties op iOS — installeer je de app op je startscherm (PWA)." },
      { q: "Worden mijn gegevens veilig opgeslagen?", a: "Ja. Je gegevens staan op beveiligde servers in de EU. Foto's worden veilig opgeslagen in de cloud (Cloudflare R2). Alleen jij en de leden van je organisatie hebben toegang." },
      { q: "Kan ik met collega's samenwerken?", a: "Ja, met Pro Jaar. Nodig collega's uit in je organisatie. Iedereen heeft toegang tot dezelfde configuraties, planningen en gedeelde spellenbibliotheek." },
    ],
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_SECTIONS.flatMap((section) =>
    section.items.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    }))
  ),
};

export default function FaqPage() {
  return (
    <div className="pub-page">
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={faqSchema} />
      <section className="pub-page-hero">
        <HeroBackground src="/heroes/faq.jpg" alt="Persoon met krullend haar aan een picknicktafel met een tablet, op de achtergrond een spelveld" />
        <h1>Veelgestelde vragen</h1>
        <p>Alles wat je wilt weten over Plan je Kroegentocht.</p>
      </section>

      <section className="pub-section">
        <div className="pub-faq-grid">
          {FAQ_SECTIONS.map((section) => (
            <div key={section.title} className="pub-faq-section">
              <h2>{section.title}</h2>
              {section.items.map((item, i) => (
                <details key={i} className="pub-faq-item">
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="pub-cta-block">
        <h2>Heb je een andere vraag?</h2>
        <p>Neem gerust contact op.</p>
        <div className="pub-hero-cta" style={{ justifyContent: "center" }}>
          <Link href="/contact" className="button-link pub-cta-btn">Contact opnemen</Link>
          <Link href="/register" className="pub-text-link" style={{ color: "rgba(255,255,255,0.8)" }}>Of begin direct gratis &rarr;</Link>
        </div>
      </section>
    </div>
  );
}
