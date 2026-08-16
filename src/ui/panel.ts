import type { Level } from '../data/loader'
import { metricLabel, type Metric } from '../domain/metric'
import { NOGA_GROUPS } from '../domain/noga.generated'
import type { Company } from '../layers/visible'
import { formatNumber, formatProfit, formatRatio, formatRevenue } from './format'

export interface PanelField {
  label: string
  value: string
}

export interface PanelList {
  caption: string
  items: string[]
}

export interface PanelLink {
  label: string
  href: string
}

/** Reines Datenmodell für einen Panelinhalt — keine DOM-Abhängigkeit. Damit
 *  lassen sich die Formulierungen (insbesondere die Ableitungs- und
 *  Vergleichbarkeitshinweise) ausserhalb eines Browsers prüfen. */
export interface PanelContent {
  title: string
  fields: PanelField[]
  notes: string[]
  list?: PanelList
  links?: PanelLink[]
  /** Redesign Change 1 (2026-08-14): die Obergrenzen-Notiz in
   *  `aggregateCellContent` stand bisher gleich hoch gewichtet und weit oben
   *  im Panel wie die Beschäftigtenzahl selbst — sie ist aber ein Vorbehalt,
   *  keine Schlagzeile. Ein eigenes Feld statt ein weiterer Eintrag in
   *  `notes`, weil `notes` unverändert direkt nach den Feldern erscheinen
   *  soll (dort stehen z. B. companyContent()'s Vergleichbarkeits-Hinweise,
   *  die an ihrer bisherigen, prominenteren Stelle bleiben). `footnote` wird
   *  von `renderContent` zuunterst gerendert, unterhalb der Branchen-Liste,
   *  in kleinerer Schrift (`.panel-fussnote`, siehe `style.css`) — Wortlaut
   *  unverändert, nur Gewicht und Position. */
  footnote?: string
}

/** Der Teil des Panelinhalts, den `companyContent` nicht selbst herleiten
 *  kann, weil er von der aktuellen Auswahl abhängt statt von der Firma
 *  allein: Rang und Anteil ändern sich mit jedem Filter, wenn man sie über
 *  die gefilterte Auswahl statt über alle recherchierten Gesellschaften
 *  rechnet — das wäre keine Eigenschaft der Firma mehr. `companyContent`
 *  bekommt Rang und Nenner deshalb fertig gereicht, statt selbst über die
 *  Gesamtliste zu iterieren. Gebaut wird er in `karte/firmen.ts`s `render()`
 *  aus allen recherchierten Gesellschaften (nie aus der gefilterten Auswahl)
 *  und per Closure an `showCompanyPanel` unten gebunden (Task 18). */
export interface CompanyContext {
  /** Die an der Karte aktuell gewählte Kennzahl — bestimmt, wonach `Rang`
   *  benannt ist (z. B. "nach Jahresumsatz"). */
  metric: Metric
  /** 1-basiert; `null`, wenn die Firma in dieser Kennzahl keinen Wert trägt
   *  (dieselbe Firma, die auch keine Säule hätte). */
  rank: number | null
  /** Anzahl der Gesellschaften mit Wert, über die `rank` zählt — immer alle
   *  recherchierten, nie nur die gefilterte Auswahl (siehe oben). */
  rankTotal: number
  /** Summe der `revenueChf`-Werte über alle recherchierten Gesellschaften —
   *  der Nenner für "Anteil am Gesamtumsatz". In CHF, damit er zu
   *  `revenueChf` passt, nicht zu `revenue` in Berichtswährung. */
  revenueTotal: number
}

// Titel der Kantonszelle (Ansicht B, Kantonstufe). Default nur ein Fallback
// für Aufrufe ohne vorheriges configureCanton() (z. B. Tests); im Betrieb
// überschreibt `karte/beschaeftigte.ts` das beim Start mit `meta.canton.name`
// aus /data/meta.json — ein Kantonswechsel braucht hier keine Codeänderung.
let cantonName = 'Aargau'

/** Einmal beim Start mit dem Namen des aktuell konfigurierten Kantons
 *  aufrufen (aus meta.json, nicht hartcodiert). */
export function configureCanton(name: string): void {
  cantonName = name
}

function groupLabel(level: Level, groupIndex: number): string {
  return level.meta.nogaGroups[groupIndex]?.label ?? 'unbekannt'
}

