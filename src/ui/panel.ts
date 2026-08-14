import type { Level } from '../data/loader'
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

// Titel der Kantonszelle (Ansicht B, Kantonstufe). Default nur ein Fallback
// für Aufrufe ohne vorheriges configureCanton() (z. B. Tests); im Betrieb
// überschreibt main.ts das beim Start mit `meta.canton.name` aus
// /data/meta.json — ein Kantonswechsel braucht hier keine Codeänderung.
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
 *  Hover-Beschriftung (`main.ts`, `ui/hoverLabel.ts`) nur den Namen braucht,
 *  keine Verteilung, keine Obergrenzen-Notiz. */
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

/** Firma: ein Steckbrief zum Anklicken — Sitz, Branche und Kerngeschäft
 *  zuerst, dann die Kennzahlen mit Geschäftsjahr, dann Mitarbeitende, dann
 *  der Link zum Geschäftsbericht. Nennt die gemeldete Umsatz-Kennzahl beim
 *  Namen — sieben Firmen weisen Nettoumsatz aus, die Hypothekarbank Lenzburg
 *  Geschäftsertrag (nicht mit Nettoumsatz vergleichbar); der Reingewinn
 *  braucht diese Unterscheidung nicht (siehe `companies.py`, Kommentar bei
 *  `REVENUE_TYPES` — anders als Umsatz ist er branchenübergreifend
 *  vergleichbar). Für jede fehlende Zahl: ein expliziter Hinweis statt einer
 *  erfundenen. Nennt ausserdem, für welchen Unternehmensumfang Umsatz und
 *  Reingewinn gelten (`consolidationBasis` — Gesamtkonzern oder fortgeführte
 *  Geschäfte, siehe Kommentar direkt unten bei ihrer Verwendung): die Angabe
 *  landet bislang nur in `companies.json`, nirgends im Interface — derselbe
 *  Fehler, den `revenueType` schon einmal gemacht hat.
 *
 *  Phase 3: für `researched=false` (die flachen Marker, siehe
 *  `layers/visible.ts`) ein bewusst kurzes Panel — nur Name und Sitz, ein
 *  einziger Hinweis. Das ist eine andere Aussage als "Umsatz nicht
 *  öffentlich verfügbar" (der `placeholder`-Fall unten): dort wurde
 *  recherchiert und nichts Öffentliches gefunden, hier wurde noch gar nicht
 *  recherchiert — dieselbe Formulierung für beide wäre irreführend. */
export function companyContent(company: Company): PanelContent {
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
  }

  if (company.profit !== null) {
    fields.push({
      label: 'Reingewinn (auf die Aktionäre entfallend)',
      value: formatProfit(company.profit, company.profitCurrency ?? company.currency),
    })
  } else {
    notes.push('Reingewinn nicht öffentlich verfügbar.')
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

  return {
    title: company.name,
    fields,
    notes,
    links: company.reportUrl
      ? [{ label: 'Geschäftsbericht öffnen', href: company.reportUrl }]
      : [],
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

export function showCompanyPanel(company: Company): void {
  const box = panelBox()
  renderContent(box, companyContent(company))
}

export function hidePanel(): void {
  const el = document.getElementById('panel')
  if (el) el.hidden = true
}
