import type { PresentGroups } from '../domain/legendGroups'
import { NOGA_GROUPS, UNKNOWN_COLOR } from '../domain/noga.generated'
import { litTopFaceColor } from '../layers/litColor'
import { OUTLINE_COLOR, UNRESEARCHED_MARKER_COLOR } from '../layers/visible'
import type { ViewName } from './nav'

const OUTLINE_LEGEND_TEXT =
  'Balken mit Rand: andere Kennzahl als Nettoumsatz (z. B. Geschäftsertrag einer Bank) — ' +
  'Höhe nicht direkt mit den unmarkierten Balken vergleichbar.'

// Phase 3: die flachen Marker (kein Balken, keine Branchenfarbe) sind eine
// eigene, dritte Kategorie neben den Branchenfarben und der Rand-Markierung
// oben — ohne eigenen Legendeneintrag liesse sich aus der Karte allein nicht
// ablesen, dass ein grauer Punkt etwas grundsätzlich anderes bedeutet als
// ein grauer ("nicht eindeutig bestimmbar") Balken.
// Elf Säulen (alle unter rund 19 Mio. CHF Umsatz) sitzen auf einer
// Sichtbarkeitsschwelle: darunter würden sie in der Kantonsplatte
// verschwinden. Ihre Höhe bildet den Umsatz dort nicht mehr ab, sondern nur
// noch, DASS es die Firma gibt — das gehört gesagt, sonst behauptet die
// Karte eine Grösse, die sie nicht misst.
const FLOOR_LEGEND_TEXT =
  'Kleinste Säulen: auf einer Mindesthöhe, damit sie sichtbar bleiben — ' +
  'unterhalb davon zeigt die Höhe nicht mehr den Umsatz. Genaue Zahl im Panel.'

const UNRESEARCHED_LEGEND_TEXT =
  'Kleiner Punkt: an der SIX kotiert, aber noch nicht recherchiert — Sitz bekannt, keine Höhenaussage.'

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
// Button (`ui/nav.ts`) und in der Eckbox (`ui/notices.ts`, mit der
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
  /** Kontext-Zusatz neben `UNIT_LABEL` in der Legenden-Titelzeile.
   *
   *  - Ansicht «Beschäftigte», Kantonsstufe: der Kantonsname (Schweiz-Stufe:
   *    `undefined`, alle 26, kein Einzelname nötig — Phase 2, nationale
   *    Navigation).
   *  - Ansicht «Börsennotierte Firmen» (seit Phase 3 national): die
   *    Abdeckungsangabe — ZWEI Zahlen, nicht nur eine ("127 von 224
   *    kotierten Titeln auf der Karte gezeigt, davon 8 recherchiert ·
   *    SIX-Stand …", aus `companies.json`s `stats` berechnet, siehe
   *    `main.ts`). Eine Zahl allein ("8 von 224 recherchiert") wäre
   *    unvollständig: eine Leserin, die die Marker auf der Karte zählt,
   *    sähe eine andere Zahl (die platzierten Marker, `stats.count`) als
   *    224 — Titel ohne eindeutigen Zefix-Sitz erscheinen gar nicht auf der
   *    Karte. Das ist Teil der Oberfläche, nicht nur der README: ohne diese
   *    Zeile liesse sich aus der Karte selbst weder ablesen, dass acht
   *    Säulen einen winzigen Ausschnitt aller kotierten Unternehmen zeigen,
   *    noch dass ein Teil der kotierten Titel überhaupt nicht auf der Karte
   *    erscheint. */
  scopeLabel?: string
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

/** Zeigt fix: Branchenfarben, graue Restkategorie, Datenjahr und die Einheit
 *  der aktuellen Ansicht. Wird bei jedem Wechsel von Ansicht oder Skala neu
 *  aufgerufen — die Legende ist ohne Interaktion sichtbar und aktualisiert
 *  sich mit. */
export function renderLegend(options: LegendOptions): void {
  const { view, year, presentGroups, scopeLabel } = options
  const el = box()

  const title = document.createElement('div')
  title.className = 'legende-titel'
  const scopePart = scopeLabel ? ` · ${scopeLabel}` : ''
  title.textContent = `${UNIT_LABEL[view]}${scopePart} · Datenjahr ${year}`
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
  if (view === 'sichtbare') {
    branchen.appendChild(outlineSwatch())
    branchen.appendChild(unresearchedSwatch())
    const floorNote = document.createElement('li')
    floorNote.textContent = FLOOR_LEGEND_TEXT
    branchen.appendChild(floorNote)
  }
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
