export interface MaterialItem {
  name: string;
  quantity: number;
  unit: string;
  optional: boolean;
}

export interface SpelExplanation {
  summary: string;
  rules: string;
  /** Wat moet er op de bar/tafel klaargezet worden voor dit spel. */
  fieldSetup: string;
  playersPerTeam: string;
  duration: string;
  variants?: string;
}

export interface SpelDefinition {
  key: string;
  name: string;
  materials: MaterialItem[];
  explanation: SpelExplanation;
}

export const SPEL_REGISTRY: SpelDefinition[] = [
  {
    key: "bierpong",
    name: "Bierpong",
    materials: [
      { name: "Plastic bekers (rood)", quantity: 20, unit: "stuks", optional: false },
      { name: "Pingpongballen", quantity: 4, unit: "stuks", optional: false },
      { name: "Bier (om bekers half te vullen)", quantity: 2, unit: "liter", optional: false },
      { name: "Water (om bal in te spoelen)", quantity: 1, unit: "glas", optional: true },
    ],
    explanation: {
      summary: "Twee teams gooien een pingpongbal in de plastic bekers van de tegenstander. Geraakt = leegdrinken.",
      rules: "Vorm aan beide kanten van de tafel een driehoek van 10 bekers (zoals biljartballen).\nVul elke beker voor ⅓ met bier.\nTeams om de beurt: 2 worpen per beurt (één per teamlid).\nElke gegooide bal die in een beker landt: de tegenstander drinkt die beker leeg en haalt 'm van tafel.\nBouncen mag, maar tegenstander mag dan de bal wegslaan.\nWie alle bekers leeg heeft, wint.",
      fieldSetup: "Zet aan beide uiteinden van een tafel 10 bekers neer in driehoek-formatie. Vul vóór de start elke beker voor ⅓ met bier. Houd een glas water apart om de bal schoon te spoelen tussen worpen.",
      playersPerTeam: "2-4 spelers per team",
      duration: "15-25 minuten",
      variants: "Re-rack op verzoek (na 6 of 4 bekers). Of: gooien-én-vangen variant waarin de tegenstander mag proberen te vangen voor extra worp.",
    },
  },
  {
    key: "flip-cup",
    name: "Flip Cup",
    materials: [
      { name: "Plastic bekers", quantity: 10, unit: "stuks", optional: false },
      { name: "Bier", quantity: 1, unit: "liter", optional: false },
    ],
    explanation: {
      summary: "Twee teams in een rij. Drink je beker leeg en flip 'm op z'n kop op de rand van de tafel. Volgende mag pas beginnen als jij gelukt bent.",
      rules: "Zet aan beide kanten van de tafel een rij bekers, ⅓ gevuld met bier.\nDe eerste spelers per team drinken hun beker leeg.\nDaarna zetten ze de beker omgekeerd op de tafelrand en flippen 'm met één vinger zodat 'ie ondersteboven blijft staan.\nPas als dat lukt mag de volgende beginnen.\nHet team dat als eerste alle bekers heeft geflipt, wint.",
      fieldSetup: "Stel aan beide lange zijden van de tafel evenveel bekers op (1 per speler), ⅓ gevuld met bier. Zet de twee teams tegenover elkaar op.",
      playersPerTeam: "3-6 spelers per team",
      duration: "5-10 minuten per ronde, best of 3",
      variants: "Estafette: de laatste flipper rent terug naar het begin om nogmaals te flippen.",
    },
  },
  {
    key: "kingsdrink",
    name: "Kingsdrink",
    materials: [
      { name: "Speelkaarten (volledig kaartspel)", quantity: 1, unit: "deck", optional: false },
      { name: "Grote koningsbeker (op midden tafel)", quantity: 1, unit: "stuks", optional: false },
      { name: "Bier of mixdrankje voor iedereen", quantity: 1, unit: "drankje per persoon", optional: false },
    ],
    explanation: {
      summary: "Trek om de beurt een kaart en voer de bijbehorende drink-opdracht uit. De vierde koning leegt de pot.",
      rules: "Iedereen zit rond de tafel. De koningsbeker staat in het midden.\nLeg de kaarten omgekeerd om de beker. Speel met de klok mee.\nElk kaartnummer heeft een actie (gebruik de standaard regels, of pas aan):\n- 2: jij wijst iemand aan die drinkt\n- 3: jij drinkt zelf\n- 4: meiden drinken\n- 5: thumb master (anderen moeten 'm volgen)\n- 6: jongens drinken\n- 7: heaven (laatste die hand omhoog steekt drinkt)\n- 8: kies een drink-buddy\n- 9: rijm op een woord, wie faalt drinkt\n- 10: categorieën, wie faalt drinkt\n- Boer: regel maken die de rest van het spel geldt\n- Vrouw: vraag iemand iets persoonlijks\n- Heer: schenk wat in de koningsbeker\n- Aas: maak een waterval — iedereen drinkt, stoppen mag pas als de persoon links van je is gestopt\nWie de vierde koning trekt, drinkt de koningsbeker leeg.",
      fieldSetup: "Plaats een lege grote beker midden op de tafel. Leg het hele kaartspel omgedraaid in een cirkel om de beker heen. Iedereen heeft een eigen drankje binnen handbereik.",
      playersPerTeam: "4-10 spelers (1 grote groep, geen teams)",
      duration: "20-40 minuten",
      variants: "Eigen regels per kaart (huisregels). Of: de eerste 4 koningen schenkt iedereen iets in, alleen de laatste drinkt.",
    },
  },
  {
    key: "wie-ben-ik",
    name: "Wie ben ik?",
    materials: [
      { name: "Post-it briefjes", quantity: 8, unit: "stuks", optional: false },
      { name: "Pen", quantity: 2, unit: "stuks", optional: false },
      { name: "Drankje per persoon", quantity: 1, unit: "drankje per persoon", optional: false },
    ],
    explanation: {
      summary: "Iedereen krijgt een naam op het voorhoofd. Met ja/nee-vragen raden wie je bent. Wie te lang doet, drinkt.",
      rules: "Schrijf elk een bekende naam (BN'er, fictieve figuur, historisch persoon) op een post-it.\nGeef je briefje aan je linkerbuurman die het op zijn voorhoofd plakt.\nOm de beurt mag je 1 ja/nee-vraag stellen om je identiteit te raden.\nBij 'ja' mag je nog een vraag, bij 'nee' is de volgende aan de beurt.\nWie zijn naam raadt mag stoppen (en niet meer drinken).\nElke ronde drinkt iedereen die nog niet geraden heeft een slok.",
      fieldSetup: "Leg de post-its en pennen midden op tafel. Iedereen schrijft een naam op en plakt 'm op het voorhoofd van de buur. Niemand mag z'n eigen briefje zien.",
      playersPerTeam: "4-8 spelers (geen teams)",
      duration: "10-20 minuten",
      variants: "Thema-ronde: alleen BN'ers / alleen films / alleen muzikanten. Of: telkens 3 ja-antwoorden = nog een slok extra.",
    },
  },
  {
    key: "kaartjeblazen",
    name: "Kaartjeblazen",
    materials: [
      { name: "Speelkaarten", quantity: 1, unit: "deck", optional: false },
      { name: "Lege fles", quantity: 1, unit: "stuks", optional: false },
      { name: "Shotjes (sterke drank)", quantity: 5, unit: "shots", optional: false },
    ],
    explanation: {
      summary: "Een stapel kaarten op een fles. Elk om de beurt blaas je kaarten weg — wie 'm laat omvallen krijgt een shot.",
      rules: "Zet een lege fles in het midden van de tafel.\nLeg het hele kaartspel op de hals van de fles als een stapeltje.\nOm de beurt blaas je 1 of meerdere kaarten weg.\nJe moet minstens 1 kaart eraf blazen. Als de hele stapel eraf valt: shot voor jou en het spel begint opnieuw.\nDoel: zo voorzichtig mogelijk blazen, en je tegenstanders een lastige stapel achterlaten.",
      fieldSetup: "Zet een lege fles midden op de tafel. Leg het hele kaartspel netjes opgestapeld op de flessenhals. Zet de shots klaar binnen handbereik.",
      playersPerTeam: "3-8 spelers (geen teams, individueel)",
      duration: "10-15 minuten",
      variants: "Strafshots oplopend: 1e val = 1 shot, 2e val = 2 shots, etc.",
    },
  },
  {
    key: "glaasje-pong",
    name: "Glaasje Pong",
    materials: [
      { name: "Shotglaasjes", quantity: 12, unit: "stuks", optional: false },
      { name: "Pingpongbal", quantity: 1, unit: "stuks", optional: false },
      { name: "Sterke drank (te shotten)", quantity: 0.5, unit: "liter", optional: false },
    ],
    explanation: {
      summary: "Mini-variant van bierpong met shotglaasjes. Stuiter de bal de glaasjes in.",
      rules: "Zet 6 shotglaasjes aan elke kant in een driehoek, gevuld met een shot sterke drank.\nTeams gooien om de beurt een pingpongbal en proberen 'm in een glaasje te stuiteren.\nElke geraakte shot: tegenstander drinkt 'm.\nDoor de kleinere doelen veel moeilijker dan bierpong — bouncen aanbevolen.\nWie als eerste alle 6 glaasjes geraakt heeft, wint.",
      fieldSetup: "Zet aan beide einden van de tafel een driehoek van 6 shotglaasjes (3-2-1). Vul elke met een shot. Houd een glas water in de buurt om de bal schoon te spoelen.",
      playersPerTeam: "2-4 spelers per team",
      duration: "10-20 minuten",
      variants: "1 grote sterke fles met shots inschenken bij elke geraakte: één teamlid moet hem leegdrinken.",
    },
  },
  {
    key: "beerball",
    name: "Beerball",
    materials: [
      { name: "Blikjes bier (per speler)", quantity: 4, unit: "blik", optional: false },
      { name: "Pingpongbal", quantity: 1, unit: "stuks", optional: false },
    ],
    explanation: {
      summary: "Twee teams tegenover elkaar. Gooi de bal op de tegenstanders blikjes. Als jouw blik geraakt is, drinken jullie tegen de klok.",
      rules: "Zet elk teamlid een blikje bier op de tafel voor zich.\nTeams gooien om de beurt de pingpongbal, met als doel een blikje van de tegenstander te raken.\nAls een blikje geraakt is: alle leden van dat team openen hun blik en drinken zo snel mogelijk.\nIntussen rent het werpende team om 1 keer rond de tafel.\nZodra het werpende team weer op de plek is: roepen 'stop' — de andere team moet stoppen met drinken, ook als ze niet leeg zijn.\nElke incomplete drinker krijgt een straf-slok extra.",
      fieldSetup: "Zet een tafel klaar met genoeg ruimte aan beide korte zijden. Per persoon één gesloten blikje voor zich op tafel. De pingpongbal ligt klaar voor het beginnende team.",
      playersPerTeam: "3-5 spelers per team",
      duration: "15-25 minuten",
      variants: "Bonus-shot bij hit op het centrale blik. Of: zonder rondje rennen, op kommando 'stop' van de werper.",
    },
  },
  {
    key: "ringtoss",
    name: "Ringtoss",
    materials: [
      { name: "Plastic ringen of haakjes", quantity: 4, unit: "stuks", optional: false },
      { name: "Flessen (lege bierflessen)", quantity: 6, unit: "stuks", optional: false },
      { name: "Stickers met getallen 1-10", quantity: 6, unit: "set", optional: true },
      { name: "Shots", quantity: 6, unit: "shots", optional: false },
    ],
    explanation: {
      summary: "Gooi ringen over flessenhalsen. Elke fles heeft een punt-waarde — verlies = drinken.",
      rules: "Zet 6 flessen in een rij op een rij. Plak getallen erop (1-10 punten).\nElke speler krijgt 4 ringen.\nOm de beurt gooi je vanaf een vaste lijn (ca. 2-3 meter).\nElke geraakte fles = die waarde aan punten voor jou.\nNa een ronde: speler met laagste score drinkt een shot.\nBest of 5 of best of 7.",
      fieldSetup: "Zet 6 lege flessen op een rij op de bar of de grond. Markeer een werp-lijn op ~2,5 meter. Leg de ringen klaar bij de werp-lijn en de shots binnen handbereik.",
      playersPerTeam: "individueel, 3-8 spelers",
      duration: "10-15 minuten",
      variants: "Duo-modus: in koppels gooien. Of: 'high stakes' fles met dubbele waarde maar straf bij missen.",
    },
  },
  {
    key: "mexen",
    name: "Mexen (Liar's Dice)",
    materials: [
      { name: "Dobbelstenen", quantity: 2, unit: "stuks", optional: false },
      { name: "Dobbelbeker", quantity: 1, unit: "stuks", optional: false },
      { name: "Bier of shotjes (sip per ronde)", quantity: 1, unit: "drankje per persoon", optional: false },
    ],
    explanation: {
      summary: "Klassieker met dobbelstenen en bluffen. Verlies = drinken.",
      rules: "De startspeler gooit 2 dobbelstenen onder de beker en kijkt stiekem.\nNoemt de score (hoog of bluf) en geeft door aan de buur.\nBuur kan geloven (doorgooien met minstens hogere score) of niet-geloven (beker omhoog!).\nDe hoogste score: 'Mexen' = 2+1 (21), daarna dubbele 1-6, daarna 6-5, 6-4 etc.\nWie betrapt op een leugen: drinkt een slok.\nWie 3x verliest: shot.",
      fieldSetup: "Geef één persoon de dobbelbeker met 2 dobbelstenen. Iedereen heeft een eigen drankje. Speel met de klok mee.",
      playersPerTeam: "3-6 spelers (individueel)",
      duration: "15-25 minuten",
      variants: "Met 3 dobbelstenen voor meer mogelijke combinaties.",
    },
  },
  {
    key: "categorieen",
    name: "Categorieën",
    materials: [
      { name: "Drankje per persoon", quantity: 1, unit: "drankje per persoon", optional: false },
    ],
    explanation: {
      summary: "Snel categorieën opnoemen. Wie hapert, drinkt.",
      rules: "Iemand noemt een categorie (bv. 'soorten bier', 'voetbalclubs', 'tv-series').\nMet de klok mee noemt iedereen om de beurt iets dat in die categorie past.\nDuplicaten of pauze langer dan 3 seconden = drinken.\nNa een fout begint de volgende speler een nieuwe categorie.",
      fieldSetup: "Geen rekwisieten nodig. Iedereen rond de tafel met een eigen drankje. Eventueel een lijst categorieën om uit te kiezen (zelf bedenken werkt ook prima).",
      playersPerTeam: "4-10 spelers (geen teams)",
      duration: "10-20 minuten",
      variants: "Op tijd: elke speler 3 seconden per beurt. Of: thema-ronde rond een specifiek thema.",
    },
  },
  {
    key: "stripspel",
    name: "Stripspel (Slapjack)",
    materials: [
      { name: "Speelkaarten", quantity: 1, unit: "deck", optional: false },
      { name: "Drankje per persoon", quantity: 1, unit: "drankje per persoon", optional: false },
    ],
    explanation: {
      summary: "Snel reageren. Bij een boer slaat iedereen tegelijk — wie als laatste 'sla' geeft, drinkt.",
      rules: "Deel het hele kaartspel in gelijke stapels rond. Elke speler heeft een eigen stapel voor zich (omgekeerd).\nOm de beurt legt iedereen één kaart op de centrale stapel midden op de tafel.\nZodra er een boer (jack) opligt, slaan alle spelers zo snel mogelijk hun hand op de stapel.\nDe laatste hand op de stapel: drinkt een slok.\nDe snelste hand: krijgt alle kaarten van de centrale stapel.\nWie geen kaarten meer heeft is uit. De winnaar is wie alle kaarten heeft.",
      fieldSetup: "Deel het hele kaartspel gelijk over alle spelers. Iedereen houdt z'n stapel voor zich, omgekeerd. Plek midden op tafel voor de centrale stapel.",
      playersPerTeam: "3-6 spelers (individueel)",
      duration: "15-30 minuten",
      variants: "Naast boeren ook bij aas of dame — meer slap-momenten. Of: per slap een straf-shot bij de laatste.",
    },
  },
  {
    key: "thumb-master",
    name: "Thumb Master",
    materials: [
      { name: "Drankje per persoon", quantity: 1, unit: "drankje per persoon", optional: false },
    ],
    explanation: {
      summary: "Eén persoon is 'Thumb Master'. Als die de duim op tafel legt, doet de rest 't ook — de laatste drinkt.",
      rules: "Een persoon wordt aangewezen als Thumb Master voor de rest van de avond (of voor één ronde).\nOp elk willekeurig moment mag de Thumb Master z'n duim subtiel op de rand van de tafel leggen.\nAls iemand het ziet, moet die zo snel mogelijk ook z'n duim neerleggen.\nDe laatste persoon die het opmerkt en z'n duim plaatst: drinkt een slok.\nGeen aankondigen, geen aanwijzen — alleen oplettend zijn.",
      fieldSetup: "Geen voorbereiding. Wijs één persoon aan als Thumb Master. Iedereen heeft een drankje binnen handbereik.",
      playersPerTeam: "4-12 spelers (geen teams)",
      duration: "Doorlopend, hele avond mogelijk",
      variants: "Combineren met andere spellen — Thumb Master blijft naast actief spel doorlopen.",
    },
  },
  {
    key: "drink-trivia",
    name: "Drink-Trivia",
    materials: [
      { name: "Vragenkaartjes of trivia-app", quantity: 1, unit: "set", optional: false },
      { name: "Drankje per persoon", quantity: 1, unit: "drankje per persoon", optional: false },
    ],
    explanation: {
      summary: "Een quizmaster stelt vragen. Fout antwoord = slok.",
      rules: "Eén speler is quizmaster (rouleert eventueel).\nDe quizmaster stelt om de beurt een vraag aan een speler.\nFout antwoord: 1 slok.\nGeen antwoord binnen 10 seconden: 1 slok.\nGoed antwoord: bonus — wijs iemand anders aan die een slok drinkt.\nNa 10 rondes wordt de quizmaster gewisseld.",
      fieldSetup: "Vragen-bron klaarleggen: stapel kaartjes, telefoon met trivia-app, of een quiz-PDF uitgeprint. Quizmaster pakt vragen om de beurt voor elke speler.",
      playersPerTeam: "4-10 spelers (geen teams)",
      duration: "20-30 minuten",
      variants: "Categorie-modus: speler kiest categorie. Of: teams in plaats van individueel.",
    },
  },
  {
    key: "karaoke-challenge",
    name: "Karaoke Challenge",
    materials: [
      { name: "Karaoke-app of telefoon met instrumental-tracks", quantity: 1, unit: "stuks", optional: false },
      { name: "Speaker of microfoon", quantity: 1, unit: "stuks", optional: true },
      { name: "Drankje per persoon", quantity: 1, unit: "drankje per persoon", optional: false },
    ],
    explanation: {
      summary: "Per beurt zing je 30 seconden van een gekozen nummer. Vergeet je de tekst, drink.",
      rules: "Maak een lijst van bekende meezing-nummers (suggesties: queen, abba, dutch top-40).\nOm de beurt trekt iemand een willekeurig nummer (of laat de groep kiezen).\nDe zanger zingt 30 seconden, met of zonder ondersteuning.\nVergeet je de tekst of stop je vroeg: 2 slokken.\nLukt het tot het einde: jouw beurt is voorbij, volgende.\nDuetten mogen, dan delen ze de straf.",
      fieldSetup: "Speaker of telefoon klaarzetten met een karaoke-app of YouTube karaoke-playlist. Eventueel teksten als backup. Iedereen rond de tafel met een drankje.",
      playersPerTeam: "3-8 spelers (geen teams)",
      duration: "15-30 minuten",
      variants: "Battle-modus: twee zangers, publiek beslist wie wint. Verliezer drinkt.",
    },
  },
  {
    key: "shots-roulette",
    name: "Shots Roulette",
    materials: [
      { name: "Shotglaasjes (5 herkenbaar, 1 mysterie)", quantity: 6, unit: "stuks", optional: false },
      { name: "Sterke drank (gin, tequila, mix)", quantity: 6, unit: "shots", optional: false },
    ],
    explanation: {
      summary: "Vijf shots zijn duidelijk; één is het 'mystery shot' — zout, tabasco, of iets ergers. Door elkaar.",
      rules: "Vul 5 shotglaasjes met een normale sterke drank.\nVul 1 glaasje met iets onaangenaams (warm water + zout + tabasco, of een 'pickle juice'-shot).\nMaak duidelijk welke shots wat zijn maar plaats ze in willekeurige volgorde op een dienblad.\nElke speler kiest een shot zonder vooraf te ruiken.\nWie de mystery-shot kiest: leegdrinken voor publiek.\nNa 5 spelers wordt opnieuw ingeschonken.",
      fieldSetup: "Vul 5 shots met sterke drank en 1 met de 'mystery' (vooraf voorbereid). Plaats alle 6 op een dienblad in een rij, niet aangeduid welke is welke. Houd extra shots klaar voor de volgende ronde.",
      playersPerTeam: "5-8 spelers (individueel)",
      duration: "5-10 minuten per ronde",
      variants: "Twee mystery-shots in 6 glaasjes voor hogere risk. Of: dubbele beurt voor wie een gewone shot krijgt.",
    },
  },
];

export function findSpelByKey(key: string): SpelDefinition | undefined {
  return SPEL_REGISTRY.find((s) => s.key === key);
}

export function findSpelByName(name: string): SpelDefinition | undefined {
  return SPEL_REGISTRY.find((s) => s.name.toLowerCase() === name.toLowerCase());
}

export function getSpelNames(): string[] {
  return SPEL_REGISTRY.map((s) => s.name);
}
