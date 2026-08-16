import { metricLabel, type Metric } from '../domain/metric'
import type { ScaleMode } from '../domain/scale'

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
// `ui/legend.ts` (`UNIT_LABEL`), `ui/notices.ts` und die Tests. Ihn
// mitzuziehen wäre für eine reine Label-Änderung unverhältnismässig.
export type ViewName = 'sichtbare' | 'beschaeftigte'

/** Je Ansicht ein eigener Default. Beide Ansichten sind extrem schief
 *  verteilt und brauchen die gedämpfte Skala (Exponent 0.4, siehe
 *  `domain/scale.ts`) — seit Change 6 eine Potenzskala, nicht mehr die
 *  ursprüngliche echte Logarithmusskala.
 *
 *  Namensstand (Redesign Change 5, 2026-08-14): Schlüssel und Button-Label
 *  heissen wieder `'logarithmisch'` — der vertraute Name aus jeder anderen
 *  Kartenanwendung, an der Stelle, an der Nutzende navigieren. Das ist eine
 *  reine Umbenennung, keine Rückkehr zur echten `log10`-Skala: die Formel
 *  bleibt `(v/vmax)**0.4` (siehe `domain/scale.ts`). Die ehrliche Herkunft
 *  der Formel steht in der Eckbox (`ui/notices.ts`), nicht im Button.
 *
 *  Seit der Aufteilung in zwei Seiten (2026-08-15) gilt je Seite genau ein
 *  Eintrag; die zuletzt gewählte Skala überlebt einen Seitenwechsel nicht
 *  mehr, weil der Wechsel jetzt ein echter Seitenaufbau ist. Beide Ansichten
 *  starten damit immer in ihrem fachlich richtigen Default statt in dem, was
 *  zuletzt in der anderen Ansicht eingestellt war.
 *
 *  Task 12 (2026-08-16): `sichtbare` wechselt von `'linear'` auf
 *  `'logarithmisch'` — gemessen, nicht vermutet: bei linearer Skala sitzen
 *  153 der 188 Säulen auf der Mindesthöhe (dominiert vom Grössenunterschied
 *  zwischen den grössten Konzernen und dem Gros der übrigen kotierten
 *  Firmen), die Karte öffnete mit zwei sichtbaren Säulen und einem Feld
 *  gleich hoher Stummel. Derselbe Befund, der Ansicht «Beschäftigte» schon
 *  immer den gedämpften Default gab, gilt für «Börsennotierte Firmen» also
 *  ebenso — beide Ansichten stehen jetzt aus demselben Grund auf
 *  `'logarithmisch'`, keine ist mehr die Ausnahme. */
export const DEFAULT_MODE: Record<ViewName, ScaleMode> = {
  sichtbare: 'logarithmisch',
  beschaeftigte: 'logarithmisch',
}

/** Die URL je Ansicht — an einer Stelle, damit `createNav` unten und die
 *  Landing (`index.html`) nicht auseinanderlaufen können. Mit Schrägstrich am
 *  Ende: Netlify serviert `/firmen/` aus `dist/firmen/index.html` und leitet
 *  `/firmen` zusätzlich dorthin um; der direkte Pfad spart die Umleitung.
 *
 *  Abschluss-Review, Fund 8 (2026-08-15): `index.html` selbst ist bewusst
 *  ohne eine Zeile JavaScript gebaut und kann diese Konstante deshalb nie
 *  importieren — das Auseinanderlaufen wird stattdessen dort verhindert, wo
 *  es sich prüfen lässt: `src/landing.test.ts` importiert `VIEW_PATH` und
 *  vergleicht es mit den in `index.html` verlinkten Pfaden, statt sie dort
 *  ein zweites Mal als Literal zu wiederholen. */
export const VIEW_PATH: Record<ViewName, string> = {
  sichtbare: '/firmen/',
  beschaeftigte: '/beschaeftigte/',
}

const VIEW_LABEL: Record<ViewName, string> = {
  sichtbare: 'Börsennotierte Firmen',
  beschaeftigte: 'Beschäftigte',
}

const MODES: readonly ScaleMode[] = ['logarithmisch', 'linear']

