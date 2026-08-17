import type { PresentGroups } from '../domain/legendGroups'
import { metricLabel, type Metric } from '../domain/metric'
import { NOGA_GROUPS, UNKNOWN_COLOR, type NogaGroup } from '../domain/noga.generated'
import type { SelectionResult } from '../domain/selection'
import { litTopFaceColor } from '../layers/litColor'
import { LOSS_COLOR } from '../layers/visible'
import { label as leistenLabel, teil } from './leiste'
import type { ViewName } from './nav'

// Abschluss-Review, Finding C2 → Auftrag (2026-08-17): seit der zweiten Wahl
// für Verluste (Betrag als Höhe, `LOSS_COLOR` trägt allein das Vorzeichen —
// siehe `layers/visible.ts`, Kommentar bei `zeroPlaneHeight`) ist diese Farbe
// die EINZIGE Stelle auf der Karte, an der ein Verlust überhaupt ablesbar
// ist. Ohne jede Erklärung wäre ein Rot auf der Karte nicht mehr deutbar —
// das ist der eine der zwei Gründe, warum dieser Eintrag den Kahlschlag vom
// 2026-08-17 überlebt hat (der andere: `onAllBranches` unten). Bewusst auf
// ein einziges Wort gekürzt («Verlust» statt der früheren, ausführlicheren
// Erklärung mit Anzahl und Saldo) — das reicht, um die Farbe einer
// Bedeutung zuzuordnen, mehr braucht die Legende dafür nicht mehr zu tragen
// (siehe `renderLegend` unten für den Rest des Kahlschlags). Eine
// Verlustfirma behält dabei weiterhin ihren Branchentupfer UND ihren Platz
// in der eigenen Branchenzeile — dieser Swatch macht nur die auf der Karte
// tatsächlich gezeichnete Farbe kenntlich, ändert aber nichts daran, wie
// Branchen gruppiert werden.
const LOSS_LEGEND_TEXT = 'Verlust'

// Die beiden Ansichten sind nicht ineinander umrechenbar (Geld vs. Personen),
// liegen aber einen Tastendruck auseinander — die Legende muss deshalb die
// Einheit selbst nennen, nicht nur "Skala".
//
// `sichtbare` ist hier bewusst noch der Umsatz-Text — dieser Eintrag greift
// erst dann, wenn kein `metric` übergeben ist (siehe `renderLegend` unten).
// Task 18, Browser-Fund: mit der Kennzahl-Verdrahtung zeigt Ansicht
// «Börsennotierte Firmen» jetzt auch Mitarbeitende und Reingewinn — der
// Titel muss der AKTIVEN Kennzahl folgen (`metricLabel(metric)`), sonst
// stünde über einer Gewinn-Karte weiterhin «Jahresumsatz». Dieser Fallback
// bleibt trotzdem bestehen: ohne `metric` (Ansicht «Beschäftigte», die keine
// Kennzahlwahl kennt) ist er der einzige Titeltext.
//
// Auftrag (2026-08-17): die Titelzeile selbst (inkl. dieser Konstante) ist
// in Ansicht «Börsennotierte Firmen» entfallen (siehe `renderLegend` unten)
// — `UNIT_LABEL.sichtbare` bleibt trotzdem stehen, `Record<ViewName,
// string>` bräuchte sonst einen Sonderfall für genau einen der beiden
// Schlüssel, ohne dass das hier einen Nutzen hätte.
const UNIT_LABEL: Record<ViewName, string> = {
  beschaeftigte: 'Beschäftigte',
  sichtbare: 'Jahresumsatz',
}

