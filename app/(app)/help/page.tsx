"use client";

import { useState } from "react";

interface HelpSection {
  id: string;
  title: string;
  items: Array<{ question: string; answer: string }>;
}

const HELP_SECTIONS: HelpSection[] = [
  {
    id: "getting-started",
    title: "Aan de slag",
    items: [
      {
        question: "Wat is Plan je Kroegentocht?",
        answer:
          "Plan je Kroegentocht is een online tool waarmee je een kroegentocht kunt organiseren zonder planning-conflicten. " +
          "Je stelt groepen, spellen en locaties in, en het systeem genereert automatisch een eerlijk schema. " +
          "Elke groep speelt zoveel mogelijk verschillende spellen, tegenstanders worden eerlijk verdeeld, " +
          "en het rooster past op jouw tijdschema. Geschikt voor basisscholen, spelverenigingen en bedrijfsevenementen.",
      },
      {
        question: "Hoe begin ik met een nieuwe kroegentocht?",
        answer:
          "Ga naar het Dashboard en kies een van de vier opties:\n\n" +
          "- **Stap voor stap instellen** (aanbevolen): Een wizard begeleidt je door alle instellingen in 8 stappen.\n" +
          "- **Sjabloon laden**: Start met een voorbeeld of gebruik een eerder opgeslagen configuratie.\n" +
          "- **Bestand importeren**: Upload een CSV of Excel met groepen of deelnemers.\n" +
          "- **Leeg beginnen**: Vul alles handmatig in, voor ervaren gebruikers.\n\n" +
          "De wizard is de makkelijkste manier en wordt aanbevolen voor nieuwe gebruikers.",
      },
      {
        question: "Kan ik een eerder gemaakte kroegentocht hergebruiken?",
        answer:
          "Ja, op twee manieren:\n\n" +
          "1. **Opgeslagen configuraties**: Op het Dashboard en in de Configurator zie je al je opgeslagen configuraties. " +
          "Klik op 'Openen' om er verder mee te werken.\n" +
          "2. **Sjablonen**: Sla een configuratie op als sjabloon via de Configurator. " +
          "Sjablonen zijn beschikbaar voor alle leden van je organisatie en ideaal om elk jaar opnieuw te gebruiken.",
      },
    ],
  },
  {
    id: "wizard",
    title: "De Wizard (stap voor stap)",
    items: [
      {
        question: "Stap 1: Naam van de kroegentocht",
        answer:
          "Geef je kroegentocht een herkenbare naam, bijvoorbeeld 'Kroegentocht 2026' of 'Pubcrawl Editie 2026'. " +
          "Deze naam verschijnt op het dashboard en in de planner.",
      },
      {
        question: "Stap 2: Pools (groepenverdeling)",
        answer:
          "Kies of je pools wilt gebruiken. Pools zijn aparte competities binnen je kroegentocht.\n\n" +
          "**Wanneer pools gebruiken?**\n" +
          "- Bij veel groepen die je wilt opdelen (bijv. onderbouw en bovenbouw)\n" +
          "- Als je groepen op aparte velden wilt laten spelen\n\n" +
          "**Zonder pools**: Alle groepen spelen in één competitie.\n\n" +
          "**Met pools**: Groepen worden verdeeld over pools (bijv. Pool A en Pool B). " +
          "Groepen uit verschillende pools spelen niet tegen elkaar. " +
          "Je kunt poolnamen aanpassen en pools toevoegen of verwijderen.",
      },
      {
        question: "Stap 3: Aantal groepen",
        answer:
          "Stel in hoeveel groepen er meedoen. Een groep is een team dat samen door het programma gaat.\n\n" +
          "**Zonder pools**: Voer het totale aantal groepen in. Het systeem berekent hoeveel rondes en wedstrijden nodig zijn.\n\n" +
          "**Met pools**: Verdeel de groepen over de pools. Je kunt per pool het aantal aanpassen. " +
          "Het systeem toont het totaal en berekent het schema op basis van de grootste pool.\n\n" +
          "**Tip**: Een even aantal groepen per pool werkt het beste. Bij een oneven aantal rust er elke ronde een groep.",
      },
      {
        question: "Stap 4: Verplaatsbeleid (alleen bij pools)",
        answer:
          "Bepaal hoe pools zich bewegen tussen locaties:\n\n" +
          "**Blokken** (aanbevolen): Elke pool speelt in een vast blok op één locatie. " +
          "Na een pauze wisselen de pools van locatie. Dit houdt de logistiek overzichtelijk " +
          "en beperkt het aantal stations dat je nodig hebt.\n\n" +
          "**Vrij**: Alle pools spelen tegelijk op alle locaties. Dit geeft meer flexibiliteit " +
          "maar vereist meer stations en is logistiek complexer.",
      },
      {
        question: "Stap 5: Spellen kiezen",
        answer:
          "Voeg alle spellen toe die je wilt aanbieden. Het systeem berekent hoeveel spellen minimaal nodig zijn.\n\n" +
          "**Als je meer spellen hebt dan rondes**: Je kiest tussen twee modi:\n" +
          "- **Alle spellen spelen**: Elke groep speelt elke spel. Er komen extra rondes bij, " +
          "maar tegenstanders kunnen vaker terugkomen.\n" +
          "- **Elke tegenstander 1x**: Elke groep speelt exact één keer tegen elke tegenstander. " +
          "Niet alle spellen worden door iedereen gespeeld.\n\n" +
          "**Tip**: Gebruik de suggesties onderaan om snel populaire spellen toe te voegen.",
      },
      {
        question: "Stap 6: Locaties",
        answer:
          "Voeg de fysieke locaties toe waar gespeeld wordt, bijvoorbeeld 'Spelveld', 'Gymzaal' of 'Basketbalveld'.\n\n" +
          "Bij pools met blokkenbeleid heb je minimaal evenveel locaties als pools nodig. " +
          "Het systeem voegt automatisch locaties toe als dat nodig is.\n\n" +
          "Je kunt locaties hernoemen of verwijderen met de X-knop.",
      },
      {
        question: "Stap 7: Stations en optimalisatie",
        answer:
          "Dit is de belangrijkste stap. Hier zie je hoe je kroegentocht eruit gaat zien.\n\n" +
          "**Station-indeling** (bij pools met meerdere locaties):\n" +
          "- **Verschillende spellen per veld**: Spellen worden verdeeld over locaties. Meer variatie per veld.\n" +
          "- **Dezelfde spellen op elk veld**: Elke locatie krijgt alle spellen. Pools spelen dezelfde spellen op hun eigen veld.\n\n" +
          "**Analyse**: Het systeem analyseert je configuratie en toont:\n" +
          "- Stationsbezetting per ronde\n" +
          "- Hoeveel groepen alle spellen spelen\n" +
          "- Aantal herhalingen\n" +
          "- Tegenstander-verdeling\n\n" +
          "**Optimalisatie**: Als de configuratie niet perfect is, klik op 'Optimaliseer mijn kroegentocht'. " +
          "Het systeem stelt betere configuraties voor die je met één klik kunt toepassen.\n\n" +
          "**Slimme roterings-strategieën**: De planner gebruikt automatisch de beste aanpak voor jouw opzet:\n" +
          "- **Paired-rotation** bij pools met een even aantal groepen — garandeert 100% speldekking\n" +
          "- **Single-pool-rotation** bij één pool zonder pauze — vlot rooster zonder rustmoment\n\n" +
          "**Pauze-activiteit**: Bij een oneven aantal groepen rust er elke ronde een groep. " +
          "Geef een activiteit op voor de rustende groep, zoals 'Puzzels & Quiz'.",
      },
      {
        question: "Stap 8: Tijdschema en regels",
        answer:
          "Stel het tijdschema in:\n\n" +
          "- **Starttijd**: Wanneer begint de kroegentocht?\n" +
          "- **Duur per ronde**: Hoeveel minuten per wedstrijd (bijv. 15 minuten)\n" +
          "- **Wisseltijd**: Hoeveel minuten tussen rondes voor verplaatsing (bijv. 5 minuten)\n\n" +
          "Het systeem toont een preview met exacte tijden.\n\n" +
          "**Herhalingsbeleid**: Wat gebeurt er als een groep dezelfde spel twee keer speelt?\n" +
          "- **Toestaan**: Geen beperkingen\n" +
          "- **Waarschuwing** (aanbevolen): De planner probeert het te voorkomen en toont een waarschuwing\n" +
          "- **Verbieden**: De planner blokkeert het schema als er herhalingen zijn",
      },
      {
        question: "Samenvatting en configuratie aanmaken",
        answer:
          "Na stap 8 zie je een samenvatting van alle instellingen met een kwaliteitsanalyse. " +
          "Controleer of alles klopt en klik op 'Configuratie aanmaken'. " +
          "Je wordt doorgestuurd naar de Configurator waar je de details kunt aanpassen, " +
          "of direct naar de Planner om een schema te genereren.",
      },
    ],
  },
  {
    id: "planner",
    title: "De Planner",
    items: [
      {
        question: "Hoe genereer ik een planning?",
        answer:
          "Open de Planner en klik op 'Genereer'. Het systeem maakt automatisch een optimaal schema " +
          "op basis van je configuratie. Dit duurt meestal een paar seconden.\n\n" +
          "Het schema verschijnt als een rooster met tijdsloten (rijen) en stations (kolommen). " +
          "Elke cel toont welke groepen tegen elkaar spelen.",
      },
      {
        question: "Hoe pas ik het schema handmatig aan?",
        answer:
          "Je kunt groepen verslepen met drag-and-drop:\n\n" +
          "1. Klik en houd een groep-chip vast in een cel\n" +
          "2. Sleep naar een andere groep in een andere cel\n" +
          "3. De twee groepen worden omgewisseld\n\n" +
          "Het systeem controleert direct of de wijziging geldig is. " +
          "Als de wijziging een conflict veroorzaakt (dubbele boeking, overbezetting), " +
          "wordt de actie geblokkeerd met een melding.",
      },
      {
        question: "Wat doet de knop 'Valideer'?",
        answer:
          "Valideer controleert het huidige schema op alle regels:\n\n" +
          "- **Fouten** (rood): Dubbele boekingen, overbezette stations, cross-pool wedstrijden\n" +
          "- **Waarschuwingen** (oranje): Herhaalde spellen, ongelijke tegenstander-verdeling\n" +
          "- **Informatie** (blauw): Kwaliteitsnotities\n\n" +
          "Het Issues-paneel rechts toont alle gevonden problemen met details over welke groep, " +
          "welk station en welk tijdslot het betreft.",
      },
      {
        question: "Wat doet de knop 'Advies'?",
        answer:
          "De Advies-functie analyseert je huidige planning en stelt tot 5 betere alternatieven voor. " +
          "Elke suggestie toont:\n\n" +
          "- Wat er verandert (bijv. '12 groepen + 6 spellen')\n" +
          "- Waarom het beter is\n" +
          "- Hoeveel groepen alle spellen spelen\n" +
          "- Het aantal herhalingen\n\n" +
          "De beste optie krijgt een 'aanbevolen' label. " +
          "Klik op 'Toepassen' om de suggestie over te nemen — zowel de configuratie als het plan worden bijgewerkt.",
      },
      {
        question: "Kan ik het rooster op volledig scherm bekijken?",
        answer:
          "Ja, klik op het tabblad-icoon rechtsboven in het rooster. " +
          "Dit opent het schema in een nieuw browsertabblad zonder zijpaneel, " +
          "zodat je het volledige rooster kunt zien en bewerken.",
      },
      {
        question: "Hoe filter ik het rooster?",
        answer:
          "Boven het rooster staat een inklapbaar filterpaneel. Klik op 'Filters' om het te openen. Je kunt filteren op:\n\n" +
          "- **Locatie**: klik op een locatie-chip om alleen die velden te zien\n" +
          "- **Spel**: markeer specifieke spellen\n" +
          "- **Ronde**: focus op bepaalde tijdsloten\n" +
          "- **Groep**: zoek een groep op naam\n\n" +
          "Actieve filters tonen een teller in de header. Klik op 'Reset filters' om alles in één keer te wissen.",
      },
      {
        question: "Waarom vindt 'Groep 1' niet ook Groep 11 en 12?",
        answer:
          "Het zoekveld matcht op hele woorden. Zo geeft 'Groep 1' alleen Groep 1 terug — niet Groep 10-19. " +
          "Typ meerdere woorden om te combineren, bijvoorbeeld 'Groep 1 bovenbouw'.",
      },
      {
        question: "Welke exports zijn er?",
        answer:
          "In de planner, onder 'Exporteren', vind je:\n\n" +
          "- **Rooster (PDF)**: het volledige schema om uit te printen\n" +
          "- **Groepskaarten (PDF)**: per groep een kaart met hun persoonlijke programma\n" +
          "- **Locatie-overzicht (PDF)**: per locatie wie er wanneer speelt\n" +
          "- **Scorebord (PDF)**: leeg scoreformulier per wedstrijd\n" +
          "- **CSV/Excel**: voor eigen verwerking in spreadsheets\n\n" +
          "Bij export kun je ook filteren op spel, bijvoorbeeld om alleen de voetbalwedstrijden te printen.",
      },
      {
        question: "Kan ik meerdere versies van een planning bewaren?",
        answer:
          "Ja. In de planner klik je op 'Opslaan als...' om de huidige planning te bewaren onder een eigen naam. " +
          "Zo kun je bijvoorbeeld 'Versie 1' en 'Versie 2 met aanpassing' naast elkaar hebben.\n\n" +
          "**Openen**: de lijst opgeslagen plannen staat onder de configuratie in het dashboard en in de planner.",
      },
    ],
  },
  {
    id: "configurator",
    title: "De Configurator",
    items: [
      {
        question: "Wat is het verschil tussen de Wizard en de Configurator?",
        answer:
          "De **Wizard** begeleidt je stap voor stap door de basisinstellingen. " +
          "Ideaal voor nieuwe kroegentochten.\n\n" +
          "De **Configurator** is de geavanceerde editor waar je alle details kunt aanpassen: " +
          "groepen, stations, tijdsloten, locatieblokken en meer. " +
          "Je komt hier terecht na de Wizard, maar je kunt er ook direct naartoe.\n\n" +
          "**Tip**: Gebruik de Wizard voor het opzetten en de Configurator alleen als je specifieke aanpassingen wilt maken.",
      },
      {
        question: "Hoe importeer ik een klassenlijst?",
        answer:
          "Ga naar de Configurator en kies 'Bestand importeren'. Je kunt de volgende bestanden uploaden:\n\n" +
          "- **CSV** (komma-gescheiden)\n" +
          "- **Excel** (.xlsx of .xls)\n" +
          "- **TSV** (tab-gescheiden)\n\n" +
          "Het systeem detecteert automatisch de kolommen. Je kunt kiezen tussen:\n\n" +
          "- **Deelnemers importeren**: Individuele namen worden automatisch in groepen verdeeld. " +
          "Je kunt de groepsgrootte instellen en eventueel op niveau verdelen (hoog/midden/laag).\n" +
          "- **Groepen importeren**: Voorgemaakte teams met optioneel een pool-kolom.\n\n" +
          "Na het uploaden zie je een preview. Controleer de verdeling en klik op 'Importeren'.",
      },
      {
        question: "Hoe sla ik een configuratie op als sjabloon?",
        answer:
          "In de Configurator vind je onderaan de optie 'Sjabloon opslaan'. " +
          "Geef het sjabloon een naam (bijv. 'Kroegentocht bovenbouw') en klik op opslaan.\n\n" +
          "Sjablonen zijn beschikbaar voor alle leden van je organisatie. " +
          "Zo kun je elk jaar snel starten met dezelfde opzet en alleen de groepsnamen aanpassen.",
      },
    ],
  },
  {
    id: "pools",
    title: "Pools en verplaatsing",
    items: [
      {
        question: "Wat zijn pools?",
        answer:
          "Pools zijn aparte competities binnen je kroegentocht. Groepen in dezelfde pool spelen tegen elkaar, " +
          "maar nooit tegen groepen uit een andere pool.\n\n" +
          "**Voorbeeld**: Pool A (groep 5-6) en Pool B (groep 7-8). " +
          "De jongere kinderen spelen alleen tegen leeftijdsgenoten.\n\n" +
          "Je kunt 2 of meer pools aanmaken. Elke pool heeft zijn eigen schema.",
      },
      {
        question: "Wat is het verschil tussen blokken en vrij verplaatsen?",
        answer:
          "**Blokken** (aanbevolen voor de meeste kroegentochten):\n" +
          "- Pool A speelt eerst op Veld 1, Pool B op Veld 2\n" +
          "- Na de pauze wisselen ze: Pool A naar Veld 2, Pool B naar Veld 1\n" +
          "- Voordeel: minder stations nodig, overzichtelijker voor begeleiders\n" +
          "- Nadeel: minder variatie in locaties per blok\n\n" +
          "**Vrij verplaatsen**:\n" +
          "- Alle groepen kunnen naar alle locaties in elke ronde\n" +
          "- Voordeel: maximale variatie\n" +
          "- Nadeel: meer stations nodig, logistiek complexer",
      },
      {
        question: "Wat is het verschil tussen 'verschillende spellen per veld' en 'dezelfde spellen'?",
        answer:
          "**Verschillende spellen per veld** (split layout):\n" +
          "- Veld 1 krijgt spellen 1-4, Veld 2 krijgt spellen 5-8\n" +
          "- Meer variatie per locatie\n" +
          "- Groepen spelen alle spellen door te wisselen van veld\n\n" +
          "**Dezelfde spellen op elk veld** (same layout):\n" +
          "- Elk veld krijgt alle spellen\n" +
          "- Pools spelen dezelfde spellen, maar op hun eigen veld\n" +
          "- Minder verplaatsing nodig\n\n" +
          "**Tip**: Bij 'verschillende spellen' is de kans groter dat alle groepen alle spellen spelen.",
      },
    ],
  },
  {
    id: "schedule-modes",
    title: "Spelmodi",
    items: [
      {
        question: "Wanneer kies ik 'Alle spellen spelen'?",
        answer:
          "Kies deze modus als het belangrijkste is dat **elke groep elke spel speelt**.\n\n" +
          "Het systeem voegt extra rondes toe zodat iedereen aan bod komt. " +
          "Het nadeel is dat sommige tegenstanders vaker terugkomen.\n\n" +
          "**Ideaal voor**: Kroegentochten waar variatie in spellen belangrijker is dan competitie.",
      },
      {
        question: "Wanneer kies ik 'Elke tegenstander 1x'?",
        answer:
          "Kies deze modus als het belangrijkste is dat **elke groep exact één keer tegen elke tegenstander speelt**.\n\n" +
          "Het schema heeft precies zoveel rondes als nodig voor een volledig round-robin. " +
          "Niet alle groepen spelen mogelijk alle spellen.\n\n" +
          "**Ideaal voor**: Competitieve kroegentochten waar eerlijke tegenstander-verdeling prioriteit heeft.",
      },
    ],
  },
  {
    id: "organization",
    title: "Organisatie en teamleden",
    items: [
      {
        question: "Hoe nodig ik collega's uit?",
        answer:
          "Ga naar Instellingen en klik op de card 'Leden'. In het venster dat opent:\n\n" +
          "1. Vul het e-mailadres van je collega in\n" +
          "2. Kies de rol: 'Lid' (kan plannen bekijken/bewerken) of 'Beheerder' (kan ook leden beheren)\n" +
          "3. Klik op 'Uitnodigen'\n\n" +
          "Je collega ontvangt een e-mail met een link om een account aan te maken of in te loggen.",
      },
      {
        question: "Wat is het verschil tussen Beheerder en Lid?",
        answer:
          "**Beheerder**:\n" +
          "- Kan configuraties en plannen aanmaken en bewerken\n" +
          "- Kan teamleden uitnodigen en verwijderen\n" +
          "- Kan de organisatienaam wijzigen\n" +
          "- Kan sjablonen beheren\n\n" +
          "**Lid**:\n" +
          "- Kan configuraties en plannen aanmaken en bewerken\n" +
          "- Kan geen teamleden beheren\n" +
          "- Kan de organisatienaam niet wijzigen",
      },
      {
        question: "Hoe wijzig ik mijn wachtwoord?",
        answer:
          "Ga naar Instellingen en klik op de Account-card. " +
          "In het venster dat opent kun je je naam wijzigen en je wachtwoord veranderen.\n\n" +
          "Voor het wijzigen van je wachtwoord heb je je huidige wachtwoord nodig. " +
          "Het nieuwe wachtwoord moet minimaal 8 tekens zijn.\n\n" +
          "**Wachtwoord vergeten?** Klik op het inlogscherm op 'Wachtwoord vergeten?' — je ontvangt een reset-link per e-mail.",
      },
    ],
  },
  {
    id: "subscriptions",
    title: "Abonnementen en upgraden",
    items: [
      {
        question: "Welke abonnementen zijn er?",
        answer:
          "- **Free**: proefversie met beperkte functies\n" +
          "- **Pro Event (€9,95)**: eenmalig, voor één kroegentocht, 30 dagen toegang, tot 30 groepen, alle exports\n" +
          "- **Pro Jaar (€24,95/jaar)**: onbeperkt kroegentochten, 3 plannen tegelijk, eigen sjablonen, tot 5 teamleden",
      },
      {
        question: "Hoe upgrade ik?",
        answer:
          "Ga naar Upgrade in het menu, kies je plan en klik op 'Pro Event kopen' of 'Pro Jaar starten'. " +
          "Vul de factuurgegevens in en betaal via iDEAL of bankoverschrijving (Mollie). Je plan wordt direct na betaling geactiveerd.",
      },
      {
        question: "Ik heb een couponcode — hoe gebruik ik die?",
        answer:
          "Op de Upgrade-pagina staat bovenaan een 'Couponcode'-veld (alleen zichtbaar als er actieve coupons beschikbaar zijn). " +
          "Vul de code in en klik 'Toepassen'. De korting verschijnt meteen bij beide plannen.\n\n" +
          "**Bij 100% korting**: het plan wordt direct geactiveerd, zonder factuurgegevens of betaalstap.",
      },
      {
        question: "Waar vind ik mijn factuur?",
        answer:
          "Ga naar Instellingen en klik op de card 'Facturen'. Alle facturen staan daar als PDF-download. " +
          "Zakelijke facturen bevatten je bedrijfsgegevens; privé-facturen alleen je naam.",
      },
      {
        question: "Wat gebeurt er als mijn plan afloopt?",
        answer:
          "Je kunt bestaande planningen blijven bekijken, maar niet meer bewerken of nieuwe aanmaken. " +
          "Upgrade opnieuw om volledige toegang te herstellen — je bestaande data blijft bewaard.",
      },
    ],
  },
  {
    id: "berichten",
    title: "Berichten (chat)",
    items: [
      {
        question: "Hoe werkt het berichtensysteem?",
        answer:
          "Tijdens een live kroegentocht kun je via het tabblad 'Berichten' communiceren met spelbegeleiders. " +
          "Het werkt vergelijkbaar met WhatsApp:\n\n" +
          "- **Groepschat**: Eén gedeeld kanaal waar alle spelbegeleiders en de beheerder in zitten. " +
          "Ideaal voor algemene mededelingen en vragen.\n" +
          "- **1-op-1 gesprekken**: Start een privégesprek met een specifieke spelbegeleider of, als spelbegeleider, met andere begeleiders of de beheerder.\n" +
          "- **Broadcast**: De beheerder kan een belangrijk bericht sturen dat prominent wordt weergegeven op alle schermen van de spelbegeleiders, ook buiten de chat.",
      },
      {
        question: "Hoe open ik de chat?",
        answer:
          "**Als beheerder**: Ga naar de kroegentocht-beheerpagina en klik op het tabblad 'Berichten'. " +
          "Je ziet een lijst met gesprekken — de groepschat staat bovenaan.\n\n" +
          "**Als spelbegeleider**: Klik op het tabblad 'Berichten' in de spelbegeleider-view. " +
          "De groepschat en eventuele privégesprekken staan in de lijst.",
      },
      {
        question: "Hoe start ik een privégesprek?",
        answer:
          "In de berichtenlijst staat onderaan de sectie 'Nieuw gesprek' met alle beschikbare deelnemers. " +
          "Klik op een naam om een privégesprek te starten. " +
          "Het gesprek verschijnt daarna in je lijst.\n\n" +
          "**Let op**: Spelbegeleiders moeten eerst hun naam invullen (bij het openen van de link) om zichtbaar te zijn voor anderen.",
      },
      {
        question: "Wat is een broadcast?",
        answer:
          "Een broadcast is een belangrijk bericht van de beheerder, bijvoorbeeld 'Ronde 3 begint 5 minuten later' of 'Veld B is afgesloten'.\n\n" +
          "**Versturen**: In de groepschat vink je het vakje 'Broadcast' aan vóór het versturen.\n\n" +
          "**Weergave**: Het bericht verschijnt als opvallende oranje banner bovenaan het scherm van alle spelbegeleiders, " +
          "ook als ze niet in de chat zitten. De banner blijft zichtbaar tot de spelbegeleider hem wegklikt.",
      },
      {
        question: "Hoe weet ik of er nieuwe berichten zijn?",
        answer:
          "Een rood bolletje met het aantal ongelezen berichten verschijnt op het tabblad 'Berichten'. " +
          "Dit werkt op zowel de beheerder- als spelbegeleider-pagina.\n\n" +
          "Berichten worden elke paar seconden automatisch opgehaald — je hoeft de pagina niet te vernieuwen.",
      },
      {
        question: "Zijn berichten zichtbaar voor iedereen?",
        answer:
          "**Groepschat**: Ja, alle berichten in de groepschat zijn zichtbaar voor alle spelbegeleiders en de beheerder.\n\n" +
          "**Privégesprekken**: Nee, alleen de twee deelnemers kunnen de berichten lezen.\n\n" +
          "**Broadcast**: Zichtbaar voor alle spelbegeleiders.",
      },
    ],
  },
  {
    id: "tips",
    title: "Tips en veelgestelde vragen",
    items: [
      {
        question: "Hoeveel groepen kan ik maximaal instellen?",
        answer:
          "Er is geen harde limiet. Het systeem werkt het beste met 4 tot 30 groepen. " +
          "Bij meer dan 30 groepen raden we aan om pools te gebruiken zodat het schema overzichtelijk blijft.",
      },
      {
        question: "Het systeem zegt dat niet alle groepen alle spellen spelen. Wat kan ik doen?",
        answer:
          "Dit komt voor als de wiskundige combinatie van groepen en spellen geen perfect schema toelaat. " +
          "Het systeem toont suggesties om dit op te lossen:\n\n" +
          "- **Groepen aanpassen**: Een ander aantal groepen kan een perfecte indeling geven\n" +
          "- **Spellen aanpassen**: Meer of minder spellen kan helpen\n" +
          "- **Extra rondes**: Meer speelrondes geven meer groepen de kans om alle spellen te spelen\n\n" +
          "Klik op 'Optimaliseer mijn kroegentocht' in stap 7 om de beste alternatieven te zien.",
      },
      {
        question: "Wat betekent 'herhalingen' in de analyse?",
        answer:
          "Een herhaling betekent dat een groep dezelfde spel meer dan één keer speelt. " +
          "Bij 0 herhalingen speelt elke groep elke spel precies één keer — dat is ideaal.\n\n" +
          "Herhalingen zijn niet altijd te vermijden, vooral bij ongunstige combinaties van groepen en spellen. " +
          "Het systeem minimaliseert herhalingen automatisch.",
      },
      {
        question: "Kan ik het schema printen?",
        answer:
          "Ja, op twee manieren:\n\n" +
          "- **PDF-export** (aanbevolen): via de knop 'Exporteren' in de planner download je het rooster, groepskaarten, locatie-overzicht of scorebord als PDF. Deze zijn geoptimaliseerd voor afdrukken.\n" +
          "- **Browser-print**: open het schema op volledig scherm (tabblad-icoon) en gebruik Ctrl+P of Cmd+P.\n\n" +
          "Zie ook het onderdeel 'Welke exports zijn er?' in de Planner-sectie.",
      },
      {
        question: "Worden mijn gegevens veilig opgeslagen?",
        answer:
          "Ja. Je gegevens worden opgeslagen op beveiligde servers. " +
          "Alleen jij en de leden van je organisatie hebben toegang tot je configuraties en plannen.\n\n" +
          "Je kunt ook kiezen voor lokale opslag (alleen in je browser) via Instellingen > Opslag.",
      },
    ],
  },
];

