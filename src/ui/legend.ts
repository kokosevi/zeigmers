import type { PresentGroups } from '../domain/legendGroups'
import {
  formatMetric,
  metricAllowsNegative,
  metricLabel,
  metricValue,
  type Metric,
} from '../domain/metric'
import { NOGA_GROUPS, UNKNOWN_COLOR, type NogaGroup } from '../domain/noga.generated'
import { branchTotals, type SelectionResult } from '../domain/selection'
import { litTopFaceColor } from '../layers/litColor'
import { LOSS_COLOR, OUTLINE_COLOR, UNRESEARCHED_MARKER_COLOR } from '../layers/visible'
import { formatNumber } from './format'
import type { ViewName } from './nav'

const OUTLINE_LEGEND_TEXT =
  'Balken mit Rand: andere Kennzahl als Nettoumsatz (z. B. Geschäftsertrag einer Bank) — ' +
  'Höhe nicht direkt mit den unmarkierten Balken vergleichbar.'

// Phase 3: die flachen Marker (kein Balken, keine Branchenfarbe) sind eine
// eigene, dritte Kategorie neben den Branchenfarben und der Rand-Markierung
// oben — ohne eigenen Legendeneintrag liesse sich aus der Karte allein nicht
// ablesen, dass ein grauer Punkt etwas grundsätzlich anderes bedeutet als
// ein grauer ("nicht eindeutig bestimmbar") Balken.
// Elf Umsatz-Säulen (alle unter rund 19 Mio. CHF) sitzen auf einer
// Sichtbarkeitsschwelle: darunter würden sie in der Kantonsplatte
// verschwinden. Ihre Höhe bildet den jeweiligen Wert dort nicht mehr ab,
// sondern nur noch, DASS es die Firma gibt — das gehört gesagt, sonst
// behauptet die Karte eine Grösse, die sie nicht misst.
//
// Fix-Runde (2026-08-16, Abschluss-Review Finding I1): derselbe Mechanismus
// (`MIN_VISIBLE_BAR_M`/`MIN_REAL_BAR_M`, `layers/visible.ts`,
// `companyElevations`) floort JEDE der drei Kennzahlen gleich — vermessen
// wurde die Schwelle nur für Umsatz (siehe Kommentar dort), der Text war
// aber auch bei aktiver Kennzahl Mitarbeitende oder Gewinn fest auf «den
// Umsatz» formuliert. Jetzt ein `Record<Metric, string>`, dasselbe Muster
// wie `UNIT_LABEL` unten.
const FLOOR_LEGEND_TEXT: Record<Metric, string> = {
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

const UNRESEARCHED_LEGEND_TEXT =
  'Kleiner Punkt: an der SIX kotiert, aber noch nicht recherchiert — Sitz bekannt, keine Höhenaussage.'

// Abschluss-Review, Finding C2: seit der zweiten Wahl für Verluste (Betrag
// als Höhe, `LOSS_COLOR` trägt allein das Vorzeichen — siehe
// `layers/visible.ts`, Kommentar bei `zeroPlaneHeight`) ist diese Farbe die
// EINZIGE Stelle auf der Karte, an der ein Verlust überhaupt ablesbar ist.
// Ohne eigenen Legendeneintrag hatte sie keinerlei Erklärung: ein Betrachter
// sah eine dritte, unbenannte Farbe neben den Branchentönen, ohne zu wissen,
// dass sie „Verlust" bedeutet — und für die 41 von 197 Säulen, die sie
// tragen, stimmte der Farbschlüssel der Legende (nur Branchenfarben) nicht
// mehr mit dem der Karte überein. Eine Verlustfirma behält dabei bewusst
// ihren Branchentupfer UND ihren Platz in Anzahl/Saldo der eigenen Branche
// (`branchRow`/`branchTotals` unten bleiben unverändert) — dieser Swatch
// macht nur die auf der Karte tatsächlich gezeichnete Farbe kenntlich,
// ändert aber nicht, wie Branchen gezählt werden (das wäre eine grössere,
// hier nicht verlangte Änderung).
const LOSS_LEGEND_TEXT =
  'Diese Farbe: Verlust in der Kennzahl Reingewinn — ersetzt hier die Branchenfarbe, Höhe ' +
  'bleibt der Betrag. Anzahl und Saldo der Branche oben zählen die Firma trotzdem mit.'

// Finding I4: `branchTotals` (unten) zählt und summiert über `withValue`,
// nicht über `visible` — eine Firma ohne Wert in der aktiven Kennzahl trägt
// weder zur Anzahl noch zur Summe einer Branche bei, obwohl ihre
// Platzhaltersäule weiterhin auf der Karte steht (`layers/visible.ts`,
// `buildCompanyLayer` zeichnet `result.visible`, nicht `result.withValue`).
// Die Kennzahlenzeile (`ui/kennzahlen.ts`) nennt für dieselbe Unterscheidung
// ihren Nenner («aus X Angaben») explizit — die Legende tat das bisher
// nicht, obwohl ihre Branchenzahl bei jedem Kennzahlwechsel unbegründet
// schwankte (unterschiedliche Firmen haben unterschiedliche Lücken je
// Kennzahl). Dieser Hinweis schliesst dieselbe Lücke wie die Kennzahlenzeile,
// an der Stelle, an der die Zahl tatsächlich steht.
const BRANCH_COUNT_LEGEND_TEXT =
  'Branchenzahl: nur Gesellschaften mit Wert in der aktiven Kennzahl — ändert sich deshalb ' +
  'bei einem Kennzahlwechsel, auch ohne neuen Filter.'

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
const UNIT_LABEL: Record<ViewName, string> = {
  beschaeftigte: 'Beschäftigte',
  sichtbare: 'Jahresumsatz',
}

// Redesign Change 3 (2026-08-14): weder die Höhen-/Stützwerte-Zeile noch die
// Mehrdeutigkeits-Zeile stehen hier noch — beide sind entfallen (siehe
// `renderLegend` unten). `mode`, `vmax`, `ambiguousCells`, `overstatementPct`
// wurden darum aus `LegendOptions` entfernt statt sie unbenutzt mitzuführen;
// die Seiten (`karte/firmen.ts`, `karte/beschaeftigte.ts`) reichen sie
// entsprechend nicht mehr durch. Die Skala heisst im Button (`ui/nav.ts`)
// und in der Eckbox (`ui/notices.ts`, mit der ehrlichen Formel) weiterhin
// «logarithmisch» — die Legende selbst nennt gar keinen Skalenmodus mehr, es
// gibt hier nichts mehr, das ihn bräuchte.
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
  /** Kontext-Zusatz neben `UNIT_LABEL` in der Legenden-Titelzeile.
   *
   *  - Ansicht «Beschäftigte», Kantonsstufe: der Kantonsname (Schweiz-Stufe:
   *    `undefined`, alle 26, kein Einzelname nötig — Phase 2, nationale
   *    Navigation).
   *  - Ansicht «Börsennotierte Firmen» (seit Phase 3 national): die
   *    Abdeckungsangabe — ZWEI Zahlen, nicht nur eine (Beispiel, Stand
   *    15. August 2026: „201 Gesellschaften von 224 kotierten SIX-Titeln auf
   *    der Karte gezeigt, davon 201 recherchiert · SIX-Stand …", aus
   *    `companies.json`s `stats` berechnet, siehe `karte/firmen.ts`,
   *    `coverageLabel`). Eine Zahl allein ("201 recherchiert") wäre
   *    unvollständig: eine Leserin, die die Marker auf der Karte zählt, sähe
   *    `stats.count` (die platzierten Marker), nicht `stats.totalListed` —
   *    ein SIX-Titel ohne eindeutigen Zefix-Sitz erscheint gar nicht auf der
   *    Karte. Das ist Teil der Oberfläche, nicht nur der README: ohne diese
   *    Zeile liesse sich aus der Karte selbst nicht ablesen, dass ein Teil
   *    der kotierten Titel überhaupt nicht auf der Karte erscheint. */
  scopeLabel?: string
  /** Task 13: aus der Farbliste wird ein Bedienelement, aber nur, wo eine
   *  Kennzahl UND ein Ergebnis vorliegen — heute nur die Firmenseite
   *  (`karte/firmen.ts`). Ansicht «Beschäftigte» kennt keine Kennzahlwahl
   *  (siehe `ui/nav.ts`, `NavOptions.metrics`) und lässt beide Felder weg;
   *  die Legende bleibt dort unverändert eine reine Farbliste. `metric` und
   *  `result` sind ein Paar — eines ohne das andere ergibt keine Zahl, die
   *  sich anzeigen liesse. */
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
  /** "nur diese": ersetzt die Auswahl durch genau eine Branche. */
  onOnlyBranch?: (index: number) => void
  /** "alle": wählt wieder alle vorhandenen Branchen. */
  onAllBranches?: () => void
}

