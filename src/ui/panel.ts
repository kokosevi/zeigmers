import type { Level } from '../data/loader'
import type { Company } from '../layers/visible'
import { formatNumber, formatRevenue } from './format'

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

/** Gemeinde- oder Kantonszelle: Summe (als Obergrenze ausgewiesen), volle
 *  Verteilung über alle Branchengruppen aus `dist`. */
export function aggregateCellContent(level: Level, index: number): PanelContent {
  const { values, dist, gemeindeIdx } = level.arrays
  const value = values[index] ?? 0

  let title = `Kanton ${cantonName}`
  let ambiguousHere: number | null = null
  if (level.meta.level === 'gemeinde' && gemeindeIdx && level.meta.gemeinden) {
    const gemeindeNr = gemeindeIdx[index] ?? -1
    const gemeinde = level.meta.gemeinden[gemeindeNr]
    if (gemeinde) {
      title = gemeinde.name
      // Kommt direkt aus dem Artefakt (`aggregate.build_hectare` in Python) —
      // keine Neuberechnung im Browser durch Scan aller Hektarzellen mehr
      // nötig (siehe Abschluss-Review, deferred finding zu aggregate.py).
      ambiguousHere = gemeinde.ambiguousCells
    }
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

  return {
    title,
    fields: [{ label: 'Beschäftigte (Summe)', value: formatNumber(value) }],
    notes: [
      `Diese Summe ist eine Obergrenze, keine exakte Zahl: bis zu ` +
        `${formatNumber(overstatement)} Beschäftigte zu viel, weil Hektaren mit ` +
        `dem Wert 4 ${scope} auf 4 aufgerundet wurden.`,
    ],
    list: { caption: 'Verteilung nach Branchengruppe', items },
  }
}

/** Firma: nennt die gemeldete Kennzahl beim Namen — sieben Firmen weisen
 *  Nettoumsatz aus, die Hypothekarbank Lenzburg Geschäftsertrag (nicht mit
 *  Nettoumsatz vergleichbar). Ohne Umsatz: expliziter Hinweis statt einer
 *  erfundenen Zahl. */
export function companyContent(company: Company): PanelContent {
  const fields: PanelField[] = []
  const notes: string[] = []

  if (company.placeholder) {
    notes.push('Umsatz nicht öffentlich verfügbar.')
    if (company.note) notes.push(company.note)
  } else {
    const label =
      company.revenueType === 'operating_income'
        ? 'Geschäftsertrag (Bank, nicht mit Nettoumsatz vergleichbar)'
        : 'Jahresumsatz (Nettoumsatz)'
    fields.push({
      label,
      value: company.revenue !== null ? formatRevenue(company.revenue, company.currency) : '–',
    })
    if (company.note) notes.push(company.note)
  }

  if (company.employees !== null) {
    fields.push({ label: 'Mitarbeitende', value: formatNumber(company.employees) })
  }
  if (company.fiscalYear !== null) {
    fields.push({ label: 'Geschäftsjahr', value: String(company.fiscalYear) })
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
