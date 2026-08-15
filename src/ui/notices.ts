import type { ViewName } from './nav'

/** Nur für Ansicht «Beschäftigte» relevant (Phase 2, nationale Navigation):
 *  welche der zwei Stufen gerade zu sehen ist. `'schweiz'` = 26 Kantonsbalken,
 *  `'kanton'` = die Gemeinden des betretenen Kantons (siehe
 *  `karte/beschaeftigte.ts`). */
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
// betritt den Kanton, siehe `karte/beschaeftigte.ts`, statt ein Panel zu
// öffnen) — der Verweis darauf ersetzt durch einen Verweis auf den nächsten
// Schritt.
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
// gehören zu Letzterem.
//
// Abschluss-Review, Fund 2 (2026-08-15): der damalige Wortlaut behauptete
// „nicht umgerechnet" — das Gegenteil dessen, was die Karte seit der
// Nationalisierung tut. `layers/visible.ts`s `heightValue()` nimmt
// `company.revenueChf ?? company.revenue`, und `companies.json`s
// `stats.revenueInChf` bestätigt es: die Säulenhöhe rechnet in CHF um, das
// Panel zeigt weiterhin die berichtete Zahl im Original (`ui/panel.ts`,
// `companyContent`, `company.revenue`/`company.currency` — unverändert).
//
// Re-Review (2026-08-15), zwei Nachbesserungen an diesem ersten Fix:
//
// 1. „SNB-Jahresmittelkurs des Geschäftsjahres" war selbst zu präzise.
//    `etl/src/zeigmers_etl/fx.py` (`rate()`, Zeilen 103–129) mittelt NICHT
//    einheitlich über das Geschäftsjahr: ein abgeschlossenes Kalenderjahr
//    (`window: "kalenderjahr"`) bekommt dessen zwölf Monatsmittelkurse, ein
//    noch nicht abgeschlossenes (`window: "rollend"`, im aktuellen Artefakt
//    z. B. EUR/2026, USD/2026) die letzten verfügbaren Monate — laut
//    `fx.py`s eigener Dokumentation (Zeilen 32–36) selbst „eine Näherung:
//    exakt wäre das Fenster April bis März". Beide Fenster im Wortlaut
//    genannt, statt nur des einen, das gerade nicht zutrifft.
// 2. `stats.revenueInChf` wird nur `true`, wenn JEDE Säule umgerechnet
//    werden konnte (`companies.py`, `build_artifact`, Zeile 617) — bleibt
//    eine Umrechnung offen, fällt die Ansicht laut `layers/visible.ts`
//    (Zeilen 91–95) auf die Berichtswährungen zurück. Der Satz war fest auf
//    „in CHF umgerechnet" formuliert, ohne diese Möglichkeit vorzusehen —
//    dieselbe Regel aus Fund 1 (keine Zahl/Zusicherung hartkodieren, die
//    veralten kann) gilt hier für ein Flag statt einer Zahl. `currencyNote()`
//    unten liest deshalb `stats.revenueInChf` zur Laufzeit; `renderNotices`
//    bekommt dafür einen weiteren Pflichtparameter (siehe dort).
const CURRENCY_NOTE_CHF =
  'Balkenhöhe: Umsatz in CHF umgerechnet (SNB-Monatsmittelkurse, gemittelt ' +
  'über das Kalenderjahr oder — ist dieses noch nicht abgeschlossen — die ' +
  'letzten verfügbaren Monate) — das Panel zeigt weiterhin die berichtete ' +
  'Zahl in der jeweiligen Konzernwährung (CHF, EUR, USD).'

// Seltener Fall (`stats.revenueInChf === false`): mindestens eine Firma
// blieb ohne SNB-Kurs (fehlende Reihe, Geschäftsjahr ausserhalb der Daten,
// siehe `fx.py`, `rate()`). Keine CHF-Zusicherung mehr, aber auch keine
// falsche „nicht umgerechnet"-Aussage wie im ursprünglichen Fund 2 — nur so
// viel, wie für jeden Einzelfall stimmt.
const CURRENCY_NOTE_FALLBACK =
  'Umsätze in der jeweiligen Konzernwährung (CHF, EUR, USD) — für einzelne ' +
  'Firmen fehlt die Umrechnung nach CHF, deshalb zeigt die Balkenhöhe hier ' +
  'ausnahmsweise ebenfalls den berichteten statt eines einheitlich ' +
  'umgerechneten Betrags.'

