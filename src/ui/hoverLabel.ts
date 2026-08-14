/** Change 4 (Hover auf Gemeinden): ein einzelnes, wiederverwendetes DOM-
 *  Element, das bei jedem `onHover`-Event nur Text und Position bekommt —
 *  kein Layer- oder Datenrebuild. `many.ts`s `onHover` feuert potenziell bei
 *  jeder Mausbewegung; ein neuer GeoJsonLayer je Event wäre teuer, ein
 *  `textContent`/`style`-Update auf einem bestehenden Element ist es nicht. */
function box(): HTMLElement {
  let el = document.getElementById('hover-label')
  if (!el) {
    el = document.createElement('div')
    el.id = 'hover-label'
    el.hidden = true
    document.getElementById('ui')?.appendChild(el)
  }
  return el
}

/** `x`/`y` sind Bildschirmkoordinaten aus deck.gls `PickingInfo` (relativ zum
 *  Karten-Canvas, der bei `#map { position: absolute; inset: 0 }` deckungsgleich
 *  mit dem Viewport ist) — direkt als `left`/`top` einer `position: fixed`
 *  verwendbar. */
export function showHoverLabel(name: string, x: number, y: number): void {
  const el = box()
  el.textContent = name
  el.style.left = `${x}px`
  el.style.top = `${y}px`
  el.hidden = false
}

export function hideHoverLabel(): void {
  const el = document.getElementById('hover-label')
  if (el) el.hidden = true
}
