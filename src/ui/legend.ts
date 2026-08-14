import { NOGA_GROUPS, UNKNOWN_COLOR } from '../domain/noga.generated'
import type { OverstatementStats } from '../domain/overstatement'
import { referenceTicks, type ScaleMode } from '../domain/scale'
import { OUTLINE_COLOR } from '../layers/visible'
import { formatNumber, formatRevenue } from './format'
import type { ViewName } from './toggle'

const OUTLINE_LEGEND_TEXT =
  'Balken mit Rand: andere Kennzahl als Nettoumsatz (z. B. Geschäftsertrag einer Bank) — ' +
  'Höhe nicht direkt mit den unmarkierten Balken vergleichbar.'

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

  // Währungshinweis und Quellenangabe standen bis zum Redesign (2026-08-14)
  // hier — Change 2/3 verschiebt beide in die Eckbox (`ui/notices.ts`):
  // „die Legende trägt, was man zum Lesen braucht, die Eckbox, was man zum
  // Vertrauen braucht". Die Legende endet deshalb jetzt mit der Skala bzw.
  // dem Obergrenzen-Hinweis oben.
}
