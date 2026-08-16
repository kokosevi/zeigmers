// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { showHoverLabel } from './hoverLabel'

// `showHoverLabel` hängt sich an `#ui` (siehe `box()` in `hoverLabel.ts`) —
// dasselbe Grundgerüst wie `legend.test.ts`.
beforeEach(() => {
  document.body.innerHTML = '<div id="ui"></div>'
})

describe('showHoverLabel', () => {
  it('zeigt zwei Zeilen', () => {
    showHoverLabel(['Nestlé S.A.', '89.49 Mrd. CHF · Industrie und Energie'], 10, 10)
    expect(document.querySelectorAll('#hover-label > span')).toHaveLength(2)
  })

  it('nimmt weiterhin eine einzelne Zeichenkette', () => {
    // Die unrecherchierten Marker haben nichts Zweites zu sagen.
    showHoverLabel('Beispiel AG', 10, 10)
    expect(document.querySelectorAll('#hover-label > span')).toHaveLength(1)
  })
})