/** Optionen für `renderLegend`.
 *
 *  Auftrag (2026-08-17), grosser Kahlschlag in Ansicht «Börsennotierte
 *  Firmen»: die Legende zeigt dort nur noch Farbtupfer und Branchennamen —
 *  Anzahl/Anteil/Saldo je Branche, die «nur diese»-Griffe, die Titelzeile mit
 *  der Abdeckungsangabe und die vier erklärenden Sätze Randmarkierung,
 *  unrecherchierte Marker, Mindesthöhe und Branchenzahl sind ersatzlos
 *  entfallen. Fünf Sätze tragen dabei eine Aussage, ohne die die Karte etwas
 *  behauptet, das sie nicht einlöst — sie sind deshalb NICHT verschwunden,
 *  sondern in die Eckbox gewandert (`ui/notices.ts`, `renderNotices`): die
 *  Bezugszeile «Höchste Säule» (Parameter `topReference`), der
 *  Mindesthöhen-Hinweis, die Randmarkierung, der Marker für unrecherchierte
 *  Titel und die Abdeckungsangabe («201 Gesellschaften von 224 kotierten
 *  SIX-Titeln …», Parameter `coverage`). Leitsatz seit Redesign Change 2/3
 *  (siehe dort): „die Legende trägt, was man zum Lesen braucht, die Eckbox,
 *  was man zum Vertrauen braucht" — dieser Kahlschlag zieht diese Trennung
 *  konsequent zu Ende, statt Vorbehalte in einer Ecke zu belassen, aus der
 *  sie inhaltlich in die andere gehören.
 *
 *  Korrektur (selbes Datum): der Leerauswahl-Hinweis («Keine Branche
 *  ausgewählt») war anfangs ebenfalls entfallen — zu Unrecht, wie der
 *  Auftraggeber richtiggestellt hat. Er ist kein erklärender Satz wie die
 *  fünf oben, sondern die Antwort auf einen Zustand, den die Karte sonst
 *  unerklärt liesse (siehe `renderLegend` unten, `.legende-leer`), und bleibt
 *  deshalb in der Legende, nicht in der Eckbox: er gehört zur AKTUELLEN
 *  Auswahl, nicht zu einer Eigenschaft der Karte insgesamt, und die Eckbox
 *  trägt bewusst nichts, was von der Branchenauswahl abhängt.
 *
 *  `onOnlyBranch` ist mit den «nur diese»-Griffen ebenfalls entfallen (siehe
 *  `NavOptions`-Pendant in `ui/nav.ts` für dasselbe Muster bei einer anderen
 *  Gruppe) — ein Feld für einen Knopf, den es nicht mehr gibt, wäre toter
 *  Code geblieben. */
export interface LegendOptions {
  view: ViewName
  year: number
  /** Welche Branchengruppen (und ob "nicht bestimmbar") in der aktuellen
   *  Ansicht überhaupt vorkommen (Finding 2c) — von den Seiten
   *  (`karte/firmen.ts`, `karte/beschaeftigte.ts`) aus den tatsächlichen
   *  Rohdaten abgeleitet (`domain/legendGroups.ts`), nicht hartcodiert,
   *  damit ein Kantons- oder Jahreswechsel automatisch die richtige
   *  Teilmenge zeigt. */
  presentGroups: PresentGroups
  /** Kontext-Zusatz neben `UNIT_LABEL` in der Legenden-Titelzeile — nur noch
   *  bei Ansicht «Beschäftigte» gelesen (Kantonsstufe: der Kantonsname,
   *  Schweiz-Stufe: `undefined`). Ansicht «Börsennotierte Firmen» zeigt seit
   *  dem Kahlschlag vom 2026-08-17 gar keine Titelzeile mehr (siehe
   *  `LegendOptions`-Kommentar oben) und liest dieses Feld deshalb nicht
   *  mehr — die frühere, hier ausführlich beschriebene Abdeckungsangabe
   *  («201 Gesellschaften von 224 kotierten SIX-Titeln …») ist NICHT
   *  ersatzlos entfallen, sondern in die Eckbox gewandert (`ui/notices.ts`,
   *  `renderNotices`, Parameter `coverage`) — sie bleibt Teil der
   *  Oberfläche, wie die Spec es für diese Zahl verlangt, nur nicht mehr
   *  hier. Unabhängig davon weiterhin auf der Landing (`index.html`, von
   *  `src/landing.test.ts` gegen `companies.json` geprüft). */
  scopeLabel?: string
  /** Task 13: aus der Farbliste wird ein Bedienelement, aber nur, wo eine
   *  Kennzahl UND ein Ergebnis vorliegen — heute nur die Firmenseite
   *  (`karte/firmen.ts`). Ansicht «Beschäftigte» kennt keine Kennzahlwahl
   *  (siehe `ui/nav.ts`, `NavOptions.metrics`) und lässt beide Felder weg;
   *  die Legende bleibt dort unverändert eine reine Farbliste. `metric` und
   *  `result` sind ein Paar — eines ohne das andere ergibt keine Zahl, die
   *  sich anzeigen liesse. Seit dem Kahlschlag vom 2026-08-17 entscheiden
   *  beide nur noch, ob eine Branchenzeile ein Umschaltknopf ist oder ein
   *  reiner Farbtupfer (siehe `renderLegend`) — nicht mehr, ob Zahlen daneben
   *  stehen, die gibt es in keinem der beiden Fälle mehr. */
  metric?: Metric
  result?: SelectionResult
  /** Welche Branchen aktuell sichtbar sind. Fehlt sie trotz gesetzter
   *  `metric`/`result` (z. B. beim ersten Aufruf einer Seite, die den Filter
   *  noch nicht verdrahtet), gilt "alle vorhandenen Branchen ausgewählt" als
   *  Startzustand — dieselbe Konvention wie bei der Organisationsform in
   *  `ui/nav.ts`. */
  selectedBranches?: ReadonlySet<number>
  /** Meldet einen Klick auf eine Branchenschaltfläche. Die Legende hält
   *  selbst keinen Auswahlzustand — sie meldet nur, wer ihn hält (und ihn
   *  über `selectedBranches` zurückreicht), ist Sache der Aufrufstelle. */
  onToggleBranch?: (index: number) => void
  /** Einziger Weg zurück zur vollen Auswahl, seit die «nur diese»-Griffe
   *  entfallen sind: ohne ihn wäre eine einmal abgewählte Branche nur über
   *  einen zweiten Klick auf denselben Umschalter wiederzufinden — bei
   *  mehreren abgewählten Branchen mühsam. Der zweite der zwei Texte, die den
   *  Kahlschlag vom 2026-08-17 überleben (siehe `LOSS_LEGEND_TEXT` oben),
   *  ebenfalls auf ein einziges Wort gekürzt (`renderLegend`: „Alle" statt
   *  vormals „Alle Branchen"). */
  onAllBranches?: () => void
}

