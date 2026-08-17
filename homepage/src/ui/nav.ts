import { type Metric } from '../domain/metric'
import type { ScaleMode } from '../domain/scale'
import { abschnitt, label } from './leiste'

// Interner Schlüssel folgt dem sichtbaren Namen: die Ansicht hiess bis zu
// ihrer Umbenennung «Die Vielen» und der Schlüssel entsprechend `viele`. Ein
// Name-ohne-passenden-Schlüssel wäre genau die Art Drift, die die nächste
// Leserin fehlleitet — deshalb wurde `viele` mitumbenannt, nicht nur das Label.
//
// Ausnahme, bewusst: Change 6 (2026-08-14) benennt das sichtbare Label «Die
// Sichtbaren» → «Börsennotierte Firmen» um, der interne Schlüssel `sichtbare`
// bleibt. Eine Umbenennung hätte hier keinen Gewinn: anders als bei `viele` →
// `beschaeftigte` (Einheit vs. Anzeigename) trägt `sichtbare` keine
// Zahl/Einheit, die aus dem Tritt geraten könnte — er ist nur ein interner
// Bezeichner für die Firmenansicht, und zieht sich durch `layers/visible.ts`,
// `ui/legend.ts`, `ui/notices.ts` und die Tests. Ihn mitzuziehen wäre für eine
// reine Label-Änderung unverhältnismässig.
export type ViewName = 'sichtbare' | 'beschaeftigte'

/** Je Ansicht ein eigener Default. Beide Ansichten sind extrem schief
 *  verteilt und brauchen die gedämpfte Skala (Exponent 0.4, siehe
 *  `domain/scale.ts`) — seit Change 6 eine Potenzskala, nicht mehr die
 *  ursprüngliche echte Logarithmusskala.
 *
 *  Task 12 (2026-08-16): `sichtbare` wechselte von `'linear'` auf
 *  `'logarithmisch'` — gemessen, nicht vermutet: bei linearer Skala sass die
 *  überwiegende Mehrheit der Säulen auf der Mindesthöhe, die Karte öffnete mit
 *  zwei sichtbaren Säulen und einem Feld gleich hoher Stummel. Derselbe
 *  Befund, der Ansicht «Beschäftigte» schon immer den gedämpften Default gab.
 *  Die aktuelle Zahl dazu steht nicht mehr hier als Kommentar, sondern
 *  sichtbar in der Leiste (`heightNote` unten) — dort wird sie bei jedem Aufruf
 *  aus den geladenen Artefakten gerechnet statt als Kommentar zu veralten.
 *
 *  Die Schlüssel heissen weiterhin `'logarithmisch'`/`'linear'`, weil
 *  `domain/scale.ts` sie so führt; die Leiste zeigt seit dem Redesign
 *  «gedämpft» statt «logarithmisch» (siehe `MODE_LABEL`) — das ist der
 *  ehrlichere Name für eine Potenzfunktion mit Exponent 0.4, und die
 *  tatsächliche Formel steht bei den Vorbehalten (`ui/notices.ts`). */
export const DEFAULT_MODE: Record<ViewName, ScaleMode> = {
  sichtbare: 'logarithmisch',
  beschaeftigte: 'logarithmisch',
}

/** Die URL je Ansicht — an einer Stelle, damit die Kartenseiten und die
 *  Landing (`index.html`) nicht auseinanderlaufen können. Mit Schrägstrich am
 *  Ende: Netlify serviert `/firmen/` aus `dist/firmen/index.html` und leitet
 *  `/firmen` zusätzlich dorthin um; der direkte Pfad spart die Umleitung.
 *
 *  Abschluss-Review, Fund 8 (2026-08-15): `index.html` selbst ist bewusst
 *  ohne eine Zeile JavaScript gebaut und kann diese Konstante deshalb nie
 *  importieren — das Auseinanderlaufen wird stattdessen dort verhindert, wo
 *  es sich prüfen lässt: `src/landing.test.ts` importiert `VIEW_PATH` und
 *  vergleicht es mit den in `index.html` verlinkten Pfaden. */
export const VIEW_PATH: Record<ViewName, string> = {
  sichtbare: '/firmen/',
  beschaeftigte: '/beschaeftigte/',
}

/** Der Ansichtsname im Leistenkopf, unter der Wortmarke. Ersetzt den
 *  Ansichts-Umschalter, der am 17. August 2026 entfallen ist: er sagte, welche
 *  zwei Karten es gibt, aber nicht, auf welcher man steht. Diese Zeile sagt
 *  das Zweite; das Erste sagt die Landing. */