function box(): HTMLElement {
  let el = document.getElementById('legende')
  if (!el) {
    el = document.createElement('div')
    el.id = 'legende'
    document.getElementById('ui')?.appendChild(el)
  }
  el.replaceChildren()
  return el
}

function swatch(color: readonly [number, number, number], label: string): HTMLLIElement {
  const li = document.createElement('li')
  const dot = document.createElement('span')
  dot.className = 'legende-punkt'
  dot.style.background = `rgb(${color[0]}, ${color[1]}, ${color[2]})`
  li.append(dot, document.createTextNode(label))
  return li
}

/** Swatch, der die tatsächliche Randmarkierung nicht-`net_sales`-Balken zeigt
 *  (Farbe/Breite aus `visible.ts`, nicht nur beschrieben) — siehe Finding I2(b). */
function outlineSwatch(): HTMLLIElement {
  const li = document.createElement('li')
  const dot = document.createElement('span')
  dot.className = 'legende-punkt'
  dot.style.background = 'transparent'
  dot.style.border = `2px solid rgba(${OUTLINE_COLOR[0]}, ${OUTLINE_COLOR[1]}, ` +
    `${OUTLINE_COLOR[2]}, ${OUTLINE_COLOR[3] / 255})`
  li.append(dot, document.createTextNode(OUTLINE_LEGEND_TEXT))
  return li
}

