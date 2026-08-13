import { NOGA_GROUPS, UNKNOWN_COLOR } from '../domain/noga.generated'
import { referenceTicks, type ScaleMode } from '../domain/scale'
import { formatNumber, formatRevenue } from './format'
import type { ViewName } from './toggle'

// Wörtlich aus den Global Constraints des Umsetzungsplans — nicht umformulieren.
const FOOTER =
  'Quelle: Bundesamt für Statistik (BFS), Statistik der Unternehmensstruktur (STATENT) 2023 · ' +
  'Gemeindegrenzen: swisstopo, swissBOUNDARIES3D · Basiskarte: swisstopo'

// Die beiden Ansichten sind nicht ineinander umrechenbar (Geld vs. Personen),
// liegen aber einen Tastendruck auseinander — die Legende muss deshalb die
// Einheit selbst nennen, nicht nur "Skala".
const UNIT_LABEL: Record<ViewName, string> = {
  viele: 'Beschäftigte',
  sichtbare: 'Jahresumsatz',
}

const MODE_LABEL: Record<ScaleMode, string> = {
  log: 'logarithmisch',
  linear: 'linear',
}

export interface LegendOptions {
  view: ViewName
  mode: ScaleMode
  year: number
  vmax: number
  ambiguousCells: number
  overstatementMax: number
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

/** Zeigt fix: Branchenfarben, graue Restkategorie, aktive Skala mit drei
 *  Stützwerten, Datenjahr, Quellenzeile und die Einheit der aktuellen Ansicht.
 *  Wird bei jedem Wechsel von Ansicht, Skala oder Zoom neu aufgerufen — die
 *  Legende ist ohne Interaktion sichtbar und aktualisiert sich mit. */
export function renderLegend(options: LegendOptions): void {
  const { view, mode, year, vmax, ambiguousCells, overstatementMax } = options
  const el = box()

  const title = document.createElement('div')
  title.className = 'legende-titel'
  title.textContent = `${UNIT_LABEL[view]} · Datenjahr ${year}`
  el.appendChild(title)

  const branchen = document.createElement('ul')
  branchen.className = 'legende-branchen'
  for (const group of NOGA_GROUPS) branchen.appendChild(swatch(group.color, group.label))
  branchen.appendChild(swatch(UNKNOWN_COLOR, 'nicht eindeutig bestimmbar'))
  el.appendChild(branchen)

  const ticks = referenceTicks(vmax, mode)
  const formatTick = view === 'viele' ? formatNumber : (v: number) => formatRevenue(v, null)
  const scale = document.createElement('div')
  scale.className = 'legende-skala'
  scale.textContent = `Höhe (${MODE_LABEL[mode]}): ${ticks.map(formatTick).join(' · ')}`
  el.appendChild(scale)

  if (view === 'viele' && ambiguousCells > 0) {
    const hint = document.createElement('div')
    hint.className = 'legende-hinweis'
    hint.textContent =
      `${formatNumber(ambiguousCells)} Hektaren zeigen den aufgerundeten Wert 4 — ` +
      `Kantonssumme dadurch bis zu ${formatNumber(overstatementMax)} Beschäftigte zu hoch.`
    el.appendChild(hint)
  }

  const footer = document.createElement('div')
  footer.className = 'legende-quelle'
  footer.textContent = FOOTER
  el.appendChild(footer)
}

/** Wird von main.ts absichtlich nie aufgerufen: die Legende bleibt immer
 *  sichtbar (siehe renderLegend). Nur für API-Symmetrie mit panel.ts/notices.ts
 *  und für Tests/Aufräumen exportiert. */
export function hideLegend(): void {
  const el = document.getElementById('legende')
  if (el) el.hidden = true
}
