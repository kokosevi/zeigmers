/** Die Zoom-Gruppe rechts unten — drei Zellen in einer Spalte: `+`, `−`, `N`.
 *
 *  Ersetzt MapLibres `NavigationControl` (siehe `map.ts` für die ausführliche
 *  Begründung: der Entwurf verlangt eine Fläche ohne Radien und Schatten, und
 *  das wäre am fremden Control nur durch Zurücknehmen seines eigenen CSS über
 *  Selektoren zu erreichen gewesen, die bei einem Update anders heissen
 *  können).
 *
 *  Anders als die übrigen Oberflächen-Bausteine wird diese Gruppe **einmal**
 *  gebaut und nicht bei jedem `render()` neu: sie hängt an keinem Zustand der
 *  Seite — weder an der Auswahl noch an der Kennzahl noch an der Stufe. Ein
 *  Neuaufbau bei jedem Filterklick würde nur dieselben drei Knöpfe wieder
 *  erzeugen und dabei den Tastaturfokus verlieren, falls er gerade auf einem
 *  von ihnen liegt. */

export interface ZoomOptions {
  onZoomIn: () => void
  onZoomOut: () => void
  onResetNorth: () => void
}

/** Zeichen und Beschriftung je Knopf. Die Zeichen sind Text, kein Icon-Paket
 *  und keine SVG: `+`, das typografische Minus `−` (U+2212, nicht der
 *  Bindestrich — der sitzt in der Mono-Schrift zu hoch und zu kurz) und `N`.
 *  `aria-label` trägt den ganzen Satz, weil «N» allein vorgelesen nichts
 *  aussagt. */
const KNOEPFE: readonly { zeichen: string; label: string; aktion: keyof ZoomOptions }[] = [
  { zeichen: '+', label: 'Hineinzoomen', aktion: 'onZoomIn' },
  { zeichen: '−', label: 'Herauszoomen', aktion: 'onZoomOut' },
  { zeichen: 'N', label: 'Norden zurücksetzen', aktion: 'onResetNorth' },
]

export function renderZoom(options: ZoomOptions): void {
  // Nur beim ersten Aufruf bauen (siehe Moduldokumentation oben).
  if (document.getElementById('zoom')) return

  const el = document.createElement('div')
  el.id = 'zoom'
  el.setAttribute('role', 'group')
  el.setAttribute('aria-label', 'Kartenansicht')

  for (const { zeichen, label, aktion } of KNOEPFE) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = zeichen
    button.setAttribute('aria-label', label)
    button.addEventListener('click', () => options[aktion]())
    el.appendChild(button)
  }

  document.getElementById('ui')?.appendChild(el)
}