/** Swatch für die flachen Marker unrecherchierter Firmen — dieselbe Farbe
 *  wie `buildUnresearchedCompanyLayer` tatsächlich zeichnet, nicht nur
 *  beschrieben (gleiches Prinzip wie `outlineSwatch`). */
function unresearchedSwatch(): HTMLLIElement {
  const [r, g, b] = UNRESEARCHED_MARKER_COLOR
  return swatch([r, g, b], UNRESEARCHED_LEGEND_TEXT)
}

/** Swatch für Verlustsäulen (Kennzahl Gewinn) — dieselbe `LOSS_COLOR`, die
 *  `buildCompanyLayer` (`layers/visible.ts`) tatsächlich für jeden
 *  negativen Wert zeichnet, unabhängig von der Branche der Firma (siehe
 *  Finding C2, Kommentar bei `LOSS_LEGEND_TEXT` oben). Nur in der
 *  Gewinn-Ansicht sinnvoll — die anderen beiden Kennzahlen kennen keine
 *  negativen Werte (`metricAllowsNegative`).
 *
 *  Durch `litTopFaceColor`, wie jeder Branchentupfer (siehe `branchRow`/
 *  `swatch` unten, Finding 2a): eine Verlustsäule ist dieselbe beleuchtete
 *  Deckfläche wie jede andere, `LOSS_COLOR` ist ihre Rohfarbe vor dem Licht
 *  — die Begründung für die Näherung gilt hier genauso wie bei den
 *  Branchenfarben. */
