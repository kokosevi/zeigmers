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

/** Je Ansicht ein eigener Default. Ansicht B (Gemeinden) ist extrem schief
 *  verteilt und braucht die gedämpfte Skala (Exponent 0.4, siehe
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
 *  zuletzt in der anderen Ansicht eingestellt war. */
export const DEFAULT_MODE: Record<ViewName, ScaleMode> = {
  sichtbare: 'linear',
  beschaeftigte: 'logarithmisch',
}

/** Die URL je Ansicht — an einer Stelle, damit `createNav` unten und die
 *  Landing (`index.html`) nicht auseinanderlaufen können. Mit Schrägstrich am
 *  Ende: Netlify serviert `/firmen/` aus `dist/firmen/index.html` und leitet
 *  `/firmen` zusätzlich dorthin um; der direkte Pfad spart die Umleitung. */
export const VIEW_PATH: Record<ViewName, string> = {
  sichtbare: '/firmen/',
  beschaeftigte: '/beschaeftigte/',
}

const VIEW_LABEL: Record<ViewName, string> = {
  sichtbare: 'Börsennotierte Firmen',
  beschaeftigte: 'Beschäftigte',
}

const MODES: readonly ScaleMode[] = ['logarithmisch', 'linear']

/** Baut die Steuerung oben links. Zwei Gruppen mit unterschiedlicher Natur,
 *  deshalb unterschiedliche Semantik trotz gleicher Optik:
 *
 *  - Die Ansichten sind seit der Aufteilung in zwei Seiten **Navigation** —
 *    `<a>` in einem `<nav>`, die aktuelle Seite mit `aria-current="page"`.
 *    Ein `role="radiogroup"` wäre hier falsch: es verspricht eine Auswahl
 *    innerhalb der Seite, es ist aber ein Seitenwechsel.
 *  - Die Höhenskala bleibt eine echte Auswahl innerhalb der Seite und
 *    behält `role="radiogroup"` und `aria-checked`.
 *
 *  Ruft `onModeChange` einmal bei der Konstruktion auf — das übernimmt den
 *  ersten Render, ein zusätzlicher expliziter Aufruf beim Aufrufer wäre nur
 *  eine Wiederholung. */
export function createNav(
  view: ViewName,
  onModeChange: (mode: ScaleMode) => void,
): HTMLElement {
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
  return root
}
