import type { ViewName } from './toggle'

/** Pflichthinweis je Ansicht — muss ohne Interaktion sichtbar bleiben (siehe
 *  `style.css`, `#hinweis`); das ist eine Spezifikationsvorgabe, kein
 *  Stilentscheid. Redesign (2026-08-14, Change 1): der Text ist gestrafft,
 *  damit er in eine kleine, ruhige Eckbox passt statt in ein dominantes
 *  Banner — vier inhaltliche Aussagen bleiben in Ansicht B dabei unverändert
 *  erhalten: die «< 4 → 4»-Rundung, die Median-/Maximum-Überschätzung, der
 *  Verweis aufs Klick-Panel für den exakten Betrag je Gemeinde, und der
 *  Flächenverzerrungs-Hinweis (Höhe vs. Grundfläche). Vorheriger, längerer
 *  Wortlaut: siehe Git-Historie bzw. Redesign-Report (`.superpowers/
 *  redesign-report.md`), Abschnitt „Pflichthinweis vorher/nachher". Der erste
 *  Satz von `beschaeftigte` wurde am selben Tag (Change 4) noch einmal
 *  umformuliert — Statistik-Jargon durch Alltagssprache ersetzt, siehe
 *  Kommentar direkt darüber; die drei übrigen Sätze sind seit Change 1
 *  unverändert. */
const HAUPT: Record<ViewName, string> = {
  // Der frühere zweite Satz zur Währungsvermischung ist entfallen: dieselbe
  // Aussage steht jetzt, wortgleich mit der Legende zuvor, in `CURRENCY_NOTE`
  // direkt darunter — zwei Sätze für dieselbe Tatsache in derselben Box
  // wären in einer bewusst ruhigen Ecke Redundanz, keine zusätzliche
  // Information.
  sichtbare:
    'Dargestellt ist der weltweite Konzernumsatz, nicht die Wertschöpfung am Standort.',
  // Redesign Change 4 (2026-08-14): der erste Satz stand vorher als
  // «BFS rundet Werte unter 4 auf 4 auf — Gemeindesummen sind Obergrenzen
  // (Median +16 %, einzelne Gemeinden bis +54 %)» — korrekt, aber in
  // Statistik-Jargon («rundet auf», «Obergrenzen», zwei nackte
  // Prozentzahlen), der erklärt, was passiert, aber nicht, was es für die
  // Leserin bedeutet. Der neue Satz sagt dieselbe Sache in Alltagssprache:
  // das BFS veröffentlicht für sehr kleine Betriebe keine genauen Zahlen
  // (der eigentliche Grund für die Rundung), und die beiden Zahlen bleiben
  // erhalten — nur als Bruchteil statt als Prozentzahl, näher an der
  // Grössenordnung, die eine Leserin sich vorstellen kann. Die übrigen drei
  // Sätze (Verweis aufs Klick-Panel, Höhe/Fläche-Verzerrung) sind wörtlich
  // unverändert.
  beschaeftigte:
    'Für sehr kleine Betriebe veröffentlicht das BFS keine genauen Zahlen — ' +
    'alles unter 4 Beschäftigten wird als 4 ausgewiesen. Die Gemeindesummen ' +
    'hier sind deshalb etwas zu hoch: im Schnitt um rund ein Sechstel, in ' +
    'kleinen Gemeinden bis zur Hälfte. Genauer Betrag je Gemeinde: ' +
    'Klick-Panel. Höhe = Beschäftigte, Grundfläche = Gemeindefläche — grosse ' +
    'Gemeinden wirken dadurch gewichtiger, als sie sind.',
}

// Verschoben aus `ui/legend.ts` (Redesign Change 2/3, siehe `ui/legend.ts`
// für die Begründung): „die Legende trägt, was man zum Lesen braucht, die
// Eckbox, was man zum Vertrauen braucht" — Quellen- und Währungsangabe
// gehören zu Letzterem. Wörtlicher Inhalt unverändert, nur der Ort.
const CURRENCY_NOTE =
  'Umsätze in der jeweiligen Konzernwährung (CHF, EUR, USD), nicht umgerechnet.'

// Lizenzpflichtig (STATENT: „Freie Nutzung, Quellenangabe Pflicht"; swisstopo-
// Geodaten: Nutzungsbedingungen für kostenlose Geodaten, siehe README) —
// wörtlich und permanent sichtbar, unabhängig von jeder Nutzerinteraktion.
// Wird verschoben, nicht gekürzt.
const FOOTER =
  'Quelle: Bundesamt für Statistik (BFS), Statistik der Unternehmensstruktur (STATENT) 2023 · ' +
  'Gemeindegrenzen: swisstopo, swissBOUNDARIES3D · Basiskarte: swisstopo'

