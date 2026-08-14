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
 *  `domain/scale.ts`, ersetzt seit Change 6 die frühere logarithmische
 *  Skala). Ansicht A behält ihren Default `linear` (Auftrag, unverändert) —
 *  acht Firmen, deren Umsätze linear zwischen 1.5 % und 100 % der Höhe lägen.
 *  Schaltet man dort manuell auf `gedaempft`, verhält sich die Skala trotzdem
 *  sinnvoll: dieselben acht Balken liegen dann zwischen rund 19 % und 100 %
 *  (Faktor 5.3) — spürbar milder als es die frühere logarithmische Skala dort
 *  gewesen wäre (82 %–100 %, Faktor 66 im Umsatz auf nur 22 % im Bild). Die
 *  zuletzt gewaehlte Skala bleibt je Ansicht erhalten. */
export const DEFAULT_MODE: Record<ViewName, ScaleMode> = {
  sichtbare: 'linear',
  beschaeftigte: 'gedaempft',
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
      <button data-mode="gedaempft">gedämpft</button>
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
