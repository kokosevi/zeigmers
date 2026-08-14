import type { ScaleMode } from '../domain/scale'

// Interner Schlüssel folgt dem sichtbaren Namen: die Ansicht hiess bis zu
// ihrer Umbenennung «Die Vielen» und der Schlüssel entsprechend `viele`. Ein
// Name-ohne-passenden-Schlüssel wäre genau die Art Drift, die die nächste
// Leserin fehlleitet — deshalb wurde `viele` mitumbenannt, nicht nur das Label.
export type ViewName = 'sichtbare' | 'beschaeftigte'

/** Je Ansicht ein eigener Default. Ansicht B ist extrem schief verteilt und
 *  braucht die logarithmische Skala; Ansicht A hat acht Balken, die logarithmisch
 *  alle zwischen 82 % und 100 % der Hoehe laegen -- Faktor 66 im Umsatz wuerde
 *  zu 22 % im Bild. Die zuletzt gewaehlte Skala bleibt je Ansicht erhalten. */
export const DEFAULT_MODE: Record<ViewName, ScaleMode> = {
  sichtbare: 'linear',
  beschaeftigte: 'log',
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
      <button data-view="sichtbare">Die Sichtbaren</button>
      <button data-view="beschaeftigte">Beschäftigte</button>
    </div>
    <div class="gruppe" role="radiogroup" aria-label="Höhenskala">
      <button data-mode="log">logarithmisch</button>
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