function lossSwatch(): HTMLLIElement {
  const [r, g, b] = litTopFaceColor(LOSS_COLOR)
  return swatch([r, g, b], LOSS_LEGEND_TEXT)
}

/** Anteil einer Branchensumme an der Gesamtsumme der aktuellen Auswahl, als
 *  gerundete Prozentzahl. Nur für Kennzahlen ohne negative Werte sinnvoll
 *  (siehe `metricAllowsNegative`) — bei Gewinn tritt an ihre Stelle der
 *  Saldo. `total <= 0` (leere Auswahl oder — bei Gewinn nie hier, siehe
 *  oben — eine Gesamtsumme von 0) ergibt 0 %, statt durch 0 zu teilen. */
function formatShare(part: number, total: number): string {
  const pct = total > 0 ? Math.round((part / total) * 100) : 0
  return `${formatNumber(pct)} %`
}

/** Eine Branchenzeile — seit Task 13 eine Schaltfläche (Umschalter,
 *  `aria-pressed`) statt eines reinen Farbtupfers: ein Klick meldet
 *  `onToggleBranch`, die Legende selbst hält keinen Auswahlzustand (wer ihn
 *  hält und die Kartenlayer entsprechend filtert, ist Sache der
 *  Aufrufstelle). Daneben ein zweiter, unabhängiger Knopf «nur diese» —
 *  sichtbare Bedienelemente statt versteckter Gesten (Doppelklick,
 *  Modifikatortaste), die es auf einem Touchgerät ohnehin nicht gäbe. */
function branchRow(
  index: number,
  group: NogaGroup,
  entry: { count: number; sum: number } | undefined,
  metric: Metric,
  totalSum: number,
  selected: ReadonlySet<number>,
  onToggleBranch: ((index: number) => void) | undefined,
  onOnlyBranch: ((index: number) => void) | undefined,
): HTMLLIElement {
  const li = document.createElement('li')
  li.className = 'legende-branche-zeile'

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'legende-branche'
  toggle.dataset.branch = String(index)
  toggle.setAttribute('aria-pressed', String(selected.has(index)))

  const dot = document.createElement('span')
  dot.className = 'legende-punkt'
  const [r, g, b] = litTopFaceColor(group.color)
  dot.style.background = `rgb(${r}, ${g}, ${b})`

  const count = entry?.count ?? 0
  // Gewinn: Saldo (kann negativ sein, `formatMetric` schreibt dann
  // "Verlust …" davor) — ein Anteil an einer Summe aus Gewinnen UND
  // Verlusten wäre eine Zahl ohne Bedeutung, sie könnte über 100 % liegen
  // oder negativ werden. Andere Kennzahlen: Anteil an der Gesamtsumme.
  const zahl = metricAllowsNegative(metric)
    ? formatMetric(entry?.sum ?? 0, metric)
    : formatShare(entry?.sum ?? 0, totalSum)
  toggle.append(dot, document.createTextNode(`${group.label} · ${count} · ${zahl}`))
  toggle.addEventListener('click', () => onToggleBranch?.(index))

  const nur = document.createElement('button')
  nur.type = 'button'
  nur.className = 'legende-nur'
  nur.dataset.only = String(index)
  nur.textContent = 'nur diese'
  nur.addEventListener('click', () => onOnlyBranch?.(index))

  li.append(toggle, nur)
  return li
}

/** Zeigt Branchenfarben, graue Restkategorie, Datenjahr und die Einheit der
 *  aktuellen Ansicht — mit `metric`/`result` (siehe `LegendOptions`) je
 *  Branche zusätzlich Anzahl und Anteil/Saldo, als Umschalter statt reiner
 *  Farbtupfer (Task 13). Wird bei jedem Wechsel von Ansicht, Skala oder
 *  Auswahl neu aufgerufen — die Legende hält selbst keinen Zustand, sie
 *  zeichnet nur, was man ihr übergibt, und aktualisiert sich damit. */
