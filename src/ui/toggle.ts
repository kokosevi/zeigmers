import type { ScaleMode } from '../domain/scale'

// Interner Schlüssel folgt dem sichtbaren Namen: die Ansicht hiess bis zu
// ihrer Umbenennung «Die Vielen» und der Schlüssel entsprechend `viele`. Ein
// Name-ohne-passenden-Schlüssel wäre genau die Art Drift, die die nächste
// Leserin fehlleitet — deshalb wurde `viele` mitumbenannt, nicht nur das Label.
//
// Ausnahme, bewusst: Change 6 (2026-08-14) benennt das sichtbare Label «Die
// Sichtbaren» → «Börsennotierte Firmen» um (unten im Template), der interne
// Schlüssel `sichtbare` bleibt. Eine Umbenennung hätte hier keinen Gewinn:
// anders als bei `viele` → `beschaeftigte` (Einheit vs. Anzeigename) trägt
// `sichtbare` keine Zahl/Einheit, die aus dem Tritt geraten könnte — er ist
// nur ein interner Bezeichner für „die achtköpfige Firmenansicht", und zieht
// sich durch `layers/visible.ts`, `ui/legend.ts` (`UNIT_LABEL`), Tests
// (`panel.test.ts`) und `main.ts`. Ihn mitzuziehen wäre für eine reine
// Label-Änderung unverhältnismässig.
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
 *  bleibt `(v/vmax)**0.4` (siehe `domain/scale.ts` für die ausführliche
 *  Begründung inkl. Gegenprobe mit einem gefitteten Logarithmus). Die
 *  ehrliche Herkunft der Formel steht seither in der Eckbox
 *  (`ui/notices.ts`), nicht mehr im Button oder in der Legende.
 *
 *  Ansicht A behält ihren Default `linear` (Auftrag, unverändert) — acht
 *  Firmen, deren Umsätze linear zwischen 1.5 % und 100 % der Höhe lägen.
 *  Schaltet man dort manuell auf `logarithmisch`, verhält sich die Skala
 *  trotzdem sinnvoll: dieselben acht Balken liegen dann zwischen rund 19 %
 *  und 100 % (Faktor 5.3) — spürbar milder als es die ursprüngliche echte
 *  Logarithmusskala dort gewesen wäre (82 %–100 %, Faktor 66 im Umsatz auf
 *  nur 22 % im Bild). Die zuletzt gewählte Skala bleibt je Ansicht erhalten. */
export const DEFAULT_MODE: Record<ViewName, ScaleMode> = {
  sichtbare: 'linear',
  beschaeftigte: 'logarithmisch',
}

export function createToggle(
  onChange: (view: ViewName, mode: ScaleMode) => void,
): HTMLElement {
  let view: ViewName = 'beschaeftigte'
  const modes: Record<ViewName, ScaleMode> = { ...DEFAULT_MODE }

  const root = document.createElement('div')
  root.id = 'steuerung'
  root.innerHTML = `
    <div class="gruppe" role="radiogroup" aria-label="Ansicht">
      <button data-view="sichtbare">Börsennotierte Firmen</button>
      <button data-view="beschaeftigte">Beschäftigte</button>
    </div>
    <div class="gruppe" role="radiogroup" aria-label="Höhenskala">
      <button data-mode="logarithmisch">logarithmisch</button>
      <button data-mode="linear">linear</button>
    </div>`

  const sync = () => {
    for (const button of root.querySelectorAll<HTMLButtonElement>('button')) {
      const active =
        button.dataset.view === view || button.dataset.mode === modes[view]
      button.classList.toggle('aktiv', active)
      button.setAttribute('aria-checked', String(active))
    }
    onChange(view, modes[view])
  }

  root.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('button')
    if (!button) return
    if (button.dataset.view) view = button.dataset.view as ViewName
    if (button.dataset.mode) modes[view] = button.dataset.mode as ScaleMode
    sync()
  })

  sync()
  return root
}