/** Zielfläche seit dem Redesign (17. August 2026): der Listen-Abschnitt der
 *  Leiste (`ui/leiste.ts`) statt einer eigenen Box `#legende` unten links.
 *  Der Inhalt ist unverändert — Farbtupfer, Branchenname, an/aus —, nur der
 *  Ort hat sich geändert: die Branchen stehen jetzt dort, wo auch gefiltert
 *  wird, statt in der gegenüberliegenden Ecke der Karte. */
function box(): HTMLElement {
  // Eigener Container im Listen-Abschnitt, nicht der ganze Abschnitt: auf
  // `/beschaeftigte/` steht darunter die Rangliste (`ui/rangliste.ts`) — wer
  // den Abschnitt leerte, löschte die andere Liste, je nachdem welche zuletzt
  // zeichnet (siehe `ui/leiste.ts`, `teil`).
  return teil('liste', 'leiste-branchen')
}

function swatch(color: readonly [number, number, number], label: string): HTMLLIElement {
  const li = document.createElement('li')
  const dot = document.createElement('span')
  dot.className = 'leiste-punkt'
  dot.style.background = `rgb(${color[0]}, ${color[1]}, ${color[2]})`
  li.append(dot, document.createTextNode(label))
  return li
}

/** Swatch für Verlustsäulen (Kennzahl Gewinn) — dieselbe `LOSS_COLOR`, die
 *  `buildCompanyLayer` (`layers/visible.ts`) tatsächlich für jeden
 *  negativen Wert zeichnet, unabhängig von der Branche der Firma (siehe
 *  Finding C2, Kommentar bei `LOSS_LEGEND_TEXT` oben). Nur in der
 *  Gewinn-Ansicht sinnvoll — die anderen beiden Kennzahlen kennen keine
 *  negativen Werte (`metricAllowsNegative`, `domain/metric.ts`).
 *
 *  Durch `litTopFaceColor`, wie jeder Branchentupfer (siehe `branchRow`/
 *  `swatch` oben, Finding 2a): eine Verlustsäule ist dieselbe beleuchtete
 *  Deckfläche wie jede andere, `LOSS_COLOR` ist ihre Rohfarbe vor dem Licht
 *  — die Begründung für die Näherung gilt hier genauso wie bei den
 *  Branchenfarben. */
function lossSwatch(): HTMLLIElement {
  const [r, g, b] = litTopFaceColor(LOSS_COLOR)
  return swatch([r, g, b], LOSS_LEGEND_TEXT)
}

/** Eine Branchenzeile — seit Task 13 eine Schaltfläche (Umschalter,
 *  `aria-pressed`) statt eines reinen Farbtupfers: ein Klick meldet
 *  `onToggleBranch`, die Legende selbst hält keinen Auswahlzustand (wer ihn
 *  hält und die Kartenlayer entsprechend filtert, ist Sache der
 *  Aufrufstelle).
 *
 *  Kahlschlag (2026-08-17): zeigt nur noch Farbtupfer und Branchenname —
 *  weder Anzahl noch Anteil/Saldo (siehe `LegendOptions`-Kommentar), noch
 *  einen zweiten Knopf «nur diese» daneben (siehe `onAllBranches` dort für
 *  den verbliebenen Weg zurück zur vollen Auswahl). */