/** Change 4 (Hover): löst den Gemeindenamen für eine Zeile auf, ohne das
 *  volle Panel zu bauen — dieselbe `gemeindeIdx`/`gemeinden`-Auflösung wie in
 *  `aggregateCellContent`, aber als eigener, leichter Export, weil die
 *  Hover-Beschriftung (`layers/viewLayers.ts`, `ui/hoverLabel.ts`) nur den
 *  Namen braucht, keine Verteilung, keine Obergrenzen-Notiz. */
export function municipalityName(level: Level, index: number): string | null {
  const { gemeindeIdx } = level.arrays
  const gemeinden = level.meta.gemeinden
  if (!gemeindeIdx || !gemeinden) return null
  const gemeinde = gemeinden[gemeindeIdx[index] ?? -1]
  return gemeinde?.name ?? null
}

// Change 2 (2026-08-14): `einwohnerzahl` aus swissBOUNDARIES3D
// (`tlm_hoheitsgebiet`, Attribut EINWOHNERZAHL) bezieht sich laut
// Nachführungsinformationen swissBOUNDARIES3D Ausgabe 2026 auf den
// 31.12.2024 — ein anderes Jahr als die STATENT-Beschäftigten (2023). Beide
// Zahlen trotzdem zu einer Kennzahl zu verrechnen ist informativ, aber nur
// ehrlich, wenn der Jahresunterschied irgendwo festgehalten ist statt
// stillschweigend verschwiegen zu werden. Redesign Change 2 (2026-08-15): der
// Hinweis stand bis dahin direkt neben der Ratio im Klick-Panel
// (`"${formatRatio(...)} (Bevölkerung 2024, Beschäftigte 2023)"`) — das
// wiederholte den Jahrgangsunterschied bei jedem Klick auf eine Gemeinde,
// obwohl er panelweit konstant ist. Er steht jetzt einmalig in der Eckbox
// (`ui/notices.ts`, `POPULATION_YEAR_NOTE`), zusammen mit Quelle und den
// übrigen Vorbehalten — wörtlich derselbe Fakt, nur an der Stelle, an der
// dieses Projekt sonst auch Vorbehalte sammelt, statt an der Kennzahl selbst.

/** Gemeinde- oder Kantonszelle: Summe (als Obergrenze ausgewiesen), volle
 *  Verteilung über alle Branchengruppen aus `dist`. */
