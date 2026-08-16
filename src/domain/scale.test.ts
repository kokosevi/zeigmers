import { describe, expect, it } from 'vitest'
import { computeElevations, computeSignedElevations } from './scale'

describe('computeElevations', () => {
  it('maps zero to zero in both modes', () => {
    const values = new Float32Array([0])
    expect(computeElevations(values, 100, 5000, 'logarithmisch')[0]).toBe(0)
    expect(computeElevations(values, 100, 5000, 'linear')[0]).toBe(0)
  })

  it('maps the maximum to the full height in both modes', () => {
    const values = new Float32Array([100])
    expect(computeElevations(values, 100, 5000, 'logarithmisch')[0]).toBeCloseTo(5000, 5)
    expect(computeElevations(values, 100, 5000, 'linear')[0]).toBeCloseTo(5000, 5)
  })

  it('lifts small values higher on the damped scale than on linear', () => {
    const values = new Float32Array([10])
    const gedaempft = computeElevations(values, 10000, 5000, 'logarithmisch')[0]!
    const linear = computeElevations(values, 10000, 5000, 'linear')[0]!
    expect(gedaempft).toBeGreaterThan(linear * 5)
  })

  it('is monotonic', () => {
    const values = new Float32Array([4, 17, 250, 4820])
    for (const mode of ['logarithmisch', 'linear'] as const) {
      const h = computeElevations(values, 4820, 5000, mode)
      for (let i = 1; i < h.length; i++) expect(h[i]!).toBeGreaterThan(h[i - 1]!)
    }
  })

  it('never returns NaN when vmax is zero', () => {
    const h = computeElevations(new Float32Array([0, 0]), 0, 5000, 'logarithmisch')
    expect([...h]).toEqual([0, 0])
  })

  // Verification of the exact numbers from the user's table (h = (v/vmax)**0.4 *
  // maxHeight, vmax = Aarau = 36'677, maxHeight = 3'000): the real complaint was
  // that the old log scale put the whole canton between 42% and 100% of bar
  // height (factor 2.4 for a data range of factor 470). The damped scale spreads
  // the same municipalities over roughly 9%-100% (factor ~11.7).
  it('matches the damped-scale reference table for the Aargau gemeinde range', () => {
    const vmax = 36677
    const maxHeight = 3000
    const values = new Float32Array([36677, 31414, 890, 78])
    const h = computeElevations(values, vmax, maxHeight, 'logarithmisch')
    expect(h[0]).toBeCloseTo(3000, 0) // Aarau: the maximum, always the full height
    expect(h[1]).toBeCloseTo(2819.8, 0) // Baden
    expect(h[2]).toBeCloseTo(677.8, 0) // median
    expect(h[3]).toBeCloseTo(256.0, 0) // smallest

    const smallestFractionPct = (h[3]! / maxHeight) * 100
    expect(smallestFractionPct).toBeGreaterThan(8)
    expect(smallestFractionPct).toBeLessThan(10)
    expect(maxHeight / h[3]!).toBeCloseTo(11.7, 1)
  })
})

// `referenceTicks` (die drei Legenden-Stützwerte) ist mit der Höhen-/
// Stützwerte-Zeile aus der Legende entfernt worden (Redesign Change 3,
// 2026-08-14, siehe `ui/legend.ts`) — mit ihrem einzigen Aufrufer verschwand
// auch die Funktion selbst und diese Tests, statt als toter Code liegen zu
// bleiben (siehe Git-Historie für den vorigen Stand).

describe('computeSignedElevations', () => {
  it('spiegelt Betrag und Vorzeichen symmetrisch um null', () => {
    const heights = computeSignedElevations(
      new Float32Array([100, -100]), 100, 1000, 'linear',
    )
    expect(heights[0]).toBeCloseTo(1000)
    expect(heights[1]).toBeCloseTo(-1000)
  })

  it('dämpft den Betrag, nicht das Vorzeichen', () => {
    const heights = computeSignedElevations(
      new Float32Array([-1]), 100, 1000, 'logarithmisch',
    )
    // -(1/100)^0.4 * 1000
    expect(heights[0]).toBeCloseTo(-Math.pow(0.01, 0.4) * 1000)
  })

  it('gibt bei vmax = 0 lauter Nullen statt NaN', () => {
    // Eine Auswahl ohne einen einzigen Wert darf keine Division durch null werden.
    const heights = computeSignedElevations(new Float32Array([5, -5]), 0, 1000, 'linear')
    expect(Array.from(heights)).toEqual([0, 0])
  })

  it('lässt computeElevations unverändert', () => {
    const heights = computeElevations(new Float32Array([-5, 5]), 5, 1000, 'linear')
    expect(heights[0]).toBe(0) // negative Werte bleiben dort ausgeschlossen
    expect(heights[1]).toBeCloseTo(1000)
  })
})