// Redesign Change 5 (2026-08-14): der Skalenschalter (`ui/toggle.ts`) und die
// Legende nennen den Modus wieder «logarithmisch» — der vertraute Name aus
// jeder anderen Kartenanwendung, an der Stelle, an der Nutzende navigieren,
// nicht behaupten. Die Formel dahinter ist unverändert eine Potenzskala
// (`(v/vmax)**0,4`, siehe `domain/scale.ts`), keine echte Logarithmusfunktion
// — eine an dieselbe Kurve gefittete echte Logarithmusskala drückt die
// kleinste Gemeinde auf rund 81 statt 256 Meter, praktisch flach. Diese Box
// trägt bereits Quelle, Lizenz und Vorbehalte; sie ist die Stelle, an der
// eine Behauptung nachprüfbar sein muss, nicht der Button selbst.
const SCALE_NOTE =
  'Höhenskala «logarithmisch»: rechnerisch eine Potenzfunktion mit Exponent ' +
  '0,4, keine echte Logarithmusfunktion.'

// Zweite Quellenzeile, nur in Ansicht A: die Fixzeile oben nennt STATENT und
// swisstopo, aber jede Zahl in Ansicht A stammt aus keiner dieser Quellen,
// sondern aus den Geschäftsberichten der acht Unternehmen selbst (siehe
// `report_url` je Firma im Panel). Ohne diese Zeile schriebe die Box
// Ansicht-A-Zahlen implizit dem BFS zu (Abschluss-Review, Finding I7).
const FOOTER_COMPANIES =
  'Ansicht A: Umsatz, Mitarbeitende und Geschäftsjahr aus den Geschäftsberichten der ' +
  'acht Unternehmen selbst (Quelle je Firma im Panel, «Geschäftsbericht öffnen»).'

// Redesign Change 2 (2026-08-15): vorher stand dieser Jahrgangs-Hinweis direkt
// neben der «Beschäftigte je Einwohner»-Zeile im Klick-Panel
// (`ui/panel.ts`), wortgleich bei jeder angeklickten Gemeinde wiederholt.
// Er gehört inhaltlich zu denselben Vorbehalten, die sonst schon hier stehen
// (Quelle, Lizenz, Rundung) — deshalb einmalig hierher verschoben statt
// gelöscht: ohne ihn irgendwo läse sich die Kennzahl als Verhältnis zweier
// Zahlen desselben Jahres, was sie nicht ist (Bevölkerung 31.12.2024,
// Beschäftigte 2023).
const POPULATION_YEAR_NOTE =
  'Die Kennzahl «Beschäftigte je Einwohner» im Klick-Panel vergleicht zwei ' +
  'Jahrgänge: Bevölkerung 31.12.2024, Beschäftigte 2023.'

function paragraph(text: string, className: string): HTMLParagraphElement {
  const p = document.createElement('p')
  p.className = className
  p.textContent = text
  return p
}

/** Baut die Eckbox aus mehreren Absätzen statt eines einzelnen `textContent`
 *  (bis 2026-08-13 genügte ein String, weil hier nur der Pflichthinweis
 *  stand) — seit Change 2/3 trägt dieselbe Box zusätzlich die aus der
 *  Legende verschobene Quellen- und Währungszeile, mit eigener, leiserer
 *  Textstufe (`.hinweis-quelle` in style.css). */
export function renderNotices(view: ViewName): void {
  let box = document.getElementById('hinweis')
  if (!box) {
    box = document.createElement('div')
    box.id = 'hinweis'
    document.getElementById('ui')?.appendChild(box)
  }
  box.replaceChildren()
  box.appendChild(paragraph(HAUPT[view], 'hinweis-haupt'))
  if (view === 'sichtbare') box.appendChild(paragraph(CURRENCY_NOTE, 'hinweis-haupt'))
  box.appendChild(paragraph(FOOTER, 'hinweis-quelle'))
  // Unabhängig von der Ansicht: der Skalenschalter (und damit die Formel, um
  // die es hier geht) ist in beiden Ansichten sichtbar und bedienbar, nicht
  // nur in Ansicht B.
  box.appendChild(paragraph(SCALE_NOTE, 'hinweis-quelle'))
  if (view === 'sichtbare') box.appendChild(paragraph(FOOTER_COMPANIES, 'hinweis-quelle'))
  if (view === 'beschaeftigte') box.appendChild(paragraph(POPULATION_YEAR_NOTE, 'hinweis-quelle'))
}