function currencyNote(revenueInChf: boolean): string {
  return revenueInChf ? CURRENCY_NOTE_CHF : CURRENCY_NOTE_FALLBACK
}

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

// Zweite Quellenzeile, nur in Ansicht «Börsennotierte Firmen»: die Fixzeile
// oben nennt STATENT und swisstopo, aber keine Zahl in dieser Ansicht stammt
// aus einer dieser Quellen, sondern aus den Geschäftsberichten der
// recherchierten Firmen selbst (siehe `report_url` je Firma im Panel). Ohne
// diese Zeile schriebe die Box diese Zahlen implizit dem BFS zu
// (Abschluss-Review, Finding I7).
//
// Fix-Runde (2026-08-15, Abschluss-Review Fund 1): der Wortlaut nannte bisher
// „acht Unternehmen" — mit der Nationalisierung (Phase 3) sind es 201
// recherchierte, und die Zahl steht bereits, aus `companies.json` berechnet,
// in der Legende direkt daneben (`karte/firmen.ts`, `coverageLabel`); eine
// zweite, hier hartkodierte Zahl würde bei jedem künftigen Recherche-Lauf neu
// veralten können, ohne dass etwas rot würde. Der Satz nennt deshalb keine
// Zahl mehr. „Ansicht A:" ist ebenfalls entfallen — das Label ist seit der
// Aufteilung in drei benannte Seiten (`/`, `/firmen/`, `/beschaeftigte/`) tot,
// es gibt kein A/B mehr in der Oberfläche.
const FOOTER_COMPANIES =
  'Börsennotierte Firmen: Umsatz, Mitarbeitende und Geschäftsjahr aus den ' +
  'Geschäftsberichten der recherchierten Firmen selbst (Quelle je Firma im ' +
  'Panel, «Geschäftsbericht öffnen»).'

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
 *  Pflichtparameter statt optional: ein Seiteneinstieg (`karte/firmen.ts`,
 *  `karte/beschaeftigte.ts`), der ihn vergisst, soll ein Typfehler sein,
 *  kein still falscher Text zur Laufzeit.
 *
 *  `revenueInChf` (Re-Review, 2026-08-15, dieselbe Begründung wie `level`):
 *  nur bei `view === 'sichtbare'` gelesen — `companies.json`s
 *  `stats.revenueInChf`, entscheidet zwischen `CURRENCY_NOTE_CHF` und
 *  `CURRENCY_NOTE_FALLBACK` (siehe dort). Bei `view === 'beschaeftigte'`
 *  bedeutungslos, aber ebenfalls Pflichtparameter statt optional — aus
 *  demselben Grund wie bei `level`. */
export function renderNotices(view: ViewName, level: NoticeLevel, revenueInChf: boolean): void {
  let box = document.getElementById('hinweis')
  if (!box) {
    box = document.createElement('div')
    box.id = 'hinweis'
    document.getElementById('ui')?.appendChild(box)
  }
  box.replaceChildren()
  const haupt = view === 'sichtbare' ? HAUPT_SICHTBARE : HAUPT_BESCHAEFTIGTE[level]
  box.appendChild(paragraph(haupt, 'hinweis-haupt'))
  if (view === 'sichtbare') box.appendChild(paragraph(currencyNote(revenueInChf), 'hinweis-haupt'))
  box.appendChild(paragraph(FOOTER, 'hinweis-quelle'))
  // Unabhängig von der Ansicht: der Skalenschalter (und damit die Formel, um
  // die es hier geht) ist in beiden Ansichten sichtbar und bedienbar, nicht
  // nur in Ansicht B.
  box.appendChild(paragraph(SCALE_NOTE, 'hinweis-quelle'))
  if (view === 'sichtbare') box.appendChild(paragraph(FOOTER_COMPANIES, 'hinweis-quelle'))
  // Nur auf der Kantonsstufe: die «Beschäftigte je Einwohner»-Zeile, die
  // dieser Hinweis erklärt, steht ausschliesslich im Gemeinde-Klick-Panel
  // (`ui/panel.ts`) — auf der Schweiz-Stufe öffnet ein Klick keinen Panel
  // (er betritt den Kanton, siehe `karte/beschaeftigte.ts`), die Zeile
  // erscheint dort nie.
  if (view === 'beschaeftigte' && level === 'kanton') {
    box.appendChild(paragraph(POPULATION_YEAR_NOTE, 'hinweis-quelle'))
  }
}
