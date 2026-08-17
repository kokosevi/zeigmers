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
 *  verwendbar.
 *
 *  `lines` nimmt sowohl eine einzelne Zeichenkette als auch mehrere entgegen
 *  (Task 16): die unrecherchierten Marker haben nur einen Namen zu zeigen,
 *  die recherchierten Firmen zusätzlich Kennzahl und Branche — je Zeile ein
 *  eigenes `<span>` statt `textContent`, sonst liesse sich die zweite Zeile
 *  in CSS nicht kleiner und in `--tinte-leise` setzen (siehe `style.css`,
 *  `#hover-label > span`). Bestehende Aufrufstellen mit einer einzelnen
 *  Zeichenkette bleiben unverändert lauffähig, ohne selbst ein Array zu
 *  bauen. */
export function showHoverLabel(lines: string | readonly string[], x: number, y: number): void {
  const el = box()
  const rows = typeof lines === 'string' ? [lines] : lines
  el.replaceChildren(
    ...rows.map((line) => {
      const span = document.createElement('span')
      span.textContent = line
      return span
    }),
  )
  el.style.left = `${x}px`
  el.style.top = `${y}px`
  el.hidden = false
}

export function hideHoverLabel(): void {
  const el = document.getElementById('hover-label')
  if (el) el.hidden = true
}