const ANSICHT_LABEL: Record<ViewName, string> = {
  sichtbare: 'Börsennotierte Firmen',
  beschaeftigte: 'Beschäftigte',
}

const MODES: readonly ScaleMode[] = ['logarithmisch', 'linear']

/** «gedämpft» statt «logarithmisch» im Umschalter (Handoff 1b, Nadel 4).
 *  `'logarithmisch'` war schon vorher der falsche Name für eine Potenzfunktion
 *  mit Exponent 0.4 — er stand da, weil er aus anderen Kartenanwendungen
 *  vertraut ist. «gedämpft» beschreibt, was tatsächlich passiert, und passt zu
 *  der Zeile darunter, die den Grund nennt. Der Schlüssel bleibt unverändert,
 *  `domain/scale.ts` ist nicht Teil dieses Umbaus. */
const MODE_LABEL: Record<ScaleMode, string> = {
  logarithmisch: 'gedämpft',
  linear: 'linear',
}

/** «Personal» statt «Mitarbeitende» — nur hier, nur in dieser Zelle.
 *  Der Entwurf setzt drei Zellen auf 264 px Leistenbreite; «Mitarbeitende»
 *  bricht dort um. `metricLabel()` (`domain/metric.ts`) bleibt für Legende,
 *  Panel, Hover und Summenzeile die Quelle des vollen Namens — dieses kurze
 *  Label gilt ausschliesslich für den Umschalter, nicht für die Aussage über
 *  die Daten. */
const METRIC_SEGMENT_LABEL: Record<Metric, string> = {
  umsatz: 'Umsatz',
  mitarbeitende: 'Personal',
  gewinn: 'Gewinn',
}

/** Die Zahlen für die Zeile unter dem Höhen-Umschalter. Sie kommen von der
 *  Seite, nicht aus diesem Modul: wie viele Säulen bei linearer Skala auf der
 *  Mindesthöhe sitzen, ist eine Aussage über die geladenen Daten und wird dort
 *  gerechnet, wo die Daten liegen (`karte/firmen.ts`). Hier steht nur der
 *  Satz, in dem sie erscheinen. */
export interface HeightNote {
  /** Säulen, deren Höhe bei linearer Skala auf die Mindesthöhe fällt. */
  flach: number
  /** Säulen mit einem Wert in der aktiven Kennzahl überhaupt. */
  total: number
}

export interface NavOptions {
  view: ViewName
  metrics?: { available: readonly Metric[]; onChange: (metric: Metric) => void }
  /** Fehlt sie, erscheint die Zeile unter dem Höhen-Umschalter nicht —
   *  `/beschaeftigte/` übergibt keine (und hat seit dem 17. August 2026 auch
   *  keinen Massstab auf der Karte mehr; das Modul `ui/massstab.ts` ist
   *  gelöscht, die Git-Historie hat es). */
  heightNote?: HeightNote
  onModeChange: (mode: ScaleMode) => void
}

/** Baut Kopf und Segment-Umschalter der Leiste.
 *
 *  Zwei Gruppen, beide mit derselben Semantik: `role="radiogroup"` und
 *  `aria-checked` je Zelle — Kennzahl und Höhe sind je eine Auswahl von genau
 *  **einer** Option (die Säule trägt immer nur eine Grösse und eine Skala
 *  gleichzeitig).
 *
 *  Was hier entfallen ist, und wohin es gegangen ist:
 *  - Der **Ansichts-Umschalter** (17. August 2026): ersatzlos, der Weg von
 *    einer Karte zur anderen läuft über die Wortmarke und die Landing. Der
 *    Ansichtsname steht jetzt als Zeile im Kopf (`ANSICHT_LABEL`).
 *  - Die **Organisationsform-Gruppe** (Redesign, Handoff 1b, Nadel 6): sie
 *    hatte genau einen Wert (`boersenkotiert`) und filterte damit nichts. Der
 *    Filterpfad selbst bleibt bestehen (`domain/selection.ts`,
 *    `Selection.orgForms`, und `karte/firmen.ts` übergibt weiterhin alle
 *    vorkommenden Formen) — nur die Schaltflächen verschwinden, bis ein
 *    zweiter Wert existiert. `ORG_FORM_LABEL` ist damit vorläufig
 *    gegenstandslos und mitentfernt; die Übersetzung `boersenkotiert` →
 *    «Börsenkotiert» steht in der Git-Historie, wenn die Gruppe zurückkommt.
 *
 *  Ruft `onModeChange` — und, falls übergeben, `metrics.onChange` — je einmal
 *  bei der Konstruktion auf: das übernimmt den ersten Render. */