export function aggregateCellContent(level: Level, index: number): PanelContent {
  const { values, dist, gemeindeIdx } = level.arrays
  const value = values[index] ?? 0

  let title = `Kanton ${cantonName}`
  let ambiguousHere: number | null = null
  // Bevölkerung für die Beschäftigte-je-Einwohner-Zeile unten: bei einer
  // konkreten Gemeinde deren eigene `einwohnerzahl`, sonst (Kantonszelle,
  // heute nicht verdrahtet, aber der Vollständigkeit halber unterstützt) die
  // über `aggregate.stats()` aufsummierte Kantonsbevölkerung.
  let einwohnerzahl: number | undefined
  if (level.meta.level === 'gemeinde' && gemeindeIdx && level.meta.gemeinden) {
    const gemeindeNr = gemeindeIdx[index] ?? -1
    const gemeinde = level.meta.gemeinden[gemeindeNr]
    if (gemeinde) {
      title = gemeinde.name
      // Kommt direkt aus dem Artefakt (`aggregate.build_hectare` in Python) —
      // keine Neuberechnung im Browser durch Scan aller Hektarzellen mehr
      // nötig (siehe Abschluss-Review, deferred finding zu aggregate.py).
      ambiguousHere = gemeinde.ambiguousCells
      einwohnerzahl = gemeinde.einwohnerzahl
    }
  } else {
    einwohnerzahl = level.meta.stats.population
  }

  const overstatement =
    ambiguousHere !== null ? 3 * ambiguousHere : level.meta.stats.overstatementMax
  const scope = ambiguousHere !== null ? 'in dieser Gemeinde' : 'im ganzen Kanton'

  // Change 5: absteigend nach Anteil, nicht mehr in Tabellenreihenfolge — die
  // Gruppe mit den meisten Beschäftigten zuerst. Tabellenreihenfolge (der
  // vorige Stand) ist eine Artefakt-Spaltenreihenfolge, keine Aussage; sie zu
  // zeigen sagt der Leserin nichts darüber, welche Branche in dieser
  // Gemeinde tatsächlich dominiert.
  const items: string[] = []
  if (dist) {
    const groupCount = level.meta.nogaGroups.length
    const entries: { label: string; value: number }[] = []
    for (let group = 0; group < groupCount; group++) {
      const groupValue = dist[index * groupCount + group] ?? 0
      if (groupValue <= 0) continue
      entries.push({ label: groupLabel(level, group), value: groupValue })
    }
    entries.sort((a, b) => b.value - a.value)
    for (const entry of entries) items.push(`${entry.label}: ${formatNumber(entry.value)}`)
  }

  const fields: PanelField[] = [{ label: 'Beschäftigte', value: formatNumber(value) }]
  // Weder fehlende (`undefined`, ältere Artefakte/Exklaven-Teilpolygone ohne
  // Wert) noch exakt 0 Einwohner:innen dürfen eine Division durch 0 oder eine
  // Scheinzahl ergeben — die Zeile erscheint dann schlicht nicht, statt einen
  // erfundenen oder unendlichen Wert zu zeigen. Ein Wert über 1 heisst mehr
  // Arbeitsplätze als Einwohner:innen — ein Arbeitsplatz- statt ein
  // Wohnort-Schwerpunkt, die Information, die die reine Beschäftigtenzahl
  // allein nicht zeigt. Der Jahrgangs-Vorbehalt (Bevölkerung 2024,
  // Beschäftigte 2023) steht seit Redesign Change 2 (2026-08-15) in der
  // Eckbox, nicht mehr hier neben der Zahl (siehe Kommentar oben).
  if (einwohnerzahl !== undefined && einwohnerzahl > 0) {
    fields.push({
      label: 'Beschäftigte je Einwohner',
      value: formatRatio(value / einwohnerzahl),
    })
  }

  return {
    title,
    fields,
    notes: [],
    list: { caption: 'Branche', items },
    footnote:
      `Diese Summe ist eine Obergrenze, keine exakte Zahl: bis zu ` +
      `${formatNumber(overstatement)} Beschäftigte zu viel, weil Hektaren mit ` +
      `dem Wert 4 ${scope} auf 4 aufgerundet wurden.`,
  }
}

function nogaGroupLabel(nogaGroupIndex: number): string {
  return NOGA_GROUPS[nogaGroupIndex]?.label ?? 'unbekannt'
}

/** Anteil `part` an `total`, als Prozentzahl mit zwei Nachkommastellen —
 *  dieselbe `formatRatio`, die schon die Beschäftigte-je-Einwohner-Zeile
 *  benutzt, nur mit "%" statt einer nackten Verhältniszahl. Kein eigener
 *  Prozent-Formatter in `format.ts` dafür, weil `formatRatio` genügt. Ruft
 *  niemand mit `total <= 0` auf — beide Aufrufstellen unten prüfen das vorher
 *  (siehe Kommentare dort), damit hier keine Division durch 0 versteckt ist.
 *
 *  Eine negative Marge (Verlustfirma) bekommt dasselbe Wort wie der
 *  Reingewinn in `formatProfit` (`ui/format.ts`) — ein Minuszeichen vor
 *  einer Prozentzahl übersieht man genauso leicht wie vor einem grossen
 *  Betrag. Nur die Marge kann hier negativ werden (`profit` kann negativ
 *  sein, `revenue`/`revenueChf` als Nenner nie), der Anteil am Gesamtumsatz
 *  braucht diesen Zweig also nie, verträgt ihn aber ohne Schaden. */
function formatShare(part: number, total: number): string {
  const pct = (part / total) * 100
  return pct < 0 ? `Verlust ${formatRatio(-pct)} %` : `${formatRatio(pct)} %`
}

