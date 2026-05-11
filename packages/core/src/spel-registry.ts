export interface MaterialItem {
  name: string;
  quantity: number;
  unit: string;
  optional: boolean;
}

export interface SpelExplanation {
  summary: string;
  rules: string;
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
    key: "voetbal",
    name: "Voetbal",
    materials: [
      { name: "Voetbal", quantity: 1, unit: "stuks", optional: false },
      { name: "Doelen (paar)", quantity: 1, unit: "sets", optional: false },
      { name: "Hesjes", quantity: 8, unit: "stuks", optional: false },
      { name: "Pionnen", quantity: 4, unit: "stuks", optional: true },
    ],
    explanation: {
      summary: "Twee teams proberen de bal in het doel van de tegenstander te schieten. Het team met de meeste doelpunten wint.",
      rules: "Verdeel de groep in twee teams en geef elk team hesjes.\nDe bal mag alleen met de voeten gespeeld worden (niet met handen, behalve de keeper).\nNa een doelpunt wordt de bal vanaf het midden hervat.\nBij uit: de tegenstander gooit in.\nGeen slidings of hard lichamelijk contact.\nBij gelijkspel na de tijd: het blijft gelijk, of neem strafschoppen.",
      fieldSetup: "Zet de 2 doelen tegenover elkaar op circa 20-30 meter afstand.\nMarkeer eventueel de zijlijnen met 4 pionnen.\nLeg de bal op het middenpunt.",
      playersPerTeam: "5-8 spelers",
      duration: "10-15 minuten",
      variants: "Kleiner veld en kleinere doelen voor jongere kinderen. Of: iedereen moet de bal geraakt hebben voordat er gescoord mag worden.",
    },
  },
  {
    key: "hockey",
    name: "Hockey",
    materials: [
      { name: "Hockeysticks", quantity: 8, unit: "stuks", optional: false },
      { name: "Hockeybal", quantity: 2, unit: "stuks", optional: false },
      { name: "Doelen (paar)", quantity: 1, unit: "sets", optional: false },
      { name: "Hesjes", quantity: 8, unit: "stuks", optional: false },
    ],
    explanation: {
      summary: "Twee teams spelen met sticks en proberen een bal in het doel van de tegenstander te slaan.",
      rules: "Verdeel de groep in twee teams en geef elk team hesjes en sticks.\nDe bal mag alleen met de platte kant van de stick gespeeld worden.\nDe stick mag niet boven schouderhoogte komen (veiligheid).\nNa een doelpunt herstart het spel vanuit het midden.\nGeen lichamelijk contact of gevaarlijk stickgebruik.\nBij uit: de tegenstander neemt een vrije slag.",
      fieldSetup: "Zet de 2 doelen tegenover elkaar op circa 20-25 meter afstand.\nVerdeel de 8 hockeysticks gelijk over beide teams.\nLeg 1 hockeybal klaar op het midden, houd 1 reserve achter de hand.",
      playersPerTeam: "4-6 spelers",
      duration: "10-15 minuten",
      variants: "Gebruik een zachte bal voor jongere kinderen. Of: speel zonder keeper voor meer actie.",
    },
  },
  {
    key: "basketbal",
    name: "Basketbal",
    materials: [
      { name: "Basketbal", quantity: 1, unit: "stuks", optional: false },
      { name: "Basketbalring", quantity: 2, unit: "stuks", optional: false },
      { name: "Hesjes", quantity: 8, unit: "stuks", optional: false },
    ],
    explanation: {
      summary: "Twee teams proberen de bal in de basket van de tegenstander te gooien door te dribbelen en over te spelen.",
      rules: "Verdeel de groep in twee teams en geef elk team hesjes.\nDe bal mag niet gedragen worden: dribbel of speel over.\nNa een doelpunt (2 punten) krijgt de tegenstander de bal.\nBij uit: de tegenstander gooit in.\nGeen duwen of slaan op de arm.\nBij een overtreding: vrije worp voor de tegenstander.",
      fieldSetup: "Zet de 2 basketbalringen tegenover elkaar op circa 15-20 meter afstand.\nMarkeer een speelveld van circa 15x10 meter als dat niet al duidelijk is.\nLeg de bal klaar bij het midden.",
      playersPerTeam: "4-6 spelers",
      duration: "10-15 minuten",
      variants: "Lager hangen van de ring voor jongere kinderen. Of: elk teamlid moet gescoord hebben voordat een punt dubbel telt.",
    },
  },
  {
    key: "korfbal",
    name: "Korfbal",
    materials: [
      { name: "Korfbal", quantity: 1, unit: "stuks", optional: false },
      { name: "Korfbalpaal", quantity: 2, unit: "stuks", optional: false },
      { name: "Hesjes", quantity: 8, unit: "stuks", optional: false },
    ],
    explanation: {
      summary: "Twee teams proberen de bal in de korf van de tegenstander te gooien. Je mag niet lopen met de bal.",
      rules: "Verdeel de groep in twee teams en geef elk team hesjes.\nDe bal mag niet gedragen worden: sta stil en speel over of schiet.\nJe mag de bal niet uit iemands handen slaan.\nNa een doelpunt wisselen de teams van vak (aanval/verdediging).\nVerdedigen mag alleen door de worp te blokkeren met je armen, niet door te duwen.\nBij een overtreding: vrije worp.",
      fieldSetup: "Zet de 2 korfbalpalen op circa 15-20 meter afstand.\nVerdeel het veld in twee vakken (aanval en verdediging).\nLeg de bal klaar bij het midden.",
      playersPerTeam: "4-8 spelers",
      duration: "10-15 minuten",
      variants: "Zonder vakken: iedereen mag overal komen. Of: na 3 doelpunten wissel je aanvallers en verdedigers.",
    },
  },
  {
    key: "trefbal",
    name: "Trefbal",
    materials: [
      { name: "Zachte ballen", quantity: 3, unit: "stuks", optional: false },
      { name: "Pionnen (veldmarkering)", quantity: 4, unit: "stuks", optional: false },
    ],
    explanation: {
      summary: "Twee teams proberen elkaar af te gooien met zachte ballen. Wie geraakt wordt, is af.",
      rules: "Verdeel de groep in twee teams, elk op een eigen helft.\nTeams gooien de ballen naar spelers van het andere team.\nWie geraakt wordt (onder de schouders) is af en gaat aan de zijkant staan.\nVangt een speler de bal, dan is de gooier af.\nKoppen gelden niet: de gooier is dan af.\nHet team dat als eerste alle tegenstanders heeft afgegooid wint.\nBij tijdslimiet wint het team met de meeste overgebleven spelers.",
      fieldSetup: "Markeer een rechthoekig veld van circa 10x15 meter.\nZet 2 pionnen aan elke korte zijde als hoekmarkering.\nLeg de 3 ballen op de middenlijn.",
      playersPerTeam: "6-12 spelers",
      duration: "8-10 minuten per potje",
      variants: "Met meer ballen voor meer actie. Of: afgegooid spelers mogen terug als een teamgenoot de bal vangt.",
    },
  },
  {
    key: "touwtrekken",
    name: "Touwtrekken",
    materials: [
      { name: "Touwtrek-touw", quantity: 1, unit: "stuks", optional: false },
      { name: "Markering (lint/pion)", quantity: 1, unit: "stuks", optional: false },
    ],
    explanation: {
      summary: "Twee teams trekken aan weerszijden van een touw. Het team dat de tegenstander over de lijn trekt, wint.",
      rules: "Verdeel de groep in twee gelijke teams.\nElk team pakt het touw aan één kant vast.\nBind de markering in het midden van het touw of leg een pion op de grond als middellijn.\nOp het fluitsignaal begint het trekken.\nHet team dat het middelpunt van het touw over hun lijn trekt, wint.\nNiet om het touw wikkelen rond handen of lichaam.\nBeste van 3 rondes.",
      fieldSetup: "Leg het touw in een rechte lijn op de grond.\nMarkeer het midden van het touw met de markering.\nMarkeer een lijn op de grond (pion of krijt) als middellijn.\nZorg voor voldoende ruimte achter beide teams.",
      playersPerTeam: "4-8 spelers",
      duration: "5-8 minuten (3 rondes)",
    },
  },
  {
    key: "zaklopen",
    name: "Zaklopen",
    materials: [
      { name: "Jute zakken", quantity: 8, unit: "stuks", optional: false },
      { name: "Pionnen (start/finish)", quantity: 4, unit: "stuks", optional: false },
    ],
    explanation: {
      summary: "Deelnemers springen in een jute zak zo snel mogelijk naar de finish. Een klassiek estafette-spel.",
      rules: "Elke deelnemer stapt in een jute zak en houdt deze vast bij de bovenkant.\nOp het startsignaal spring je zo snel mogelijk naar het keerpunt en terug.\nJe mag niet lopen: alleen springen met beide voeten in de zak.\nAls je valt, sta je op dezelfde plek weer op en ga je verder.\nBij estafette: tik de volgende af of geef de zak door.\nHet team waarvan alle spelers het eerst klaar zijn, wint.",
      fieldSetup: "Zet 2 pionnen als startlijn en 2 pionnen als keerpunt op circa 10-15 meter afstand.\nLeg de 8 jute zakken klaar bij de startlijn.\nZorg voor een vlakke, zachte ondergrond (gras).",
      playersPerTeam: "4-8 spelers",
      duration: "8-10 minuten",
      variants: "In tweetallen: twee spelers in één grote zak. Of: combineer met een hindernis-parcours.",
    },
  },
  {
    key: "tikkertje",
    name: "Tikkertje",
    materials: [
      { name: "Hesjes (tikkers)", quantity: 2, unit: "stuks", optional: false },
      { name: "Pionnen (veldmarkering)", quantity: 4, unit: "stuks", optional: true },
    ],
    explanation: {
      summary: "Een of twee tikkers proberen de andere spelers te tikken. Wie getikt wordt, wordt ook tikker of is af.",
      rules: "Kies 1-2 tikkers en geef hen de hesjes.\nDe tikkers proberen andere spelers te tikken door hen aan te raken.\nWie getikt wordt, is af en gaat aan de kant staan (of wordt ook tikker).\nSpelers mogen niet buiten het veld komen.\nDe laatste speler die overblijft, wint.\nNieuw rondje: de winnaar mag de eerste tikker kiezen.",
      fieldSetup: "Markeer een speelveld van circa 15x15 meter met 4 pionnen.\nHoe kleiner het veld, hoe sneller het spel.\nGeef de tikkers de 2 hesjes zodat ze herkenbaar zijn.",
      playersPerTeam: "8-15 spelers (heel groep)",
      duration: "5-8 minuten per ronde",
      variants: "Schildpad-tikkertje: je bent veilig als je op je rug ligt. Of: verstenen-tikkertje: wie getikt wordt staat stil tot een vrij teamgenoot je aanraakt.",
    },
  },
  {
    key: "handbal",
    name: "Handbal",
    materials: [
      { name: "Handbal", quantity: 1, unit: "stuks", optional: false },
      { name: "Doelen (paar)", quantity: 1, unit: "sets", optional: false },
      { name: "Hesjes", quantity: 8, unit: "stuks", optional: false },
    ],
    explanation: {
      summary: "Twee teams proberen een bal met de hand in het doel van de tegenstander te gooien.",
      rules: "Verdeel de groep in twee teams en geef elk team hesjes.\nDe bal mag alleen met de handen gespeeld worden (niet voeten).\nJe mag maximaal 3 stappen zetten met de bal, dan moet je overspelen of schieten.\nNiet in het doelgebied komen (circa 3 meter rond het doel).\nNa een doelpunt hervat de tegenstander vanaf het midden.\nGeen duwen of vasthouden van tegenstanders.",
      fieldSetup: "Zet de 2 doelen tegenover elkaar op circa 20-25 meter afstand.\nMarkeer een doelgebied van circa 3 meter voor elk doel (met krijt of pionnen).\nLeg de bal klaar op het midden.",
      playersPerTeam: "5-7 spelers",
      duration: "10-15 minuten",
      variants: "Zonder doelgebied voor meer actie. Of: iedereen moet de bal aangeraakt hebben voordat er gescoord mag worden.",
    },
  },
  {
    key: "volleybal",
    name: "Volleybal",
    materials: [
      { name: "Volleybal", quantity: 1, unit: "stuks", optional: false },
      { name: "Net met palen", quantity: 1, unit: "sets", optional: false },
    ],
    explanation: {
      summary: "Twee teams slaan een bal over het net. De bal mag de grond niet raken aan jouw kant.",
      rules: "Verdeel de groep in twee teams, elk aan een kant van het net.\nEen team serveert door de bal over het net te slaan.\nElk team mag de bal maximaal 3 keer aanraken voordat hij over het net moet.\nDe bal mag niet op de grond komen aan jouw kant.\nPunt voor de tegenstander als de bal de grond raakt, buiten gaat, of je meer dan 3 keer raakt.\nWissel van server na elk punt. Speel tot 15 punten.",
      fieldSetup: "Markeer een veld van circa 9x9 meter (of kleiner voor jongere kinderen).\nZet het net met palen op in het midden van het veld.\nHang het net op circa 2 meter hoogte (lager voor jongere kinderen).\nLeg de bal klaar bij het serveerteam.",
      playersPerTeam: "4-6 spelers",
      duration: "10-15 minuten",
      variants: "Bal vangen en gooien in plaats van slaan (voor jongere kinderen). Of: de bal mag 1x stuiteren.",
    },
  },
  {
    key: "badminton",
    name: "Badminton",
    materials: [
      { name: "Badmintonrackets", quantity: 4, unit: "stuks", optional: false },
      { name: "Shuttles", quantity: 3, unit: "stuks", optional: false },
      { name: "Net met palen", quantity: 1, unit: "sets", optional: false },
    ],
    explanation: {
      summary: "Spelers slaan een shuttle over het net met een racket. De shuttle mag de grond niet raken aan jouw kant.",
      rules: "Speel in duo's (2 tegen 2) of enkel (1 tegen 1).\nSla de shuttle over het net met het racket.\nDe shuttle mag niet op de grond komen aan jouw kant.\nPunt als de shuttle bij de tegenstander de grond raakt of buiten gaat.\nServeer van achter de achterlijn, onderhandse slag.\nWissel van serve na elk punt. Speel tot 11 punten.",
      fieldSetup: "Markeer een veld van circa 6x13 meter (dubbel) of 5x13 meter (enkel).\nZet het net met palen op in het midden, circa 1,5 meter hoog.\nVerdeel de 4 rackets: 2 per kant.\nLeg de 3 shuttles klaar, houd reserves achter de hand (shuttles gaan snel stuk).",
      playersPerTeam: "1-2 spelers (wissel na elk potje)",
      duration: "8-10 minuten",
      variants: "Roterend: verliezer wisselt met de volgende wachtende speler. Zo speelt iedereen.",
    },
  },
  {
    key: "tafeltennis",
    name: "Tafeltennis",
    materials: [
      { name: "Tafeltennistafel", quantity: 1, unit: "stuks", optional: false },
      { name: "Batjes", quantity: 4, unit: "stuks", optional: false },
      { name: "Tafeltennisballen", quantity: 3, unit: "stuks", optional: false },
    ],
    explanation: {
      summary: "Spelers slaan een klein balletje over het net op een tafeltennistafel. Wie de bal mist, geeft een punt aan de tegenstander.",
      rules: "Speel 1 tegen 1 of 2 tegen 2 (dubbel).\nServeer door de bal eerst op je eigen helft te laten stuiteren, dan over het net.\nDe bal moet na het net 1x stuiteren op de tafel van de tegenstander.\nPunt als de tegenstander de bal mist, in het net slaat, of buiten de tafel slaat.\nWissel van serve elke 2 punten. Speel tot 11 punten.",
      fieldSetup: "Zet de tafeltennistafel neer op een vlakke ondergrond, bij voorkeur uit de wind.\nVerdeel de 4 batjes: 2 per kant.\nLeg de 3 ballen klaar bij de tafel.",
      playersPerTeam: "1-2 spelers (wissel na elk potje)",
      duration: "8-10 minuten",
      variants: "Rond-de-tafel: grote groep loopt rond de tafel en slaat om de beurt. Wie mist, is af.",
    },
  },
  {
    key: "softbal",
    name: "Softbal",
    materials: [
      { name: "Softbal", quantity: 1, unit: "stuks", optional: false },
      { name: "Knuppel", quantity: 1, unit: "stuks", optional: false },
      { name: "Handschoenen", quantity: 4, unit: "stuks", optional: true },
      { name: "Honken (set)", quantity: 1, unit: "sets", optional: false },
    ],
    explanation: {
      summary: "Een slagspel waarbij het slagteam de bal wegslaat en rondloopt langs honken om punten te scoren.",
      rules: "Verdeel in een slagteam en een veldteam.\nDe werper gooit de bal en de slagman probeert te slaan.\nNa een slag rent de slagman naar het eerste honk (en verder als het kan).\nHet veldteam probeert de bal te vangen of naar een honk te gooien om de loper af te maken.\nEen loper die veilig een heel rondje maakt, scoort een punt.\n3 keer mis (strike) of bal gevangen uit de lucht: slagman is uit.\n3 uit: teams wisselen.",
      fieldSetup: "Leg de honken (set) uit in een vierkant/diamant, circa 10-12 meter tussen elk honk.\nDe werper staat in het midden, de slagman bij het thuishonk.\nVerdeel eventueel 4 handschoenen onder het veldteam.",
      playersPerTeam: "6-10 spelers",
      duration: "15-20 minuten",
      variants: "Vereenvoudigd: de slagman mag de bal zelf opgooien en slaan. Of: iedereen slaat een keer, dan wissel je.",
    },
  },
  {
    key: "frisbee",
    name: "Frisbee",
    materials: [
      { name: "Frisbee", quantity: 2, unit: "stuks", optional: false },
      { name: "Pionnen (doelgebied)", quantity: 4, unit: "stuks", optional: false },
      { name: "Hesjes", quantity: 8, unit: "stuks", optional: false },
    ],
    explanation: {
      summary: "Twee teams gooien een frisbee naar het doelgebied van de tegenstander. Wie de frisbee vangt in het doelgebied, scoort.",
      rules: "Verdeel de groep in twee teams en geef elk team hesjes.\nJe mag niet lopen met de frisbee: sta stil en gooi over.\nDe frisbee overspelen naar teamgenoten om bij het doelgebied te komen.\nPunt als een teamgenoot de frisbee vangt in het doelgebied.\nBij een interceptie of als de frisbee op de grond valt: de tegenstander krijgt de frisbee.\nGeen lichamelijk contact.",
      fieldSetup: "Markeer aan beide uiteinden een doelgebied van circa 3x5 meter met 2 pionnen per kant (4 totaal).\nHet veld is circa 20-30 meter lang.\nLeg de 2 frisbees klaar: 1 in het spel, 1 reserve.",
      playersPerTeam: "5-8 spelers",
      duration: "10-15 minuten",
      variants: "Kleiner veld voor jongere kinderen. Of: de frisbee mag 1x op de grond komen voordat je hem opraapt.",
    },
  },
  {
    key: "atletiek",
    name: "Atletiek",
    materials: [
      { name: "Startblokken", quantity: 2, unit: "stuks", optional: true },
      { name: "Stopwatch", quantity: 1, unit: "stuks", optional: false },
      { name: "Pionnen (baanmarkering)", quantity: 8, unit: "stuks", optional: false },
    ],
    explanation: {
      summary: "Sprint- en loopwedstrijden op tijd. Wie het snelst over de finish komt, wint.",
      rules: "Deelnemers rennen per 2-4 tegelijk een afstand (bijv. 40 of 60 meter).\nStart op het fluitsignaal, meet de tijd met de stopwatch.\nHoud de tijden bij op een formulier.\nNa alle heats: vergelijk de tijden voor de eindstand.\nBij een valse start: opnieuw beginnen.\nMoedig aan, geen duw- of trekwerk.",
      fieldSetup: "Markeer een rechte baan van 40-60 meter met 8 pionnen (4 per zijde).\nZet de startlijn en finishlijn duidelijk neer.\nPlaats eventueel de 2 startblokken bij de startlijn.\nDe tijdwaarnemer staat bij de finish met de stopwatch.",
      playersPerTeam: "Individueel, 2-4 per heat",
      duration: "10-15 minuten",
      variants: "Hordeloop met lage obstakels. Of: afstandsloop (meerdere rondjes) in plaats van sprint.",
    },
  },
  {
    key: "slagbal",
    name: "Slagbal",
    materials: [
      { name: "Slagbal", quantity: 1, unit: "stuks", optional: false },
      { name: "Slagbalhout", quantity: 1, unit: "stuks", optional: false },
      { name: "Honken (set)", quantity: 1, unit: "sets", optional: false },
    ],
    explanation: {
      summary: "De slagman slaat de bal weg en rent naar de overkant. Het veldteam probeert de bal te vangen en de loper af te tikken.",
      rules: "Verdeel in een slagteam en een veldteam.\nDe slagman legt de bal op het slaghout en slaat hem het veld in.\nNa de slag rent de slagman naar de overkant (en eventueel terug voor een punt).\nHet veldteam vangt de bal en probeert de loper af te gooien (onder de knieën) of het honk te raken.\nGeraakt of honk bezet voordat je er bent: je bent af.\nAls iedereen geslagen heeft, wisselen de teams.",
      fieldSetup: "Markeer een slagplek en zet de honken (set) in een lijn of driehoek op circa 15 meter afstand.\nHet veldteam spreidt zich over het veld.\nDe slagman staat bij de slagplek met het slagbalhout en de bal.",
      playersPerTeam: "6-10 spelers",
      duration: "15-20 minuten",
      variants: "Alle lopers tegelijk laten rennen bij de laatste slagman. Of: slagbal met tennisracket en tennisbal voor jongere kinderen.",
    },
  },
  {
    key: "estafette",
    name: "Estafette",
    materials: [
      { name: "Estafettestokjes", quantity: 4, unit: "stuks", optional: false },
      { name: "Pionnen (baan/keerpunt)", quantity: 8, unit: "stuks", optional: false },
    ],
    explanation: {
      summary: "Teams rennen om het hardst in een estafette. Elke loper rent een stuk en geeft het stokje door aan de volgende.",
      rules: "Verdeel de groep in 2-4 teams, elk team in een rij achter de startlijn.\nDe eerste loper van elk team rent met het estafettestokje naar het keerpunt en terug.\nGeef het stokje over aan de volgende loper in de rij.\nDe volgende loper mag pas starten als hij/zij het stokje heeft.\nLaat het stokje niet vallen: als dat gebeurt, raap het op en ga verder.\nHet team waarvan alle lopers het eerst klaar zijn, wint.",
      fieldSetup: "Zet 4 pionnen als startlijn (1 per team/baan).\nZet 4 pionnen als keerpunt op circa 15-20 meter afstand.\nGeef elk team 1 estafettestokje.\nTeams staan in een rij achter hun startpion.",
      playersPerTeam: "4-8 spelers",
      duration: "8-10 minuten",
      variants: "Hindernisestafette: leg obstakels op het parcours. Of: achterwaarts rennen, hinkelen, of kruipen op bepaalde stukken.",
    },
  },
  {
    key: "dodgeball",
    name: "Dodgeball",
    materials: [
      { name: "Zachte ballen", quantity: 5, unit: "stuks", optional: false },
      { name: "Pionnen (middenlijn)", quantity: 4, unit: "stuks", optional: false },
    ],
    explanation: {
      summary: "Twee teams gooien zachte ballen naar elkaar. Wie geraakt wordt, is af. Het team dat als eerste alle tegenstanders heeft afgegooid, wint.",
      rules: "Verdeel de groep in twee teams, elk op een eigen helft.\nLeg de 5 ballen op de middenlijn. Op het startsignaal rennen beide teams naar het midden.\nGooi de ballen naar spelers van het andere team.\nWie geraakt wordt (onder de schouders) is af.\nVang je de bal uit de lucht, dan is de gooier af en mag er 1 teamgenoot terug het veld in.\nJe mag de middenlijn niet overschrijden.\nHet team dat alle tegenstanders af heeft, wint.",
      fieldSetup: "Markeer een rechthoekig veld van circa 10x20 meter.\nZet 4 pionnen op de middenlijn om de twee helften te scheiden.\nLeg de 5 ballen op gelijke afstand op de middenlijn.",
      playersPerTeam: "6-12 spelers",
      duration: "8-10 minuten per potje",
      variants: "Met een 'dokter': 1 speler per team mag afgegooid teamgenoten aanraken om ze terug in het spel te brengen. De dokter is geheim.",
    },
  },
  {
    key: "ringwerpen",
    name: "Ringwerpen",
    materials: [
      { name: "Ringen", quantity: 6, unit: "stuks", optional: false },
      { name: "Werpstok/paal", quantity: 1, unit: "stuks", optional: false },
    ],
    explanation: {
      summary: "Deelnemers gooien ringen naar een paal. Wie de meeste ringen om de paal gooit, wint.",
      rules: "Elke speler krijgt 3 worpen (of wissel per worp bij grote groepen).\nGooi de ringen vanaf de werplijn naar de paal.\nEen ring die om de paal belandt, telt als punt.\nRingen die naast de paal vallen, tellen niet.\nHoud de score bij per speler of per team.\nHoogste score na alle rondes wint.",
      fieldSetup: "Zet de werpstok/paal stevig neer op een vlakke ondergrond.\nMarkeer een werplijn op circa 3-5 meter afstand (dichter bij voor jongere kinderen).\nLeg de 6 ringen klaar bij de werplijn.",
      playersPerTeam: "Individueel of teams van 3-4",
      duration: "8-10 minuten",
      variants: "Verschillende afstanden voor verschillende puntwaarden. Of: blindelings gooien met hulp van een teamgenoot die aanwijzingen geeft.",
    },
  },
  {
    key: "hinkelen",
    name: "Hinkelen",
    materials: [
      { name: "Stoepkrijt", quantity: 1, unit: "sets", optional: false },
      { name: "Werpsteentje", quantity: 4, unit: "stuks", optional: true },
    ],
    explanation: {
      summary: "Deelnemers hinkelen over genummerde vakken die op de grond getekend zijn. Een klassiek schoolpleinspel.",
      rules: "Teken een hinkelbaan met stoepkrijt: 8-10 genummerde vakken.\nGooi het steentje in vak 1. Hinkel over dat vak en spring door de baan.\nEnkele vakken: op één voet. Dubbele vakken (naast elkaar): op twee voeten.\nAan het einde: draai om en hinkel terug. Raap het steentje op zonder de lijn te raken.\nLukt het? Dan gooi je het steentje in vak 2, enzovoort.\nStap je op een lijn of verlies je je evenwicht? Dan is de volgende aan de beurt.",
      fieldSetup: "Teken met stoepkrijt een hinkelbaan van 8-10 vakken op een harde ondergrond (tegels, asfalt).\nMaak afwisselend enkele en dubbele vakken.\nLeg de 4 werpsteentjes klaar bij de start.",
      playersPerTeam: "2-6 spelers (om de beurt)",
      duration: "10-15 minuten",
      variants: "Op tijd: wie het snelst de hele baan doorkomt. Of: met gesloten ogen hinkelen (met hulp van een vriend).",
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
