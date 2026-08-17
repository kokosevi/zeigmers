import { formatMetric, type Metric } from '../domain/metric'
import { formatGermanDate } from './format'
import type { ViewName } from './nav'
import { fussTeil } from './leiste'

/** Nur für Ansicht «Beschäftigte» relevant (Phase 2, nationale Navigation):
 *  welche der zwei Stufen gerade zu sehen ist. `'schweiz'` = 26 Kantonsbalken,
 *  `'kanton'` = die Gemeinden des betretenen Kantons (siehe
 *  `karte/beschaeftigte.ts`). */
export type NoticeLevel = 'schweiz' | 'kanton'

/** Pflichthinweis je Ansicht.
 *
 *  Bis zum 17. August 2026 galt hier wörtlich: die Box muss ohne Interaktion
 *  sichtbar bleiben — eine Spezifikationsvorgabe, kein Stilentscheid, deshalb
 *  hatte `#hinweis` bis dahin keinen Umschalter, anders als `#panel` (siehe
 *  `style.css`). An diesem Datum wollte der Auftraggeber stattdessen eine
 *  zuklappbare Box: im Ausgangszustand eingeklappt, sichtbar nur ein kleiner
 *  runder Info-Umschalter («i»), ein Klick blendet den Text ein, ein
 *  weiterer wieder aus (siehe `renderNotices` unten). Das hebt die frühere
 *  Vorgabe nicht auf, sie verschiebt sie: der Inhalt bleibt auf jeder Ansicht
 *  erreichbar, nur eben einen Klick entfernt statt ständig im Bild —
 *  „erreichbar" statt „permanent sichtbar" ist die neue Lesart von
 *  „ohne Interaktion sichtbar bleiben" für einen Pflichthinweis mit
 *  Lizenz-/Quellenangaben (siehe `FOOTER` unten).
 *
 *  Redesign (2026-08-14, Change 1): der Text ist gestrafft, damit er in eine
 *  kleine, ruhige Eckbox passt statt in ein dominantes Banner — die
 *  «< 4 → 4»-Rundung und der Flächenverzerrungs-Hinweis (Höhe vs.
 *  Grundfläche) bleiben dabei erhalten. Vorheriger, längerer Wortlaut: siehe
 *  Git-Historie bzw. Redesign-Report (`.superpowers/redesign-report.md`),
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
// Aussage steht jetzt, wortgleich mit der Legende zuvor, in `currencyNote()`
// direkt darunter — zwei Sätze für dieselbe Tatsache in derselben Box wären
// in einer bewusst ruhigen Ecke Redundanz, keine zusätzliche Information.
//
// Fix-Runde (2026-08-16, Abschluss-Review C1): bis dahin ein einzelner,
// hartkodiert auf Umsatz formulierter String, unabhängig davon, welche der
// drei Kennzahlen (Task 18: Umsatz/Mitarbeitende/Reingewinn) gerade die
// Säulenhöhe trägt — über einer Mitarbeitenden- oder Gewinn-Karte stand
// weiterhin „Dargestellt ist der weltweite Konzernumsatz …", eine Aussage
// über eine Grösse, die die Karte in diesem Moment gar nicht zeigt. Das ist
// genau die Box, die laut Projektgrundsatz „trägt, was man zum Vertrauen
// braucht" — sie muss deshalb der AKTIVEN Kennzahl folgen, wie
// `ui/legend.ts`s Titelzeile das für `metricLabel(metric)` bereits tut.
// `renderNotices` bekommt die Kennzahl dafür als weiteren Pflichtparameter
// (siehe dort), keyed als `Record<Metric, string>` statt einer
// `if`-Kaskade, im selben Stil wie `UNIT_LABEL` in `ui/legend.ts`.
const HAUPT_SICHTBARE: Record<Metric, string> = {
  umsatz: 'Dargestellt ist der weltweite Konzernumsatz, nicht die Wertschöpfung am Standort.',
  mitarbeitende:
    'Dargestellt ist die Mitarbeitendenzahl des gesamten Konzerns weltweit, nicht die ' +
    'Beschäftigung am Standort.',
  gewinn:
    'Dargestellt ist der weltweite Konzern-Reingewinn (auf die Aktionäre entfallend), nicht ' +
    'die Wertschöpfung am Standort.',
}

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
//
// Fix-Runde (2026-08-16, Abschluss-Review C1/I6): beide Texte waren fest auf
// „Umsatz" formuliert, unabhängig von der aktiven Kennzahl — bei Kennzahl
// Gewinn stand hier weiterhin eine Aussage über den Umsatz, obwohl die
// Balkenhöhe den Reingewinn zeigt, und das Flag kam ausserdem IMMER aus
// `stats.revenueInChf`, selbst wenn `stats.profitInChf` (vom ETL längst
// geschrieben, siehe `companies.py`, `build_artifact`) die eigentlich
// zutreffende Vollständigkeitsmeldung gewesen wäre — der Reingewinn hat eine
// eigene Alles-oder-nichts-Regel, unabhängig von der des Umsatzes (dieselbe
// Firma kann beim Umsatz vollständig umgerechnet sein und beim Gewinn nicht,
// oder umgekehrt). Beide Konstanten sind deshalb `Record<'umsatz' |
// 'gewinn', string>` geworden; `currencyNote()` liest die Kennzahl, um
// zwischen ihnen zu wählen. Bei Kennzahl Mitarbeitende ist die Höhe eine
// Personenzahl ohne Währung — dort gibt es gar keine Währungszeile,
// `currencyNote()` liefert `null` und `renderNotices` hängt dann keinen
// Absatz an.
const CURRENCY_NOTE_CHF: Record<'umsatz' | 'gewinn', string> = {
  umsatz:
    'Balkenhöhe: Umsatz in CHF umgerechnet (SNB-Monatsmittelkurse, gemittelt ' +
    'über das Kalenderjahr oder — ist dieses noch nicht abgeschlossen — die ' +
    'letzten verfügbaren Monate) — das Panel zeigt weiterhin die berichtete ' +
    'Zahl in der jeweiligen Konzernwährung (CHF, EUR, USD).',
  gewinn:
    'Balkenhöhe: Reingewinn in CHF umgerechnet (SNB-Monatsmittelkurse, ' +
    'gemittelt über das Kalenderjahr oder — ist dieses noch nicht ' +
    'abgeschlossen — die letzten verfügbaren Monate) — das Panel zeigt ' +
    'weiterhin die berichtete Zahl in der jeweiligen Konzernwährung (CHF, ' +
    'EUR, USD).',
}

// Seltener Fall (`stats.revenueInChf`/`stats.profitInChf === false`):
// mindestens eine Firma blieb ohne SNB-Kurs (fehlende Reihe, Geschäftsjahr
// ausserhalb der Daten, siehe `fx.py`, `rate()`). Keine CHF-Zusicherung mehr,
// aber auch keine falsche „nicht umgerechnet"-Aussage wie im ursprünglichen
// Fund 2 — nur so viel, wie für jeden Einzelfall stimmt.
const CURRENCY_NOTE_FALLBACK: Record<'umsatz' | 'gewinn', string> = {
  umsatz:
    'Umsätze in der jeweiligen Konzernwährung (CHF, EUR, USD) — für ' +
    'einzelne Firmen fehlt die Umrechnung nach CHF, deshalb zeigt die ' +
    'Balkenhöhe hier ausnahmsweise ebenfalls den berichteten statt eines ' +
    'einheitlich umgerechneten Betrags.',
  gewinn:
    'Reingewinne in der jeweiligen Konzernwährung (CHF, EUR, USD) — für ' +
    'einzelne Firmen fehlt die Umrechnung nach CHF, deshalb zeigt die ' +
    'Balkenhöhe hier ausnahmsweise ebenfalls den berichteten statt eines ' +
    'einheitlich umgerechneten Betrags.',
}

/** Währungszeile für Umsatz/Gewinn, `null` bei Mitarbeitende (keine
 *  Währung, siehe Kommentar oben bei `CURRENCY_NOTE_CHF`). `metricInChf`
 *  ist bei Umsatz `stats.revenueInChf`, bei Gewinn `stats.profitInChf` —
 *  welches der beiden Flags gilt, entscheidet die Aufrufstelle
 *  (`karte/firmen.ts`), nicht diese Funktion. */