/** Firma: ein Steckbrief zum Anklicken — Sitz, Branche und Kerngeschäft
 *  zuerst, dann die Kennzahlen mit Geschäftsjahr, dann Mitarbeitende, dann
 *  die Links zum Geschäftsbericht und zur Produktquelle. Nennt die gemeldete
 *  Umsatz-Kennzahl beim Namen — sieben Firmen weisen Nettoumsatz aus, die
 *  Hypothekarbank Lenzburg Geschäftsertrag (nicht mit Nettoumsatz
 *  vergleichbar); der Reingewinn braucht diese Unterscheidung nicht (siehe
 *  `companies.py`, Kommentar bei `REVENUE_TYPES` — anders als Umsatz ist er
 *  branchenübergreifend vergleichbar). Für jede fehlende Zahl: ein
 *  expliziter Hinweis statt einer erfundenen. Nennt ausserdem, für welchen
 *  Unternehmensumfang Umsatz und Reingewinn gelten (`consolidationBasis` —
 *  Gesamtkonzern oder fortgeführte Geschäfte, siehe Kommentar direkt unten
 *  bei ihrer Verwendung): die Angabe landet bislang nur in
 *  `companies.json`, nirgends im Interface — derselbe Fehler, den
 *  `revenueType` schon einmal gemacht hat.
 *
 *  Task 15: dieselbe Marge ist zwei verschiedene Kennzahlen, je nach Nenner
 *  (Geschäftsertrag bei Banken, sonst Nettoumsatz) — das Feld heisst deshalb
 *  nach seinem Nenner, genau wie die Umsatzzeile selbst. Rang und Anteil am
 *  Gesamtumsatz gelten immer über alle recherchierten Gesellschaften, nie
 *  über eine gefilterte Auswahl — deshalb reicht `context` (siehe
 *  `CompanyContext`) Rang und beide Nenner fertig gereicht statt sie hier
 *  aus der vollen Firmenliste herzuleiten. Umsatz je Mitarbeitenden bleibt
 *  weg, wo 0 Mitarbeitende gemeldet sind (sechs Beteiligungsgesellschaften
 *  ohne eigenes Personal) — derselbe Schutz vor Division durch 0 wie bei der
 *  Einwohnerzahl in `aggregateCellContent` oben.
 *
 *  Phase 3: für `researched=false` (die flachen Marker, siehe
 *  `layers/visible.ts`) ein bewusst kurzes Panel — nur Name und Sitz, ein
 *  einziger Hinweis. Das ist eine andere Aussage als "Umsatz nicht
 *  öffentlich verfügbar" (der `placeholder`-Fall unten): dort wurde
 *  recherchiert und nichts Öffentliches gefunden, hier wurde noch gar nicht
 *  recherchiert — dieselbe Formulierung für beide wäre irreführend. */