function branchRow(
  index: number,
  group: NogaGroup,
  selected: ReadonlySet<number>,
  onToggleBranch: ((index: number) => void) | undefined,
): HTMLLIElement {
  const li = document.createElement('li')
  

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'leiste-branche'
  toggle.dataset.branch = String(index)
  toggle.setAttribute('aria-pressed', String(selected.has(index)))

  const dot = document.createElement('span')
  dot.className = 'leiste-punkt'
  const [r, g, b] = litTopFaceColor(group.color)
  dot.style.background = `rgb(${r}, ${g}, ${b})`

  toggle.append(dot, document.createTextNode(group.label))
  toggle.addEventListener('click', () => onToggleBranch?.(index))

  li.append(toggle)
  return li
}

/** Zeigt Branchenfarben und graue Restkategorie; bei Ansicht «Beschäftigte»
 *  zusätzlich Datenjahr und Einheit als Titelzeile. Mit `metric`/`result`
 *  (siehe `LegendOptions`) sind die Branchenzeilen Umschalter statt reiner
 *  Farbtupfer (Task 13). Wird bei jedem Wechsel von Ansicht, Skala oder
 *  Auswahl neu aufgerufen — die Legende hält selbst keinen Zustand, sie
 *  zeichnet nur, was man ihr übergibt, und aktualisiert sich damit.
 *
 *  Kahlschlag (2026-08-17): in Ansicht «Börsennotierte Firmen» ist das jetzt
 *  praktisch ALLES, was diese Funktion zeichnet — keine Titelzeile, keine
 *  Zahlen je Branche, keine der fünf erklärenden Sätze mehr (siehe
 *  `LegendOptions`-Kommentar für die vollständige Liste des Entfallenen und
 *  wohin die fünf Sätze gewandert sind). Drei Ausnahmen bleiben: Verlustfarbe
 *  und „Alle"-Knopf (`LOSS_LEGEND_TEXT` bzw. `LegendOptions.onAllBranches`)
 *  sowie die Leerauswahl-Zeile (`.legende-leer` unten, siehe
 *  `LegendOptions`-Kommentar für die Begründung, warum sie anders als die
 *  fünf umgezogenen Sätze in der Legende bleibt). */