function currencyNote(metric: Metric, metricInChf: boolean): string | null {
  if (metric !== 'umsatz' && metric !== 'gewinn') return null
  return metricInChf ? CURRENCY_NOTE_CHF[metric] : CURRENCY_NOTE_FALLBACK[metric]
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
// recherchierte, und dieselbe aus `companies.json` berechnete Zahl steht
// bereits auf der Landing (`index.html`, von `src/landing.test.ts` geprüft)
// und, seit der Korrektur vom 2026-08-17, in derselben Box direkt darüber
// (`coverageNote()` oben); eine zweite, hier hartkodierte Zahl würde bei
// jedem künftigen Recherche-Lauf neu veralten können, ohne dass etwas rot
// würde. Der Satz nennt deshalb keine Zahl mehr. „Ansicht A:" ist ebenfalls
// entfallen — das Label ist seit der Aufteilung in drei benannte Seiten
// (`/`, `/firmen/`, `/beschaeftigte/`) tot, es gibt kein A/B mehr in der
// Oberfläche.
//
// Kleinigkeit (2026-08-16, Abschluss-Review): der Satz nannte «Umsatz,
// Mitarbeitende und Geschäftsjahr» — seit Task 18 (Kennzahl-Verdrahtung)
// trägt auch der Reingewinn eine Höhenachse und stammt aus derselben Quelle
// (Geschäftsbericht), fehlte hier aber.
const FOOTER_COMPANIES =
  'Börsennotierte Firmen: Umsatz, Mitarbeitende, Reingewinn und Geschäftsjahr aus den ' +
  'Geschäftsberichten der recherchierten Firmen selbst (Quelle je Firma im ' +
  'Panel, «Geschäftsbericht öffnen»).'

// Task 10 (Seenlayer, `layers/lakes.ts`): die Seeflächen sind teilweise die
// einzige Quelle dieser Karte, die nicht von BFS oder swisstopo stammt —
// `FOOTER` oben nennt sie deshalb nicht, eine eigene Zeile ist nötig, sonst
// schriebe die Box sie stillschweigend swisstopo zu. Zweiter Satz hält fest,
// was fehlt, statt es zu beschweigen: vier grosse Seen tauchen auf der Karte
// nicht als eigene Fläche auf, weil sowohl swisstopo (Gemeindeflächen) als
// auch Natural Earth (dieses Artefakt) sie in die umliegenden
// Gemeindeflächen einschliessen statt sie auszusparen.
//
// Korrektur (2026-08-16): stand anfangs unter denselben `view ===
// 'sichtbare'`-Bedingungen wie `FOOTER_COMPANIES`/`CURRENCY_NOTE` — falsch,
// denn der Seenlayer selbst zeichnet auf BEIDEN Kartenseiten
// (`layers/viewLayers.ts`, `buildViewLayers`). Eine Quelle zu nennen ist
// eine Eigenschaft der gezeigten Daten, nicht der Ansicht: die
// Beschäftigten-Seite hätte sonst Seeflächen gezeigt, ohne ihre Quelle zu
// nennen. `renderNotices` unten hängt diese Zeile deshalb bedingungslos an,
// direkt neben `FOOTER` (der anderen Quellenzeile), nicht unter den
// ansichtsspezifischen Vorbehalten.
//
// Zweite Korrektur (Abschluss-Review, Finding C3): der Satz schrieb bis
// dahin ALLE zehn Seepolygone Natural Earth zu — tatsächlich liefert Natural
// Earth nur vier (Genfersee, Bodensee, ein unbenanntes Untersee-Teilbecken,
// Lago Maggiore), die übrigen sechs (Zürichsee, Lac de Neuchâtel, Bielersee,
// Thunersee, Brienzersee, Greifensee) stammen aus swissBOUNDARIES3D — also
// von swisstopo, amtlich. Der zweite Satz verriet den Fehler bereits selbst
// ("in beiden Quellen", nachdem nur eine genannt worden war). Beide
// Aussagen bestehen jetzt nebeneinander: Natural Earth bleibt namentlich die
// einzige NICHT-amtliche Quelle, swissBOUNDARIES3D liefert den Rest amtlich
// (siehe `etl/src/zeigmers_etl/lakes.py`, Moduldocstring, für die Aufteilung
// im Detail).
const FOOTER_LAKES =
  'Seeflächen: Natural Earth (10m lakes; Genfersee, Bodensee, Lago Maggiore) ' +
  'und swissBOUNDARIES3D (Zürichsee, Lac de Neuchâtel, Bielersee, ' +
  'Thunersee, Brienzersee, Greifensee) — Natural Earth ist davon die ' +
  'einzige nicht-amtliche Quelle dieser Karte, generalisierte Umrisse. ' +
  'Vierwaldstättersee, Zugersee, Walensee und Lago di Lugano fehlen: Sie ' +
  'stecken in beiden Quellen in den Gemeindeflächen.'

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

// Fünf Zeilen, umgezogen aus `ui/legend.ts` (Auftrag, 2026-08-17 — siehe dort
// den Kommentar bei `LegendOptions` für die vollständige Begründung des
// Kahlschlags, aus dem sie stammen). Leitsatz seit Redesign Change 2/3: „die
// Legende trägt, was man zum Lesen braucht, die Eckbox, was man zum
// Vertrauen braucht" — alle fünf tragen eine Aussage, ohne die die Karte
// etwas behauptet, das sie nicht einlöst, und gehören deshalb hierher statt
// ersatzlos zu verschwinden. Nur in Ansicht «Börsennotierte Firmen» gelesen
// (`renderNotices` unten) — dieselbe Bedingung wie bei `FOOTER_COMPANIES`.

/** Abdeckungsangabe — ZWEI Zahlen, nicht nur eine: „201 recherchiert" allein
 *  wäre unvollständig, wer die Marker auf der Karte zählt, sieht `count`
 *  (platziert, inkl. der unrecherchierten Marker), nicht `totalListed` — ein
 *  SIX-Titel ohne eindeutigen Zefix-Sitz erscheint gar nicht auf der Karte
 *  (siehe `companies.build_artifact`). Ohne diese Zeile liesse sich aus der
 *  Karte selbst nicht ablesen, dass ein Teil der kotierten Titel überhaupt
 *  nicht erscheint — dieselbe Begründung, aus der die Zeile ursprünglich in
 *  `ui/legend.ts`s Titelzeile stand (Korrektur 2026-08-17: die Titelzeile
 *  selbst ist entfallen, siehe dort, diese Zahl NICHT mit ihr).
 *
 *  `count`/`totalListed`/`researched` zählen unterschiedliche Grössen
 *  (Gesellschaften bzw. kotierte SIX-Titel, siehe `layers/visible.ts`,
 *  `CompanyData.stats`) — beide Einheiten stehen deshalb im Satz, sonst gäbe
 *  er Gesellschaften als Titel aus (Abschluss-Review, Fund 4).
 *
 *  `sixRetrievedDate` ist `null` nur in Tests/Fixtures ohne `six_meta` — dann
 *  bleibt der SIX-Stand schlicht weg, statt ein erfundenes Datum zu zeigen. */
export interface Coverage {
  count: number
  totalListed: number
  researched: number
  sixRetrievedDate: string | null
}

function coverageNote(coverage: Coverage): string {
  const stand = coverage.sixRetrievedDate
    ? ` · SIX-Stand ${formatGermanDate(coverage.sixRetrievedDate)}`
    : ''
  return (
    `${coverage.count} Gesellschaften von ${coverage.totalListed} kotierten SIX-Titeln auf der ` +
    `Karte gezeigt, davon ${coverage.researched} recherchiert${stand}`
  )
}

/** Anteil einer Höchst-Säule-Bezugszeile: die Höhenskala passt sich der
 *  aktuellen Auswahl an (Branchen-/Organisationsformfilter), nicht einem
 *  festen Maximum über allen Firmen — ohne diese Angabe sieht eine Höhe wie
 *  ein absoluter Massstab aus, der sie nicht ist. `top.value` ist bereits der
 *  echte, vorzeichenbehaftete Wert der höchsten Säule der Auswahl (bei
 *  Kennzahl Gewinn kann das ein Verlust sein, `formatMetric` schreibt dann
 *  «Verlust …» davor) — die Aufrufstelle (`karte/firmen.ts`) liest ihn aus
 *  `SelectionResult.top` über `metricValue`, dieselbe Herleitung, die vorher
 *  in `ui/legend.ts` stand. */
export interface TopReference {
  name: string
  value: number
}

function topReferenceNote(metric: Metric, top: TopReference): string {
  return `Höchste Säule: ${top.name}, ${formatMetric(top.value, metric)}`
}

/** Mindesthöhen-Hinweis: Säulen unterhalb einer Sichtbarkeitsschwelle stehen
 *  auf einer Mindesthöhe, damit sie überhaupt sichtbar bleiben — darunter
 *  bildet die Höhe die Kennzahl nicht mehr ab, nur noch, DASS es die Firma
 *  gibt. `MIN_VISIBLE_BAR_M`/`MIN_REAL_BAR_M` (`layers/visible.ts`,
 *  `companyElevations`) floort alle drei Kennzahlen gleich, deshalb ein
 *  `Record<Metric, string>` wie `HAUPT_SICHTBARE` oben. */
const FLOOR_NOTE: Record<Metric, string> = {
  umsatz:
    'Kleinste Säulen: auf einer Mindesthöhe, damit sie sichtbar bleiben — unterhalb davon ' +
    'zeigt die Höhe nicht mehr den Umsatz. Genaue Zahl im Panel.',
  mitarbeitende:
    'Kleinste Säulen: auf einer Mindesthöhe, damit sie sichtbar bleiben — unterhalb davon ' +
    'zeigt die Höhe nicht mehr die Mitarbeitendenzahl. Genaue Zahl im Panel.',
  gewinn:
    'Kleinste Säulen: auf einer Mindesthöhe, damit sie sichtbar bleiben — unterhalb davon ' +
    'zeigt die Höhe nicht mehr den Reingewinn. Genaue Zahl im Panel.',
}

/** Randmarkierung: Banken weisen Geschäftsertrag statt Nettoumsatz aus, ihre
 *  Balken tragen deshalb einen sichtbaren Rand (`OUTLINE_COLOR`,
 *  `layers/visible.ts`) — ohne diesen Satz liesse sich aus der Karte allein
 *  nicht ablesen, dass der Rand etwas bedeutet, geschweige denn, was. */
const OUTLINE_NOTE =
  'Balken mit Rand: andere Kennzahl als Nettoumsatz (z. B. Geschäftsertrag einer Bank) — ' +
  'Höhe nicht direkt mit den unmarkierten Balken vergleichbar.'

/** Marker für unrecherchierte Titel: ein an der SIX kotierter Titel ohne
 *  eigene Recherche erscheint als flacher Punkt ohne Branchenfarbe
 *  (`buildUnresearchedCompanyLayer`, `layers/visible.ts`) — ohne diesen Satz
 *  liesse sich aus der Karte allein nicht unterscheiden, ob ein grauer Punkt
 *  «nicht eindeutig bestimmbar» oder «gar nicht recherchiert» bedeutet. */
const UNRESEARCHED_NOTE =
  'Kleiner Punkt: an der SIX kotiert, aber noch nicht recherchiert — Sitz bekannt, keine Höhenaussage.'

function paragraph(text: string, className: string): HTMLParagraphElement {
  const p = document.createElement('p')
  p.className = className
  p.textContent = text
  return p
}

/* Die zwei Helfer `syncToggle` und `createToggle` (runder ⓘ-Umschalter, auf-/
   zugeklappter Zustand) sind mit dem Redesign vom 17. August 2026 entfallen:
   die Vorbehalte stehen jetzt offen im Leistenfuss, es gibt nichts mehr zu
   klappen. Entfernt statt auskommentiert — dieses Projekt lässt keinen toten
   Code liegen; wie der Umschalter aussah, steht in der Git-Historie. */

/** Baut die Eckbox aus mehreren Absätzen statt eines einzelnen `textContent`
 *  (bis 2026-08-13 genügte ein String, weil hier nur der Pflichthinweis
 *  stand) — seit Change 2/3 trägt dieselbe Box zusätzlich die aus der
 *  Legende verschobene Quellen- und Währungszeile, mit eigener, leiserer
 *  Textstufe (`.hinweis-quelle` in style.css). Seit dem 17. August 2026 ist
 *  die Box zusätzlich zuklappbar (siehe Kommentar oben bei `NoticeLevel`) —
 *  Auf-/Zugeklappt-Zustand sitzt als Attribut auf `box` selbst, nicht auf
 *  einem Kindelement: `box.replaceChildren()` unten leert nur die Kinder,
 *  `box`s eigene Attribute überleben das. Ein Klick auf den Umschalter
 *  übersteht deshalb jeden erneuten `renderNotices()`-Aufruf (Filter-/
 *  Kennzahlwechsel etc.), ohne dass der Zustand irgendwo separat vorgehalten
 *  werden müsste. Startzustand ohne gesetztes Attribut: eingeklappt.
 *
 *  `level` (Phase 2): nur bei `view === 'beschaeftigte'` gelesen — welche der
 *  zwei Stufen den passenden Rundungs-/Flächenhinweis braucht (siehe
 *  `HAUPT_BESCHAEFTIGTE` oben). Bei `view === 'sichtbare'` bedeutungslos, aber
 *  Pflichtparameter statt optional: ein Seiteneinstieg (`karte/firmen.ts`,
 *  `karte/beschaeftigte.ts`), der ihn vergisst, soll ein Typfehler sein,
 *  kein still falscher Text zur Laufzeit.
 *
 *  `metric` (Abschluss-Review, 2026-08-16, Finding C1, dieselbe Begründung
 *  wie `level`): nur bei `view === 'sichtbare'` gelesen — wählt die
 *  zutreffende Zeile aus `HAUPT_SICHTBARE` und, zusammen mit `metricInChf`,
 *  aus `CURRENCY_NOTE_CHF`/`CURRENCY_NOTE_FALLBACK` (siehe dort), und formt
 *  seit dem 17. August 2026 zusätzlich `topReference` zur Bezugszeile (siehe
 *  dort). Bei `view === 'beschaeftigte'` bedeutungslos, aber ebenfalls
 *  Pflichtparameter statt optional — aus demselben Grund wie bei `level`.
 *
 *  `metricInChf` (Re-Review 2026-08-15, erweitert 2026-08-16 um Finding I6):
 *  nur bei `view === 'sichtbare'` gelesen — bei Kennzahl Umsatz
 *  `companies.json`s `stats.revenueInChf`, bei Kennzahl Gewinn
 *  `stats.profitInChf` (die Aufrufstelle, `karte/firmen.ts`, wählt das
 *  passende Flag aus, siehe dort). Bei Kennzahl Mitarbeitende oder
 *  `view === 'beschaeftigte'` bedeutungslos, aber ebenfalls Pflichtparameter
 *  statt optional — aus demselben Grund wie bei `level`.
 *
 *  `topReference` (Auftrag, 2026-08-17, aus `ui/legend.ts` umgezogen): nur
 *  bei `view === 'sichtbare'` gelesen, und dort nur, wenn die aktuelle
 *  Auswahl überhaupt eine Firma mit Wert enthält (`SelectionResult.top`,
 *  `null` bei leerer Auswahl) — die Aufrufstelle reicht `null` durch, wenn
 *  `result.top` selbst `null` ist. Bei `view === 'beschaeftigte'`
 *  bedeutungslos, aber ebenfalls Pflichtparameter statt optional (`null` als
 *  neutraler Platzhalter, dieselbe Konvention wie `metric`/`metricInChf` bei
 *  dieser Ansicht in `karte/beschaeftigte.ts`) — aus demselben Grund wie bei
 *  `level`.
 *
 *  `coverage` (Korrektur, 2026-08-17, ebenfalls aus `ui/legend.ts`
 *  umgezogen — anders als die vier anderen Zeilen war sie zunächst
 *  fälschlich ganz entfernt worden, siehe `Coverage`-Kommentar oben): nur bei
 *  `view === 'sichtbare'` gelesen, unabhängig von der aktuellen Auswahl (die
 *  Zahlen gelten für die ganze Karte, nicht nur den gefilterten Teil) — die
 *  Aufrufstelle (`karte/firmen.ts`) liest sie unverändert aus
 *  `companies.stats`. Bei `view === 'beschaeftigte'` bedeutungslos, aber
 *  ebenfalls Pflichtparameter statt optional — aus demselben Grund wie bei
 *  `level`. */
export function renderNotices(
  view: ViewName,
  level: NoticeLevel,
  metric: Metric,
  metricInChf: boolean,
  topReference: TopReference | null,
  coverage: Coverage | null,
): void {
  // Redesign (17. August 2026, Handoff 1b/1c): Die Vorbehalte stehen offen im
  // Fuss der Leiste — leise, aber ohne Klick sichtbar. Damit ist der runde
  // ⓘ-Umschalter entfallen, den der Auftraggeber am Vortag verlangt hatte:
  // eingeklappt sagte die Ecke nichts, und eine Karte, die eine Obergrenze
  // zeigt, sollte den Vorbehalt dazu nicht hinter eine Interaktion legen.
  // Damit gilt wieder, was vor dem 17.08. galt («ohne Interaktion sichtbar»),
  // nur an einem anderen Ort und in einer leiseren Stimme.
  //
  // Eigener Container im Fuss statt `abschnitt('fuss')`: der Fuss trägt zwei
  // Module — die Summe (`ui/kennzahlen.ts`) und diese Vorbehalte. Würde eines
  // von beiden den ganzen Abschnitt leeren, löschte es das andere, je nachdem
  // welches zuletzt zeichnet.
  const inhalt = fussTeil('leiste-vorbehalte', 'leiste-vorbehalte')

  const haupt = view === 'sichtbare' ? HAUPT_SICHTBARE[metric] : HAUPT_BESCHAEFTIGTE[level]
  inhalt.appendChild(paragraph(haupt, 'leiste-vorbehalt-haupt'))
  if (view === 'sichtbare') {
    const note = currencyNote(metric, metricInChf)
    if (note) inhalt.appendChild(paragraph(note, 'leiste-vorbehalt-haupt'))
    // Fünf aus `ui/legend.ts` umgezogene Zeilen (siehe Kommentar dort bei
    // `LegendOptions`) — alle fünf nur in dieser Ansicht, dieselbe Bedingung
    // wie zuvor in der Legende.
    if (coverage) inhalt.appendChild(paragraph(coverageNote(coverage), 'leiste-vorbehalt'))
    if (topReference) {
      inhalt.appendChild(paragraph(topReferenceNote(metric, topReference), 'leiste-vorbehalt'))
    }
    inhalt.appendChild(paragraph(FLOOR_NOTE[metric], 'leiste-vorbehalt'))
    inhalt.appendChild(paragraph(OUTLINE_NOTE, 'leiste-vorbehalt'))
    inhalt.appendChild(paragraph(UNRESEARCHED_NOTE, 'leiste-vorbehalt'))
  }
  inhalt.appendChild(paragraph(FOOTER, 'leiste-vorbehalt'))
  // Unabhängig von der Ansicht: der Seenlayer zeichnet auf beiden Karten
  // (`layers/viewLayers.ts`), die Quelle gehört deshalb neben `FOOTER`, nicht
  // hinter eine `view`-Prüfung (siehe Korrektur-Kommentar an `FOOTER_LAKES`
  // oben).
  inhalt.appendChild(paragraph(FOOTER_LAKES, 'leiste-vorbehalt'))
  // Unabhängig von der Ansicht: der Skalenschalter (und damit die Formel, um
  // die es hier geht) ist in beiden Ansichten sichtbar und bedienbar, nicht
  // nur in Ansicht B.
  inhalt.appendChild(paragraph(SCALE_NOTE, 'leiste-vorbehalt'))
  if (view === 'sichtbare') inhalt.appendChild(paragraph(FOOTER_COMPANIES, 'leiste-vorbehalt'))
  // Nur auf der Kantonsstufe: die «Beschäftigte je Einwohner»-Zeile, die
  // dieser Hinweis erklärt, steht ausschliesslich im Gemeinde-Klick-Panel
  // (`ui/panel.ts`) — auf der Schweiz-Stufe öffnet ein Klick keinen Panel
  // (er betritt den Kanton, siehe `karte/beschaeftigte.ts`), die Zeile
  // erscheint dort nie.
  if (view === 'beschaeftigte' && level === 'kanton') {
    inhalt.appendChild(paragraph(POPULATION_YEAR_NOTE, 'leiste-vorbehalt'))
  }
}
