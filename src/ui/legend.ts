import { NOGA_GROUPS, UNKNOWN_COLOR } from '../domain/noga.generated'
import type { OverstatementStats } from '../domain/overstatement'
import { referenceTicks, type ScaleMode } from '../domain/scale'
import { OUTLINE_COLOR } from '../layers/visible'
import { formatNumber, formatRevenue } from './format'
import type { ViewName } from './toggle'

// Wörtlich aus den Global Constraints des Umsetzungsplans — nicht umformulieren.
const FOOTER =
  'Quelle: Bundesamt für Statistik (BFS), Statistik der Unternehmensstruktur (STATENT) 2023 · ' +
  'Gemeindegrenzen: swisstopo, swissBOUNDARIES3D · Basiskarte: swisstopo'

// Zweite Quellenzeile, nur in Ansicht A: die Fixzeile oben nennt STATENT und
// swisstopo, aber jede Zahl in Ansicht A stammt aus keiner dieser Quellen,
// sondern aus den Geschäftsberichten der acht Unternehmen selbst (siehe
// `report_url` je Firma im Panel). Ohne diese Zeile schreibt die Legende
// Ansicht-A-Zahlen implizit dem BFS zu (Abschluss-Review, Finding I7).
const FOOTER_COMPANIES =
  'Ansicht A: Umsatz, Mitarbeitende und Geschäftsjahr aus den Geschäftsberichten der ' +
  'acht Unternehmen selbst (Quelle je Firma im Panel, «Geschäftsbericht öffnen»).'

const OUTLINE_LEGEND_TEXT =
  'Balken mit Rand: andere Kennzahl als Nettoumsatz (z. B. Geschäftsertrag einer Bank) — ' +
  'Höhe nicht direkt mit den unmarkierten Balken vergleichbar.'

const CURRENCY_NOTE =
  'Umsätze in der jeweiligen Konzernwährung (CHF, EUR, USD), nicht umgerechnet.'

// Die beiden Ansichten sind nicht ineinander umrechenbar (Geld vs. Personen),
// liegen aber einen Tastendruck auseinander — die Legende muss deshalb die
// Einheit selbst nennen, nicht nur "Skala".
const UNIT_LABEL: Record<ViewName, string> = {
  beschaeftigte: 'Beschäftigte',
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
  /** Median/Maximum der Überschätzung je Gemeinde in Prozent (siehe
   *  `domain/overstatement.ts`) — dieselbe Grösse und Formulierung wie im
   *  Pflichthinweis (`ui/notices.ts`), hier aber live berechnet statt als
   *  AG-2023-Literal, damit ein Kantonswechsel die richtigen Zahlen zeigt. */
  overstatementPct: OverstatementStats
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

/** Zeigt fix: Branchenfarben, graue Restkategorie, aktive Skala mit drei
 *  Stützwerten, Datenjahr, Quellenzeile und die Einheit der aktuellen Ansicht.
 *  Wird bei jedem Wechsel von Ansicht oder Skala neu aufgerufen — die
 *  Legende ist ohne Interaktion sichtbar und aktualisiert sich mit. */
export function renderLegend(options: LegendOptions): void {
  const { view, mode, year, vmax, ambiguousCells, overstatementPct } = options
  const el = box()

  const title = document.createElement('div')
  title.className = 'legende-titel'
  title.textContent = `${UNIT_LABEL[view]} · Datenjahr ${year}`
  el.appendChild(title)

  const branchen = document.createElement('ul')
  branchen.className = 'legende-branchen'
  for (const group of NOGA_GROUPS) branchen.appendChild(swatch(group.color, group.label))
  branchen.appendChild(swatch(UNKNOWN_COLOR, 'nicht eindeutig bestimmbar'))
  if (view === 'sichtbare') branchen.appendChild(outlineSwatch())
  el.appendChild(branchen)

  const ticks = referenceTicks(vmax, mode)
  const formatTick = view === 'beschaeftigte' ? formatNumber : (v: number) => formatRevenue(v, null)
  const scale = document.createElement('div')
  scale.className = 'legende-skala'
  scale.textContent = `Höhe (${MODE_LABEL[mode]}): ${ticks.map(formatTick).join(' · ')}`
  el.appendChild(scale)

  // Obergrenzen-Hinweis, in derselben Prozent-Framing wie der Pflichthinweis
  // (`ui/notices.ts`) — bis 2026-08-13 stand hier eine Kantonssumme in
  // Beschäftigten absolut («Kantonssumme dadurch bis zu Y zu hoch»), obwohl
  // gar keine Kantonssumme mehr gezeichnet wird. Zwei verschiedene Framings
  // derselben Tatsache (Absolutwert hier, Median-Prozent im Pflichthinweis)
  // liessen den Betrachter zwei verschiedene Tatsachen vermuten.
  // `ambiguousCells` (Rohzahl Hektaren) und `overstatementPct` (Median/Max je
  // Gemeinde, siehe `domain/overstatement.ts`) sind unabhängige, zueinander
  // passende Fakten, keine zwei Versionen derselben Zahl.
  if (view === 'beschaeftigte' && ambiguousCells > 0) {
    const hint = document.createElement('div')
    hint.className = 'legende-hinweis'
    hint.textContent =
      `${formatNumber(ambiguousCells)} Hektaren zeigen den aufgerundeten Wert 4 — ` +
      `die Gemeindesummen sind dadurch im Median ${Math.round(overstatementPct.medianPct)} %, ` +
      `maximal ${Math.round(overstatementPct.maxPct)} % zu hoch.`
    el.appendChild(hint)
  }

  if (view === 'sichtbare') {
    const currency = document.createElement('div')
    currency.className = 'legende-hinweis'
    currency.textContent = CURRENCY_NOTE
    el.appendChild(currency)
  }

  const footer = document.createElement('div')
  footer.className = 'legende-quelle'
  footer.textContent = FOOTER
  el.appendChild(footer)

  if (view === 'sichtbare') {
    const footerCompanies = document.createElement('div')
    footerCompanies.className = 'legende-quelle'
    footerCompanies.textContent = FOOTER_COMPANIES
    el.appendChild(footerCompanies)
  }
}