export function renderLegend(options: LegendOptions): void {
  const { view, year, presentGroups, scopeLabel, metric, result, onToggleBranch, onOnlyBranch } =
    options
  const el = box()

  const title = document.createElement('div')
  title.className = 'legende-titel'
  const scopePart = scopeLabel ? ` · ${scopeLabel}` : ''
  // Mit aktiver Kennzahl (Ansicht «Börsennotierte Firmen», Task 13/18) nennt
  // der Titel die tatsächlich gewählte Grösse, nicht statisch «Jahresumsatz»
  // — sonst behauptete die Legende bei Kennzahl Gewinn oder Mitarbeitende
  // weiterhin eine Einheit, die die Säulen gar nicht mehr zeigen.
  const unitLabel = metric !== undefined ? metricLabel(metric) : UNIT_LABEL[view]
  title.textContent = `${unitLabel}${scopePart} · Datenjahr ${year}`
  el.appendChild(title)

  // Filter-Modus nur mit `metric` UND `result` zusammen (siehe
  // `LegendOptions`) — ohne die beiden bleibt die Legende die reine
  // Farbliste von vorher (Ansicht «Beschäftigte»). `metric`/`result` als
  // direkte Bedingung (nicht über eine zwischengespeicherte Bool-Variable),
  // damit TypeScript die beiden im jeweiligen Block als vorhanden erkennt.
  if (metric !== undefined && result !== undefined) {
    const alleButton = document.createElement('button')
    alleButton.type = 'button'
    alleButton.className = 'legende-alle'
    alleButton.dataset.allBranches = ''
    alleButton.textContent = 'Alle Branchen'
    alleButton.addEventListener('click', () => options.onAllBranches?.())
    el.appendChild(alleButton)
  }

  // Startzustand ohne explizite `selectedBranches`: alle vorhandenen
  // Branchen ausgewählt (dieselbe Konvention wie die Organisationsform in
  // `ui/nav.ts`) — die Karte startet ungefiltert.
  const selected = options.selectedBranches ?? new Set(presentGroups.indices)
  const totals = metric !== undefined && result !== undefined ? branchTotals(result, metric) : null

  // Fix-Runde (2026-08-16, Review): die Branchenschaltflächen bildeten keine
  // benannte Gruppe — `aria-pressed` sass korrekt je Umschalter, aber ohne
  // Rolle/Label am Container liest ein Screenreader nur "Button, gedrückt,
  // Industrie und Energie, 3, 45 %", ohne dass die Zeilen als eine
  // zusammengehörige Gruppe erkennbar wären. Dasselbe Muster, das Task 12
  // für die Organisationsform in `ui/nav.ts` schon durchgespielt hat: ein
  // Container ohne Rolle gibt seinen `aria-label` nicht zuverlässig aus.
  //
  // `role="group"` sitzt hier bewusst auf einem umschliessenden `<div>`,
  // nicht auf der `<ul>` selbst: eine `<ul>` mit einer expliziten
  // ARIA-Rolle verliert ihre implizite Listen-Rolle (kein "Liste, N
  // Einträge" mehr für Screenreader) — bei `ui/nav.ts` stellte sich diese
  // Frage nicht (dort schon ein `<div>`, keine Liste), hier schon, und die
  // Antwort ist: Listensemantik UND Gruppenname sind beide zumutbar, es
  // kostet nur ein zusätzliches Element.
  //
  // Die Gruppe umfasst nur die eigentlichen Branchen (NOGA-Gruppen und
  // "nicht bestimmbar") — die Rand-, Marker- und Mindesthöhen-Hinweise
  // darunter sind eine eigene, dritte Kategorie (siehe Kommentar oben bei
  // `FLOOR_LEGEND_TEXT`) und stehen deshalb in einer zweiten, ungruppierten
  // Liste: als "Branche" vorgelesen wären sie irreführend gewesen.
  const branchGroup = document.createElement('div')
  branchGroup.setAttribute('role', 'group')
  branchGroup.setAttribute('aria-label', 'Branchen')

  const branchen = document.createElement('ul')
  branchen.className = 'legende-branchen'
  // Nur Gruppen, die in der aktuellen Ansicht tatsächlich eine Fläche/einen
  // Balken einfärben (Finding 2c) — nicht mehr alle elf gemessenen Gruppen
  // unabhängig davon, ob sie je vorkommen. Farbe kommt aus `litTopFaceColor`
  // (Finding 2a): derselbe Ton, den die beleuchtete Deckfläche tatsächlich
  // zeigt, nicht der rohe, ungeshadete Messwert.
  for (const [index, group] of NOGA_GROUPS.entries()) {
    if (!presentGroups.indices.includes(index)) continue
    if (metric !== undefined && result !== undefined) {
      branchen.appendChild(
        branchRow(
          index,
          group,
          totals?.get(index),
          metric,
          result.sum,
          selected,
          onToggleBranch,
          onOnlyBranch,
        ),
      )
    } else {
      branchen.appendChild(swatch(litTopFaceColor(group.color), group.label))
    }
  }
  if (presentGroups.hasUnknown) {
    branchen.appendChild(swatch(litTopFaceColor(UNKNOWN_COLOR), 'nicht eindeutig bestimmbar'))
  }
  branchGroup.appendChild(branchen)
  el.appendChild(branchGroup)

  if (view === 'sichtbare') {
    const hinweise = document.createElement('ul')
    hinweise.className = 'legende-branchen'
    hinweise.appendChild(outlineSwatch())
    hinweise.appendChild(unresearchedSwatch())
    // Nur in der Gewinn-Ansicht: die anderen beiden Kennzahlen kennen keine
    // negativen Werte, `LOSS_COLOR` erscheint dort nie auf der Karte
    // (Finding C2). Zusätzlich nur, wenn die aktuelle AUSWAHL tatsächlich
    // eine Verlustfirma enthält (`result.losses > 0`, dieselbe Bedingung wie
    // bei der Verlustzeile weiter unten) — sonst erklärt der Swatch eine
    // Farbe, die auf der gefilterten Karte gar nicht vorkommt, das Spiegelbild
    // des Befunds (C2), den er eigentlich behebt.
    if (metric === 'gewinn' && result && result.losses > 0) hinweise.appendChild(lossSwatch())
    const floorNote = document.createElement('li')
    // Ohne aktive Kennzahl (Ansicht «Beschäftigte» erreicht diesen Zweig nie,
    // aber `metric` bleibt hier typisiert optional, siehe `LegendOptions`)
    // bleibt Umsatz derselbe Fallback wie bei `UNIT_LABEL` oben.
    floorNote.textContent = FLOOR_LEGEND_TEXT[metric ?? 'umsatz']
    hinweise.appendChild(floorNote)
    // Nur zusammen mit Branchenzahlen sinnvoll (Finding I4) — ohne
    // `metric`/`result` zeigt die Legende ohnehin keine Zahlen neben den
    // Branchentupfern (siehe `branchRow` vs. `swatch` oben).
    if (metric !== undefined && result !== undefined) {
      const branchCountNote = document.createElement('li')
      branchCountNote.textContent = BRANCH_COUNT_LEGEND_TEXT
      hinweise.appendChild(branchCountNote)
    }
    el.appendChild(hinweise)
  }

  if (metric !== undefined && result !== undefined) {
    // Bezugszeile: seit die Höhenskala sich an die Auswahl anpasst (statt an
    // ein fixes Maximum über allen Firmen), behauptet die Karte ohne diese
    // Zeile einen absoluten Massstab, den sie nicht hat. `result.vmax` ist
    // exakt der BETRAG, den die höchste Säule als Höhe zeigt — dieselbe
    // Zahl, aus der `domain/scale.ts` die Höhe berechnet.
    //
    // Fix-Runde (2026-08-16, Abschluss-Review Finding I8): `result.vmax` ist
    // vorzeichenlos (`applySelection` rechnet mit `Math.abs`, siehe
    // `domain/selection.ts`) — bei Kennzahl Gewinn stand hier deshalb ein
    // positiver Betrag, selbst wenn `result.top` die Firma mit dem grössten
    // VERLUST war, ohne das Wort «Verlust». `metricValue(result.top, metric)`
    // liest stattdessen den echten, vorzeichenbehafteten Wert; der Fallback
    // auf `result.vmax` greift nur, falls `metricValue` wider Erwarten `null`
    // liefert (kann laut `applySelection` nicht vorkommen, `result.top` wird
    // nur bei einem echten Wert gesetzt — der Fallback ist reine
    // Typsicherheit, keine erwartete Laufzeit-Situation).
    if (result.top) {
      const topValue = metricValue(result.top, metric) ?? result.vmax
      const bezug = document.createElement('div')
      bezug.className = 'legende-bezug'
      bezug.textContent = `Höchste Säule: ${result.top.name}, ${formatMetric(topValue, metric)}`
      el.appendChild(bezug)
    }
    // Nur bei Gewinn kann es Verluste geben (siehe `metricAllowsNegative`) —
    // und nur, wenn die aktuelle Auswahl tatsächlich welche enthält.
    if (metric === 'gewinn' && result.losses > 0) {
      const verlust = document.createElement('div')
      verlust.className = 'legende-bezug'
      verlust.textContent =
        `${formatNumber(result.losses)} von ${formatNumber(result.withValue.length)} ` +
        'Gesellschaften in der Auswahl mit Verlust.'
      el.appendChild(verlust)
    }
    if (selected.size === 0) {
      const leer = document.createElement('div')
      leer.className = 'legende-bezug'
      leer.textContent = 'Keine Branche ausgewählt — die Karte zeigt keine Säule.'
      el.appendChild(leer)
    }
  }

  // Redesign Change 3 (2026-08-14): zwei Zeilen sind hier entfallen —
  //
  // 1. Die Höhen-/Stützwerte-Zeile («Höhe (gedämpft …): 1'146 · 10'228 ·
  //    36'677»). Sie erklärte die Skala mit drei Beispielwerten; das kostete
  //    Platz für eine Information, die niemand zum Lesen der Karte braucht
  //    (die Balkenhöhen selbst sind schon die Antwort). `referenceTicks`
  //    wurde deshalb aus `domain/scale.ts` entfernt (samt Tests) statt als
  //    tote Funktion liegen zu bleiben.
  //
  // 2. Die Mehrdeutigkeits-Zeile («X Hektaren zeigen den aufgerundeten Wert
  //    4 — die Gemeindesummen sind dadurch im Median Y %, maximal Z % zu
  //    hoch.»). Ihre Substanz ist keine verlorene Information: derselbe
  //    Fakt (Median/Maximum der Überschätzung) steht wortgleich im
  //    Pflichthinweis (`ui/notices.ts`, `HAUPT.beschaeftigte`) und der
  //    exakte Betrag je Gemeinde im Klick-Panel (`ui/panel.ts`,
  //    `aggregateCellContent`, `footnote`). Die Legende war die dritte,
  //    redundante Stelle für dieselbe Zahl — mit `municipalityOverstatement-
  //    Stats` als einzigem verbleibenden Aufrufer ist `domain/overstatement.
  //    ts` seither ebenfalls entfernt (samt Tests), statt unbenutzt liegen
  //    zu bleiben.
  //
  // Quellenangabe und Währungshinweis stehen seit demselben Redesign
  // ohnehin in der Eckbox (`ui/notices.ts`) — „die Legende trägt, was man
  // zum Lesen braucht, die Eckbox, was man zum Vertrauen braucht". Ohne
  // Filter-Modus (kein `metric`/`result`) endet die Legende deshalb mit den
  // Branchenfarben oben; mit Filter-Modus (Task 13) kommen die Bezugs-,
  // Verlust- und Leerauswahl-Zeilen darunter dazu — beide gehören ins Lesen
  // der Karte, nicht ins Vertrauen in sie.
}