export function companyContent(company: Company, context: CompanyContext): PanelContent {
  if (!company.researched) {
    return {
      title: company.name,
      fields: company.city ? [{ label: 'Sitz', value: company.city }] : [],
      notes: ['Noch nicht recherchiert — an der SIX kotiert, weitere Angaben fehlen bisher.'],
    }
  }

  const fields: PanelField[] = []
  const notes: string[] = []

  if (company.city) fields.push({ label: 'Sitz', value: company.city })
  // Der SIX-Tickercode gehört zur Identität der Firma, nicht zu ihren
  // Kennzahlen — deshalb bei Sitz und Branche statt bei Umsatz und Gewinn.
  if (company.sixSymbol) fields.push({ label: 'SIX-Symbol', value: company.sixSymbol })
  if (company.positionAdjusted !== null) {
    notes.push(
      `An dieser Adresse sitzt mehr als eine kotierte Gesellschaft — die Säule ` +
      `steht ${company.positionAdjusted} m daneben, damit beide sichtbar bleiben.`,
    )
  }
  if (company.foundingYear !== null) {
    fields.push({ label: 'Gegründet', value: String(company.foundingYear) })
  }
  fields.push({ label: 'Branche', value: nogaGroupLabel(company.nogaGroupIndex) })

  if (company.coreProducts) {
    fields.push({ label: 'Kerngeschäft', value: company.coreProducts })
  } else {
    notes.push('Kerngeschäft nicht aus einer Primärquelle auffindbar.')
  }

  if (company.placeholder) {
    notes.push('Umsatz nicht öffentlich verfügbar.')
  } else {
    const label =
      company.revenueType === 'operating_income'
        ? 'Geschäftsertrag (Bank, nicht mit Nettoumsatz vergleichbar)'
        : 'Jahresumsatz (Nettoumsatz)'
    fields.push({
      label,
      value: company.revenue !== null ? formatRevenue(company.revenue, company.currency) : '–',
    })
    // `revenueChf` statt `revenue`: der Anteil vergleicht über Firmen mit
    // drei verschiedenen Berichtswährungen hinweg, das geht nur umgerechnet.
    // `revenueTotal > 0` schützt vor Division durch 0, falls der Kontext
    // (noch) keine echte Summe trägt (siehe `showCompanyPanel` unten).
    if (company.revenueChf !== null && context.revenueTotal > 0) {
      fields.push({
        label: 'Anteil am Gesamtumsatz',
        value: formatShare(company.revenueChf, context.revenueTotal),
      })
    }
  }

  if (company.profit !== null) {
    fields.push({
      label: 'Reingewinn (auf die Aktionäre entfallend)',
      value: formatProfit(company.profit, company.profitCurrency ?? company.currency),
    })
  } else {
    notes.push('Reingewinn nicht öffentlich verfügbar.')
  }

  // Die Marge ist zwei Kennzahlen, nicht eine: 42 der 185 Gesellschaften mit
  // Umsatz und Gewinn sind Banken, deren Nenner der Geschäftsertrag ist statt
  // des Nettoumsatzes (siehe Kommentar bei `companyContent` oben) — das Feld
  // heisst deshalb nach seinem Nenner, wie die Umsatzzeile selbst. `revenue`
  // und `profit` (nicht die CHF-Varianten): beide liegen für dieselbe Firma
  // stets in derselben Berichtswährung vor, eine Marge ist dimensionslos und
  // braucht keine Umrechnung. `revenue !== 0` schliesst eine (in den Daten
  // nicht vorkommende, aber theoretisch mögliche) Division durch 0 aus.
  if (company.revenue !== null && company.revenue !== 0 && company.profit !== null) {
    const marginLabel =
      company.revenueType === 'operating_income'
        ? 'Marge auf Geschäftsertrag'
        : 'Marge auf Nettoumsatz'
    fields.push({ label: marginLabel, value: formatShare(company.profit, company.revenue) })
  }

  // Der Rang gilt immer über alle recherchierten Gesellschaften mit Wert in
  // der aktuell gewählten Kennzahl, nie über eine gefilterte Auswahl (siehe
  // `CompanyContext`) — `companyContent` rechnet ihn deshalb nicht selbst,
  // sondern übernimmt ihn aus `context`. `null` heisst: diese Firma trägt in
  // dieser Kennzahl keinen Wert, also keine Zeile statt eines erfundenen
  // Rangs.
  if (context.rank !== null) {
    fields.push({
      label: 'Rang',
      value: `#${context.rank} von ${context.rankTotal} nach ${metricLabel(context.metric)}`,
    })
  }

  // `consolidationBasis` bindet Umsatz und Reingewinn derselben Zeile an
  // denselben Unternehmensumfang (siehe `ConsolidationBasis` in
  // `layers/visible.ts`) — ohne diese Zeile stünde die Unterscheidung nur in
  // `companies.json`, nie im Panel. Beide Werte werden explizit benannt,
  // nicht nur der abweichende Fall (`continuing_operations`), nach demselben
  // Muster wie der Umsatz-Feldname oben: auch der Normalfall
  // (`total_group`, sieben der acht Firmen) bekommt Klartext statt
  // Schweigen. Wortwahl bewusst knapp gehalten und ohne die Details
  // (welche Sparte, welcher Betrag), die bei DSM-Firmenich und Montana
  // Aerospace bereits im eigenen `note`-Text stehen — diese Zeile ordnet nur
  // ein, sie ersetzt die Begründung nicht.
  if (company.consolidationBasis) {
    const basisText =
      company.consolidationBasis === 'continuing_operations'
        ? 'Umsatz und Reingewinn: Zahlen für die fortgeführten Geschäfte.'
        : 'Umsatz und Reingewinn: Zahlen für den Gesamtkonzern.'
    notes.push(basisText)
  }

  if (company.note) notes.push(company.note)

  if (company.fiscalYear !== null) {
    fields.push({ label: 'Geschäftsjahr', value: String(company.fiscalYear) })
  }
  if (company.employees !== null) {
    fields.push({ label: 'Mitarbeitende', value: formatNumber(company.employees) })
  }
  // Sechs Beteiligungsgesellschaften ohne eigenes Personal melden 0
  // Mitarbeitende — `employees > 0` statt nur `!== null` schützt vor
  // Division durch 0 (dieselbe Falle wie `einwohnerzahl` oben) und vor einer
  // Zeile, die für diese sechs ohnehin nichts Sinnvolles aussagte.
  // `!company.placeholder` zusätzlich zu `revenueChf !== null`: Molecular
  // Partners AG ist recherchiert, aber ohne öffentlichen Umsatz — sie führt
  // `revenueChf: 0` als ETL-Invariante für "kein Wert" (dasselbe Muster wie
  // `metricValue()` in `domain/metric.ts`), nicht als gemessene Null. Ohne
  // diese Prüfung stünde "Umsatz je Mitarbeitenden: 0 CHF" direkt unter dem
  // Hinweis "Umsatz nicht öffentlich verfügbar." — ein erfundener Wert aus
  // einer Zahl, die selbst schon als fehlend ausgewiesen ist.
  if (
    !company.placeholder &&
    company.revenueChf !== null &&
    company.employees !== null &&
    company.employees > 0
  ) {
    fields.push({
      label: 'Umsatz je Mitarbeitenden',
      value: formatRevenue(company.revenueChf / company.employees, 'CHF'),
    })
  }

  const links: PanelLink[] = []
  if (company.reportUrl) links.push({ label: 'Geschäftsbericht öffnen', href: company.reportUrl })
  // `productsUrl` ist bei 195 der 201 Gesellschaften gefüllt und belegt die
  // Kerngeschäft-Zeile oben mit einer Primärquelle — bisher stand die Quelle
  // nur in `companies.json`, nirgends im Panel.
  if (company.productsUrl) links.push({ label: 'Kerngeschäft belegen', href: company.productsUrl })

  return {
    title: company.name,
    fields,
    notes,
    links,
  }
}

