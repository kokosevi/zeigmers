import type { PresentGroups } from '../domain/legendGroups'
import { NOGA_GROUPS, UNKNOWN_COLOR } from '../domain/noga.generated'
import { litTopFaceColor } from '../layers/litColor'
import { OUTLINE_COLOR } from '../layers/visible'
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

// Redesign Change 3 (2026-08-14): weder die Höhen-/Stützwerte-Zeile noch die
// Mehrdeutigkeits-Zeile stehen hier noch — beide sind entfallen (siehe
// `renderLegend` unten). `mode`, `vmax`, `ambiguousCells`, `overstatementPct`
// wurden darum aus `LegendOptions` entfernt statt sie unbenutzt mitzuführen;
// `main.ts` reicht sie entsprechend nicht mehr durch. Die Skala heisst im
// Button (`ui/toggle.ts`) und in der Eckbox (`ui/notices.ts`, mit der
// ehrlichen Formel) weiterhin «logarithmisch» — die Legende selbst nennt gar
// keinen Skalenmodus mehr, es gibt hier nichts mehr, das ihn bräuchte.
export interface LegendOptions {
  view: ViewName
  year: number
  /** Welche Branchengruppen (und ob "nicht bestimmbar") in der aktuellen
   *  Ansicht überhaupt vorkommen (Finding 2c) — von `main.ts` aus den
   *  tatsächlichen Rohdaten abgeleitet (`domain/legendGroups.ts`), nicht
   *  hartcodiert, damit ein Kantons- oder Jahreswechsel automatisch die
   *  richtige Teilmenge zeigt. */
  presentGroups: PresentGroups
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

/** Zeigt fix: Branchenfarben, graue Restkategorie, Datenjahr und die Einheit
 *  der aktuellen Ansicht. Wird bei jedem Wechsel von Ansicht oder Skala neu
 *  aufgerufen — die Legende ist ohne Interaktion sichtbar und aktualisiert
 *  sich mit. */
export function renderLegend(options: LegendOptions): void {
  const { view, year, presentGroups } = options
  const el = box()

  const title = document.createElement('div')
  title.className = 'legende-titel'
  title.textContent = `${UNIT_LABEL[view]} · Datenjahr ${year}`
  el.appendChild(title)

  const branchen = document.createElement('ul')
  branchen.className = 'legende-branchen'
  // Nur Gruppen, die in der aktuellen Ansicht tatsächlich eine Fläche/einen
  // Balken einfärben (Finding 2c) — nicht mehr alle elf gemessenen Gruppen
  // unabhängig davon, ob sie je vorkommen. Farbe kommt aus `litTopFaceColor`
  // (Finding 2a): derselbe Ton, den die beleuchtete Deckfläche tatsächlich
  // zeigt, nicht der rohe, ungeshadete Messwert.
  for (const [index, group] of NOGA_GROUPS.entries()) {
    if (!presentGroups.indices.includes(index)) continue
    branchen.appendChild(swatch(litTopFaceColor(group.color), group.label))
  }
  if (presentGroups.hasUnknown) {
    branchen.appendChild(swatch(litTopFaceColor(UNKNOWN_COLOR), 'nicht eindeutig bestimmbar'))
  }
  if (view === 'sichtbare') branchen.appendChild(outlineSwatch())
  el.appendChild(branchen)

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
  // zum Lesen braucht, die Eckbox, was man zum Vertrauen braucht". Die
  // Legende endet deshalb jetzt mit den Branchenfarben oben.
}
