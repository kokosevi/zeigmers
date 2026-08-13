import type { Level } from '../data/loader'
import { FLAG_AMBIGUOUS } from '../domain/colors'
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

// Je Gemeinde (Index in meta.gemeinden) die Anzahl mehrdeutiger Hektaren —
// berechnet aus der Hektarstufe, weil die Gemeindestufe selbst kein flags-Bit
// je Gemeinde führt (ihr `flags`-Array ist im ETL stets 0). Ohne das würde das
// Gemeindepanel nur die kantonsweite Zahl zeigen können, die für eine einzelne
// (oft viel kleinere) Gemeinde grob irreführend wäre.
let ambiguousByGemeinde: Uint32Array | null = null

/** Einmal beim Start mit der Hektarstufe aufrufen. */
export function configureAmbiguity(hectare: Level): void {
  const { gemeindeIdx, flags } = hectare.arrays
  if (!gemeindeIdx) return
  const size = hectare.meta.gemeinden?.length ?? 0
  const counts = new Uint32Array(size)
  for (let i = 0; i < gemeindeIdx.length; i++) {
    if ((flags[i]! & FLAG_AMBIGUOUS) !== 0) counts[gemeindeIdx[i]!]!++
  }
  ambiguousByGemeinde = counts
}

function groupLabel(level: Level, groupIndex: number): string {
  return level.meta.nogaGroups[groupIndex]?.label ?? 'unbekannt'
}

/** Hektarzelle: Beschäftigte, Ambiguitätshinweis, Top-3-Branchen als
 *  ausdrücklich abgeleitete (nicht amtlich gemeldete) Werte. */
export function hectareCellContent(level: Level, index: number): PanelContent {
  const { values, flags, mixGroup, mixValue, gemeindeIdx } = level.arrays
  const value = values[index] ?? 0
  const ambiguous = ((flags[index] ?? 0) & FLAG_AMBIGUOUS) !== 0

  let title = 'Hektare'
  if (gemeindeIdx && level.meta.gemeinden) {
    const gemeinde = level.meta.gemeinden[gemeindeIdx[index] ?? -1]
    if (gemeinde) title = gemeinde.name
  }

  const notes: string[] = []
  if (ambiguous) {
    notes.push(
      'Wert auf 4 aufgerundet (Datenschutz): der wahre Wert liegt zwischen 1 und 4.',
    )
  }

  const content: PanelContent = {
    title,
    fields: [{ label: 'Beschäftigte', value: formatNumber(value) }],
    notes,
  }

  if (mixGroup && mixValue) {
    const groupCount = level.meta.nogaGroups.length
    const items: string[] = []
    for (let k = 0; k < 3; k++) {
      const group = mixGroup[index * 3 + k] ?? level.meta.unknownIndex
      const groupValue = mixValue[index * 3 + k] ?? 0
      if (groupValue <= 0 || group === level.meta.unknownIndex) continue
      items.push(`${groupLabel(level, group)}: ${formatNumber(groupValue)}`)
    }
    content.list = { caption: `Top 3 von ${groupCount} Gruppen, abgeleitet`, items }
  }

  return content
}

/** Gemeinde- oder Kantonszelle: Summe (als Obergrenze ausgewiesen), volle
 *  Verteilung über alle Branchengruppen aus `dist`. */
export function aggregateCellContent(level: Level, index: number): PanelContent {
  const { values, dist, gemeindeIdx } = level.arrays
  const value = values[index] ?? 0

  let title = 'Kanton Aargau'
  let ambiguousHere: number | null = null
  if (level.meta.level === 'gemeinde' && gemeindeIdx && level.meta.gemeinden) {
    const gemeindeNr = gemeindeIdx[index] ?? -1
    const gemeinde = level.meta.gemeinden[gemeindeNr]
    if (gemeinde) title = gemeinde.name
    if (ambiguousByGemeinde) ambiguousHere = ambiguousByGemeinde[gemeindeNr] ?? 0
  }

  const overstatement =
    ambiguousHere !== null ? 3 * ambiguousHere : level.meta.stats.overstatementMax
  const scope = ambiguousHere !== null ? 'in dieser Gemeinde' : 'im ganzen Kanton'

  const items: string[] = []
  if (dist) {
    const groupCount = level.meta.nogaGroups.length
    for (let group = 0; group < groupCount; group++) {
      const groupValue = dist[index * groupCount + group] ?? 0
      if (groupValue <= 0) continue
      items.push(`${groupLabel(level, group)}: ${formatNumber(groupValue)}`)
    }
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

/** Zeigt das Panel für eine Zelle aus Ansicht B — Hektare, Gemeinde oder
 *  Kanton, je nachdem, welche Stufe `level` ist (erkennbar an `mixGroup`, das
 *  nur die Hektarstufe führt). Alle drei Stufen teilen sich Wertespalte und
 *  Indexierung, deshalb genügt eine Funktion mit (level, index). */
export function showHectarePanel(level: Level, index: number): void {
  const box = panelBox()
  const content =
    level.arrays.mixGroup && level.arrays.mixValue
      ? hectareCellContent(level, index)
      : aggregateCellContent(level, index)
  renderContent(box, content)
}

export function showCompanyPanel(company: Company): void {
  const box = panelBox()
  renderContent(box, companyContent(company))
}

export function hidePanel(): void {
  const el = document.getElementById('panel')
  if (el) el.hidden = true
}
