import type { ViewName } from './nav'

/** Nur für Ansicht «Beschäftigte» relevant (Phase 2, nationale Navigation):
 *  welche der zwei Stufen gerade zu sehen ist. `'schweiz'` = 26 Kantonsbalken,
 *  `'kanton'` = die Gemeinden des betretenen Kantons (siehe `main.ts`). */
export type NoticeLevel = 'schweiz' | 'kanton'

/** Pflichthinweis je Ansicht — muss ohne Interaktion sichtbar bleiben (siehe
 *  `style.css`, `#hinweis`); das ist eine Spezifikationsvorgabe, kein
 *  Stilentscheid. Redesign (2026-08-14, Change 1): der Text ist gestrafft,
 *  damit er in eine kleine, ruhige Eckbox passt statt in ein dominantes
 *  Banner — die «< 4 → 4»-Rundung und der Flächenverzerrungs-Hinweis (Höhe
 *  vs. Grundfläche) bleiben dabei erhalten. Vorheriger, längerer Wortlaut:
 *  siehe Git-Historie bzw. Redesign-Report (`.superpowers/redesign-report.md`),
 *  Abschnitt „Pflichthinweis vorher/nachher".
 *
 *  Phase 2 (2026-08-14, nationale Navigation): der Satz nannte bis dahin eine
 *  Median-/Maximum-Überschätzung («im Schnitt um rund ein Sechstel, in
 *  kleinen Gemeinden bis zur Hälfte») — zwei Zahlen, die spezifisch für
 *  Aargaus Gemeinden gemessen wurden (siehe Auftrag), nicht für die anderen
 *  25 Kantone oder deren Summe. Mit der neuen Kantonsstufe und beliebigen
 *  Kantonen auf der Gemeindestufe gäbe es dafür keine gemessene Entsprechung
 *  mehr — die zwei Zahlen unbesehen weiterzuzeigen würde sie stillschweigend
 *  als gesamtschweizerisch ausgeben, was sie nicht sind. Der Mechanismus
 *  (Rundung auf 4, deshalb tendenziell zu hohe Summen) bleibt wörtlich
 *  erhalten; die zwei Zahlen sind ersatzlos entfernt, nicht durch neue
 *  ersetzt (siehe Bericht, Abschnitt „Notices" — Datengrundlage fehlt für
 *  eine ehrliche Herleitung ohne ETL-Änderung). Beide Stufen bekommen
 *  stattdessen je einen eigenen, flächenrichtigen Fassungssatz
 *  (`ROUNDING_KANTON`/`ROUNDING_SCHWEIZ` unten) statt eines gemeinsamen. */
const ROUNDING_MECHANISM =
  'Für sehr kleine Betriebe veröffentlicht das BFS keine genauen Zahlen — ' +
  'alles unter 4 Beschäftigten wird als 4 ausgewiesen.'

const ROUNDING_KANTON =
  `${ROUNDING_MECHANISM} Die Gemeindesummen hier sind deshalb etwas zu hoch, ` +
  'in unterschiedlichem Ausmass. Genauer Betrag je Gemeinde: Klick-Panel.'

// Kein Klick-Panel auf dieser Stufe (ein Klick auf einen Kantonsbalken
// betritt den Kanton, siehe `main.ts`, statt ein Panel zu öffnen) — der
// Verweis darauf ersetzt durch einen Verweis auf den nächsten Schritt.
const ROUNDING_SCHWEIZ =
  `${ROUNDING_MECHANISM} Die Kantonssummen hier sind deshalb ebenfalls etwas ` +
  'zu hoch, je nach Kanton unterschiedlich stark. Details je Gemeinde: nach ' +
  'Klick auf einen Kanton.'

const AREA_NOTE_KANTON =
  'Höhe = Beschäftigte, Grundfläche = Gemeindefläche — grosse Gemeinden ' +
  'wirken dadurch gewichtiger, als sie sind.'
const AREA_NOTE_SCHWEIZ =
  'Höhe = Beschäftigte, Grundfläche = Kantonsfläche — grosse Kantone wirken ' +
  'dadurch gewichtiger, als sie sind.'

const HAUPT_BESCHAEFTIGTE: Record<NoticeLevel, string> = {
  kanton: `${ROUNDING_KANTON} ${AREA_NOTE_KANTON}`,
  schweiz: `${ROUNDING_SCHWEIZ} ${AREA_NOTE_SCHWEIZ}`,
}

// Der frühere zweite Satz zur Währungsvermischung ist entfallen: dieselbe
// Aussage steht jetzt, wortgleich mit der Legende zuvor, in `CURRENCY_NOTE`
// direkt darunter — zwei Sätze für dieselbe Tatsache in derselben Box wären
// in einer bewusst ruhigen Ecke Redundanz, keine zusätzliche Information.
const HAUPT_SICHTBARE =
  'Dargestellt ist der weltweite Konzernumsatz, nicht die Wertschöpfung am Standort.'

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

// Redesign Change 5 (2026-08-14): der Skalenschalter (`ui/nav.ts`) und die
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
 *  Textstufe (`.hinweis-quelle` in style.css).
 *
 *  `level` (Phase 2): nur bei `view === 'beschaeftigte'` gelesen — welche der
 *  zwei Stufen den passenden Rundungs-/Flächenhinweis braucht (siehe
 *  `HAUPT_BESCHAEFTIGTE` oben). Bei `view === 'sichtbare'` bedeutungslos, aber
 *  Pflichtparameter statt optional: ein main.ts, das ihn vergisst, soll ein
 *  Typfehler sein, kein still falscher Text zur Laufzeit. */
export function renderNotices(view: ViewName, level: NoticeLevel): void {
  let box = document.getElementById('hinweis')
  if (!box) {
    box = document.createElement('div')
    box.id = 'hinweis'
    document.getElementById('ui')?.appendChild(box)
  }
  box.replaceChildren()
  const haupt = view === 'sichtbare' ? HAUPT_SICHTBARE : HAUPT_BESCHAEFTIGTE[level]
  box.appendChild(paragraph(haupt, 'hinweis-haupt'))
  if (view === 'sichtbare') box.appendChild(paragraph(CURRENCY_NOTE, 'hinweis-haupt'))
  box.appendChild(paragraph(FOOTER, 'hinweis-quelle'))
  // Unabhängig von der Ansicht: der Skalenschalter (und damit die Formel, um
  // die es hier geht) ist in beiden Ansichten sichtbar und bedienbar, nicht
  // nur in Ansicht B.
  box.appendChild(paragraph(SCALE_NOTE, 'hinweis-quelle'))
  if (view === 'sichtbare') box.appendChild(paragraph(FOOTER_COMPANIES, 'hinweis-quelle'))
  // Nur auf der Kantonsstufe: die «Beschäftigte je Einwohner»-Zeile, die
  // dieser Hinweis erklärt, steht ausschliesslich im Gemeinde-Klick-Panel
  // (`ui/panel.ts`) — auf der Schweiz-Stufe öffnet ein Klick keinen Panel
  // (er betritt den Kanton, siehe `main.ts`), die Zeile erscheint dort nie.
  if (view === 'beschaeftigte' && level === 'kanton') {
    box.appendChild(paragraph(POPULATION_YEAR_NOTE, 'hinweis-quelle'))
  }
}