function panelBox(): HTMLElement {
  let el = document.getElementById('panel')
  if (!el) {
    el = document.createElement('div')
    el.id = 'panel'
    el.hidden = true
    document.getElementById('ui')?.appendChild(el)
  }
  el.hidden = false
  el.replaceChildren()
  return el
}

function renderContent(box: HTMLElement, content: PanelContent): void {
  const heading = document.createElement('h3')
  heading.textContent = content.title
  box.appendChild(heading)

  for (const field of content.fields) {
    const p = document.createElement('p')
    const strong = document.createElement('strong')
    strong.textContent = `${field.label}: `
    p.append(strong, document.createTextNode(field.value))
    box.appendChild(p)
  }

  for (const note of content.notes) {
    const p = document.createElement('p')
    p.className = 'panel-hinweis'
    p.textContent = note
    box.appendChild(p)
  }

  if (content.list) {
    const caption = document.createElement('p')
    caption.className = 'panel-untertitel'
    caption.textContent = content.list.caption
    box.appendChild(caption)

    const list = document.createElement('ul')
    for (const item of content.list.items) {
      const li = document.createElement('li')
      li.textContent = item
      list.appendChild(li)
    }
    box.appendChild(list)
  }

  for (const link of content.links ?? []) {
    const p = document.createElement('p')
    const a = document.createElement('a')
    a.href = link.href
    a.textContent = link.label
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    p.appendChild(a)
    box.appendChild(p)
  }

  // Change 1 (2026-08-14): ganz unten, kleiner als alles andere im Panel —
  // ein Vorbehalt, keine Schlagzeile (siehe `PanelContent.footnote`).
  if (content.footnote) {
    const p = document.createElement('p')
    p.className = 'panel-fussnote'
    p.textContent = content.footnote
    box.appendChild(p)
  }

  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'panel-schliessen'
  close.textContent = 'Schliessen'
  close.addEventListener('click', hidePanel)
  box.appendChild(close)
}

/** Zeigt das Panel für eine angeklickte Gemeinde in Ansicht B. */
export function showMunicipalityPanel(level: Level, index: number): void {
  const box = panelBox()
  renderContent(box, aggregateCellContent(level, index))
}

// Task 18: Rang und Nenner kommen jetzt als `CompanyContext` herein, aus den
// 201 recherchierten Gesellschaften gebaut und per Closure gebunden — siehe
// `karte/firmen.ts`, `render()`. Kein Platzhalter mehr nötig: `showCompanyPanel`
// hat ohne einen echten Kontext keinen Aufrufer mehr (weder in der App noch in
// den Tests, siehe `companyContent` in `panel.test.ts`).
export function showCompanyPanel(company: Company, context: CompanyContext): void {
  const box = panelBox()
  renderContent(box, companyContent(company, context))
}

export function hidePanel(): void {
  const el = document.getElementById('panel')
  if (el) el.hidden = true
}