export default function HelpPage() {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  function toggleItem(id: string) {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <h2 style={{ margin: 0 }}>Helpcenter</h2>
      <p className="muted" style={{ margin: 0 }}>
        Alles wat je moet weten over Plan je Kroegentocht. Klik op een onderwerp om het antwoord te lezen.
      </p>

      <div className="help-sections-grid">
      {HELP_SECTIONS.map((section) => (
        <section key={section.id} className="card">
          <h3 style={{ margin: "0 0 10px" }}>{section.title}</h3>
          <div style={{ display: "grid", gap: 0 }}>
            {section.items.map((item, i) => {
              const itemId = `${section.id}-${i}`;
              const isOpen = openItems.has(itemId);
              return (
                <div key={itemId} style={{ borderTop: i > 0 ? "1px solid var(--line)" : "none" }}>
                  <button
                    type="button"
                    onClick={() => toggleItem(itemId)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      width: "100%",
                      padding: "10px 0",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      color: "var(--text)",
                      fontWeight: 600,
                      fontSize: "0.9rem",
                    }}
                  >
                    {item.question}
                    <span style={{ flexShrink: 0, marginLeft: 8, fontSize: "0.75rem", color: "var(--muted)", transition: "transform 0.15s ease", transform: isOpen ? "rotate(180deg)" : "none" }}>
                      &#9660;
                    </span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: "0 0 12px", fontSize: "0.88rem", lineHeight: 1.6, color: "var(--text)" }}>
                      {item.answer.split("\n\n").map((paragraph, pi) => (
                        <p key={pi} style={{ margin: pi === 0 ? 0 : "8px 0 0" }} dangerouslySetInnerHTML={{
                          __html: paragraph
                            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                            .replace(/\n- /g, "<br/>- ")
                            .replace(/\n(\d+)\. /g, "<br/>$1. "),
                        }} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      </div>
    </div>
  );
}