export function renderLegend(options: LegendOptions): void {
  const { view, year, presentGroups, scopeLabel, metric, result, onToggleBranch } = options
  const el = box()

  // Titelzeile: nur noch bei Ansicht «Beschäftigte» — Ansicht «Börsennotierte
  // Firmen» zeigt seit dem Kahlschlag vom 2026-08-17 keine Titelzeile mehr
  // (siehe `LegendOptions`-Kommentar oben).
  if (view !== 'sichtbare') {
    const title = document.createElement('div')
    title.className = 'leiste-label'
    const scopePart = scopeLabel ? ` · ${scopeLabel}` : ''
    const unitLabel = metric !== undefined ? metricLabel(metric) : UNIT_LABEL[view]
    title.textContent = `${unitLabel}${scopePart} · Datenjahr ${year}`
    el.appendChild(title)
  }

  // Filter-Modus nur mit `metric` UND `result` zusammen (siehe
  // `LegendOptions`) — ohne die beiden bleibt die Legende die reine
  // Farbliste von vorher (Ansicht «Beschäftigte»). `metric`/`result` als
  // direkte Bedingung (nicht über eine zwischengespeicherte Bool-Variable),
  // damit TypeScript die beiden im jeweiligen Block als vorhanden erkennt.
  if (metric !== undefined && result !== undefined) {
    const alleButton = document.createElement('button')
    alleButton.type = 'button'
    alleButton.className = 'leiste-aktion'
    alleButton.dataset.allBranches = ''
    // Ein Wort statt vormals «Alle Branchen» (Kahlschlag 2026-08-17, siehe
    // `LegendOptions.onAllBranches`) — der Knopf bleibt der einzige Weg
    // zurück zur vollen Auswahl, seine Beschriftung braucht dafür nicht mehr
    // als das eine Wort.
    alleButton.textContent = 'Alle'
    alleButton.addEventListener('click', () => options.onAllBranches?.())
    // Redesign (17. August 2026): der Knopf steht rechts im Gruppenlabel
    // «BRANCHEN» statt als eigene Zeile über der Liste — dieselbe Aktion, aber
    // ohne der Leiste eine Zeile Höhe zu kosten (siehe `ui/leiste.ts`,
    // `label`).
    el.appendChild(leistenLabel('Branchen', alleButton))
  }

  // Startzustand ohne explizite `selectedBranches`: alle vorhandenen
  // Branchen ausgewählt (dieselbe Konvention wie die Organisationsform in
  // `ui/nav.ts`) — die Karte startet ungefiltert.
  const selected = options.selectedBranches ?? new Set(presentGroups.indices)

  // Fix-Runde (2026-08-16, Review): die Branchenschaltflächen bildeten keine
  // benannte Gruppe — `aria-pressed` sass korrekt je Umschalter, aber ohne
  // Rolle/Label am Container liest ein Screenreader nur "Button, gedrückt,
  // Industrie und Energie", ohne dass die Zeilen als eine zusammengehörige
  // Gruppe erkennbar wären. Dasselbe Muster, das Task 12 für die
  // Organisationsform in `ui/nav.ts` schon durchgespielt hat: ein Container
  // ohne Rolle gibt seinen `aria-label` nicht zuverlässig aus.
  //
  // `role="group"` sitzt hier bewusst auf einem umschliessenden `<div>`,
  // nicht auf der `<ul>` selbst: eine `<ul>` mit einer expliziten
  // ARIA-Rolle verliert ihre implizite Listen-Rolle (kein "Liste, N
  // Einträge" mehr für Screenreader) — bei `ui/nav.ts` stellte sich diese
  // Frage nicht (dort schon ein `<div>`, keine Liste), hier schon, und die
  // Antwort ist: Listensemantik UND Gruppenname sind beide zumutbar, es
  // kostet nur ein zusätzliches Element.
  const branchGroup = document.createElement('div')
  branchGroup.setAttribute('role', 'group')
  branchGroup.setAttribute('aria-label', 'Branchen')

  const branchen = document.createElement('ul')
  branchen.className = 'leiste-liste'
  // Nur Gruppen, die in der aktuellen Ansicht tatsächlich eine Fläche/einen
  // Balken einfärben (Finding 2c) — nicht mehr alle elf gemessenen Gruppen
  // unabhängig davon, ob sie je vorkommen. Farbe kommt aus `litTopFaceColor`
  // (Finding 2a): derselbe Ton, den die beleuchtete Deckfläche tatsächlich
  // zeigt, nicht der rohe, ungeshadete Messwert.
  for (const [index, group] of NOGA_GROUPS.entries()) {
    if (!presentGroups.indices.includes(index)) continue
    if (metric !== undefined && result !== undefined) {
      branchen.appendChild(branchRow(index, group, selected, onToggleBranch))
    } else {
      branchen.appendChild(swatch(litTopFaceColor(group.color), group.label))
    }
  }
  if (presentGroups.hasUnknown) {
    branchen.appendChild(swatch(litTopFaceColor(UNKNOWN_COLOR), 'nicht eindeutig bestimmbar'))
  }
  branchGroup.appendChild(branchen)
  el.appendChild(branchGroup)

  // Verlustfarbe: die einzige der früheren erklärenden Zeilen, die in der
  // Legende bleibt (Begründung bei `LOSS_LEGEND_TEXT` oben) — nur in der
  // Gewinn-Ansicht sinnvoll, und nur, wenn die aktuelle AUSWAHL tatsächlich
  // eine Verlustfirma enthält (sonst erklärte der Swatch eine Farbe, die auf
  // der gefilterten Karte gar nicht vorkommt, Finding C2 spiegelverkehrt).
  if (view === 'sichtbare' && metric === 'gewinn' && result && result.losses > 0) {
    const hinweise = document.createElement('ul')
    hinweise.className = 'leiste-liste'
    hinweise.appendChild(lossSwatch())
    el.appendChild(hinweise)
  }

  // Leerauswahl-Zeile: zurückgeholt, nachdem der Kahlschlag vom 2026-08-17
  // sie zunächst mit den übrigen erklärenden Sätzen entfernt hatte
  // (Auftraggeber-Korrektur, selbes Datum) — das ist kein erklärender Satz
  // wie die anderen, sondern die Antwort auf einen Zustand, den die Karte
  // sonst unerklärt liesse: wer alle Branchen abwählt, sieht eine leere
  // Karte und kann ohne diese Zeile nicht unterscheiden, ob sie kaputt ist
  // oder ob er sie selbst leer gefiltert hat. Erscheint nur in genau diesem
  // Fall — im Normalbetrieb (mindestens eine Branche gewählt) macht sie die
  // Legende kein Stück länger. So knapp wie möglich gehalten, wie verlangt.
  if (metric !== undefined && result !== undefined && selected.size === 0) {
    const leer = document.createElement('div')
    leer.className = 'leiste-leer'
    leer.textContent = 'Keine Branche ausgewählt — Karte leer.'
    el.appendChild(leer)
  }
}