/** Übersetzt den internen Organisationsform-Schlüssel (aus `companies.json`,
 *  `stats.orgForms`) in die Anzeige. `Record<string, string>`, nicht
 *  `Record<OrgForm, string>`: welche Formen es gibt, kommt zur Laufzeit aus
 *  den Daten, nicht aus einer im Code aufgezählten Menge — ein unbekannter
 *  Schlüssel bräuchte sonst entweder einen Compile-Fehler (verträgt sich
 *  nicht mit datengetriebenen Werten) oder eine leere Schaltfläche. Aufrufer
 *  greifen deshalb mit `ORG_FORM_LABEL[key] ?? key` zu (siehe unten) — ein
 *  unbekannter Schlüssel zeigt sich als eigener, unübersetzter Text statt als
 *  Leerstelle. */
export const ORG_FORM_LABEL: Record<string, string> = {
  boersenkotiert: 'Börsenkotiert',
}

/** Optionen für `createNav`. `metrics`/`orgForms` sind optional und bewusst
 *  unabhängig voneinander: welche Seite welche Gruppe zeigt, entscheidet die
 *  Aufrufstelle (`karte/basis.ts`, `mountNav`) über das, was sie übergibt —
 *  nicht `createNav` über `view`. Die Beschäftigten-Seite übergibt heute
 *  keine der beiden Optionen, deshalb erscheinen dort weder Kennzahl- noch
 *  Organisationsform-Gruppe. */
export interface NavOptions {
  view: ViewName
  metrics?: { available: readonly Metric[]; onChange: (metric: Metric) => void }
  orgForms?: { available: readonly string[]; onChange: (forms: ReadonlySet<string>) => void }
  onModeChange: (mode: ScaleMode) => void
}

/** Baut die Steuerung oben links. Bis zu vier Gruppen mit unterschiedlicher
 *  Natur, deshalb unterschiedliche Semantik trotz teils gleicher Optik:
 *
 *  - Die Ansichten sind seit der Aufteilung in zwei Seiten **Navigation** —
 *    `<a>` in einem `<nav>`, die aktuelle Seite mit `aria-current="page"`.
 *    Ein `role="radiogroup"` wäre hier falsch: es verspricht eine Auswahl
 *    innerhalb der Seite, es ist aber ein Seitenwechsel.
 *  - Die Höhenskala bleibt eine echte Auswahl innerhalb der Seite und
 *    behält `role="radiogroup"` und `aria-checked`.
 *  - Die Kennzahl ist wie die Höhenskala eine Auswahl von genau **einer**
 *    Option (die Säule trägt immer nur eine Grösse gleichzeitig) — deshalb
 *    dasselbe Muster: `role="radiogroup"`, `aria-checked` je Knopf.
 *  - Die Organisationsform ist dagegen eine **Mehrfachauswahl** (mehrere
 *    Formen können gleichzeitig sichtbar sein) — kein `radiogroup`, sondern
 *    `role="group"` mit unabhängigen Umschaltknöpfen (`aria-pressed` je
 *    Knopf). `role="group"` statt der impliziten `<div>`-Rolle `generic`,
 *    weil nur benannte Rollen ein `aria-label` zuverlässig tragen (siehe
 *    Begründung unten bei der Organisationsform-Gruppe). Sie erscheint auch
 *    mit nur einem Wert: der Knopf zeigt heute schon die Richtung, in der
 *    später weitere Organisationsformen dazukommen, auch wenn er mit einem
 *    einzigen Wert noch nichts filtert.
 *
 *  Ruft `onModeChange` — und, falls übergeben, `metrics.onChange` und
 *  `orgForms.onChange` — je einmal bei der Konstruktion auf: das übernimmt
 *  den ersten Render, ein zusätzlicher expliziter Aufruf beim Aufrufer wäre
 *  nur eine Wiederholung. */