export function createNav(options: NavOptions): void {
  const { view, onModeChange } = options
  let mode: ScaleMode = DEFAULT_MODE[view]

  // ---- Kopf: Pfeil zurück, Wortmarke und Ansichtsname ----
  const kopf = abschnitt('kopf')
  // Der Pfeil (Auftrag vom 17. August 2026) macht den Rückweg sichtbar, den
  // die Wortmarke schon trug — dass «zeigmers» ein Link auf die Landing ist,
  // sieht man ihr nicht an. Beide führen auf `/`; der Pfeil ist ein eigenes
  // Element mit eigenem `aria-label`, damit ein Screenreader «Zur Startseite»
  // liest statt zweimal «zeigmers».
  const zeile = document.createElement('div')
  zeile.className = 'leiste-kopfzeile'
  const zurueck = document.createElement('a')
  zurueck.className = 'leiste-zurueck'
  zurueck.href = '/'
  zurueck.setAttribute('aria-label', 'Zur Startseite')
  zurueck.textContent = '←'
  const marke = document.createElement('a')
  marke.className = 'leiste-marke'
  marke.href = '/'
  marke.textContent = 'zeigmers'
  zeile.append(zurueck, marke)
  const ansicht = document.createElement('span')
  ansicht.className = 'leiste-ansicht'
  ansicht.textContent = ANSICHT_LABEL[view]
  kopf.append(zeile, ansicht)

  // ---- Gruppen: Kennzahl (optional) und Höhe ----
  const gruppen = abschnitt('gruppen')

  if (options.metrics) {
    const { available, onChange: onMetricChange } = options.metrics
    let metric: Metric = available[0]!

    const segment = document.createElement('div')
    segment.className = 'leiste-segment'
    segment.style.gridTemplateColumns = `repeat(${available.length}, 1fr)`
    segment.setAttribute('role', 'radiogroup')
    segment.setAttribute('aria-label', 'Kennzahl')
    const metricButtons = available.map((name) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.metric = name
      button.setAttribute('role', 'radio')
      button.textContent = METRIC_SEGMENT_LABEL[name]
      segment.appendChild(button)
      return button
    })
    gruppen.append(label('Kennzahl'), segment)

    const syncMetric = () => {
      for (const button of metricButtons) {
        const active = button.dataset.metric === metric
        button.classList.toggle('aktiv', active)
        button.setAttribute('aria-checked', String(active))
      }
      onMetricChange(metric)
    }

    segment.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button')
      if (!button?.dataset.metric) return
      metric = button.dataset.metric as Metric
      syncMetric()
    })

    syncMetric()
  }

  const skala = document.createElement('div')
  skala.className = 'leiste-segment'
  skala.style.gridTemplateColumns = `repeat(${MODES.length}, 1fr)`
  skala.setAttribute('role', 'radiogroup')
  skala.setAttribute('aria-label', 'Höhe')
  const buttons = MODES.map((name) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.mode = name
    button.setAttribute('role', 'radio')
    button.textContent = MODE_LABEL[name]
    skala.appendChild(button)
    return button
  })
  gruppen.append(label('Höhe'), skala)

  // Die Zeile, die die Massstabskarte auf `/firmen/` ersetzt: warum «gedämpft»
  // der Startwert ist, in einem Satz, mit Zahlen aus den geladenen Artefakten.
  if (options.heightNote) {
    const { flach, total } = options.heightNote
    const notiz = document.createElement('p')
    notiz.className = 'leiste-notiz'
    notiz.textContent = `Gedämpft, sonst wären ${flach} von ${total} Säulen gleich flach.`
    gruppen.appendChild(notiz)
  }

  const sync = () => {
    for (const button of buttons) {
      const active = button.dataset.mode === mode
      button.classList.toggle('aktiv', active)
      button.setAttribute('aria-checked', String(active))
    }
    onModeChange(mode)
  }

  skala.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('button')
    if (!button?.dataset.mode) return
    mode = button.dataset.mode as ScaleMode
    sync()
  })

  sync()
}