export function createNav(options: NavOptions): HTMLElement {
  const { view, onModeChange } = options
  let mode: ScaleMode = DEFAULT_MODE[view]

  const root = document.createElement('div')
  root.id = 'steuerung'

  const marke = document.createElement('a')
  marke.className = 'marke'
  marke.href = '/'
  marke.textContent = 'zeigmers'
  root.appendChild(marke)

  const ansichten = document.createElement('nav')
  ansichten.className = 'gruppe'
  ansichten.setAttribute('aria-label', 'Ansicht')
  for (const name of ['sichtbare', 'beschaeftigte'] as const) {
    const link = document.createElement('a')
    link.className = 'ansicht'
    link.href = VIEW_PATH[name]
    link.textContent = VIEW_LABEL[name]
    if (name === view) {
      link.classList.add('aktiv')
      link.setAttribute('aria-current', 'page')
    }
    ansichten.appendChild(link)
  }
  root.appendChild(ansichten)

  const skala = document.createElement('div')
  skala.className = 'gruppe'
  skala.setAttribute('role', 'radiogroup')
  skala.setAttribute('aria-label', 'Höhenskala')
  const buttons = MODES.map((name) => {
    const button = document.createElement('button')
    button.dataset.mode = name
    button.textContent = name
    skala.appendChild(button)
    return button
  })
  root.appendChild(skala)

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

  // Kennzahl: nur gerendert, wenn die Aufrufstelle Kennzahlen übergibt
  // (heute nur die Firmenseite, siehe `karte/firmen.ts` — die
  // Beschäftigten-Seite kennt keine Kennzahlwahl, ihre Säule ist immer die
  // Kopfzahl). Gleiche Semantik wie die Höhenskala oben: genau eine Option
  // aktiv, `role="radiogroup"` und `aria-checked`.
  if (options.metrics) {
    const { available, onChange: onMetricChange } = options.metrics
    let metric: Metric = available[0]!

    const kennzahl = document.createElement('div')
    kennzahl.className = 'gruppe'
    kennzahl.setAttribute('role', 'radiogroup')
    kennzahl.setAttribute('aria-label', 'Kennzahl')
    const metricButtons = available.map((name) => {
      const button = document.createElement('button')
      button.dataset.metric = name
      button.textContent = metricLabel(name)
      kennzahl.appendChild(button)
      return button
    })
    root.appendChild(kennzahl)

    const syncMetric = () => {
      for (const button of metricButtons) {
        const active = button.dataset.metric === metric
        button.classList.toggle('aktiv', active)
        button.setAttribute('aria-checked', String(active))
      }
      onMetricChange(metric)
    }

    kennzahl.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button')
      if (!button?.dataset.metric) return
      metric = button.dataset.metric as Metric
      syncMetric()
    })

    syncMetric()
  }

  // Organisationsform: wie die Kennzahl nur gerendert, wenn übergeben.
  // Anders als Ansicht/Höhenskala/Kennzahl ist das hier eine Mehrfachauswahl
  // (mehrere Formen gleichzeitig sichtbar) — deshalb kein `radiogroup`,
  // sondern unabhängige Umschaltknöpfe mit `aria-pressed`. `role="group"`
  // statt der impliziten `<div>`-Rolle `generic`: die ARIA-Spezifikation
  // verbietet Autoren die Namensvergabe an `generic` — ein `aria-label` ohne
  // passende Rolle würde von Screenreadern nicht zuverlässig vorgelesen, der
  // Gruppenname («Organisationsform») ginge verloren und übrig bliebe nur
  // «Börsenkotiert, Umschalter» ohne Kontext, wovon das eine Gruppe ist.
  // `role="group"` ist die für eine Sammlung unabhängiger Umschalter
  // passende Rolle und erlaubt die Namensvergabe. Startzustand: alle
  // verfügbaren Formen ausgewählt, die Karte startet ungefiltert.
  if (options.orgForms) {
    const { available, onChange: onOrgFormChange } = options.orgForms
    const selected = new Set<string>(available)

    const organisationsform = document.createElement('div')
    organisationsform.className = 'gruppe'
    organisationsform.setAttribute('role', 'group')
    organisationsform.setAttribute('aria-label', 'Organisationsform')
    const orgFormButtons = available.map((form) => {
      const button = document.createElement('button')
      button.dataset.orgform = form
      // Unbekannter Schlüssel fällt auf sich selbst zurück, statt eine leere
      // Schaltfläche zu zeigen (siehe `ORG_FORM_LABEL` oben).
      button.textContent = ORG_FORM_LABEL[form] ?? form
      organisationsform.appendChild(button)
      return button
    })
    root.appendChild(organisationsform)

    const syncOrgForms = () => {
      for (const button of orgFormButtons) {
        const active = selected.has(button.dataset.orgform!)
        button.classList.toggle('aktiv', active)
        button.setAttribute('aria-pressed', String(active))
      }
      onOrgFormChange(new Set(selected))
    }

    organisationsform.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button')
      const form = button?.dataset.orgform
      if (!form) return
      if (selected.has(form)) selected.delete(form)
      else selected.add(form)
      syncOrgForms()
    })

    syncOrgForms()
  }

  return root
}
