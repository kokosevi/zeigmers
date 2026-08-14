import { describe, expect, it } from 'vitest'
import { computeElevations, referenceTicks } from './scale'

describe('computeElevations', () => {
  it('maps zero to zero in both modes', () => {
    const values = new Float32Array([0])
    expect(computeElevations(values, 100, 5000, 'gedaempft')[0]).toBe(0)
    expect(computeElevations(values, 100, 5000, 'linear')[0]).toBe(0)
  })

  it('maps the maximum to the full height in both modes', () => {
    const values = new Float32Array([100])
    expect(computeElevations(values, 100, 5000, 'gedaempft')[0]).toBeCloseTo(5000, 5)
    expect(computeElevations(values, 100, 5000, 'linear')[0]).toBeCloseTo(5000, 5)
  })

  it('lifts small values higher on the damped scale than on linear', () => {
    const values = new Float32Array([10])
    const gedaempft = computeElevations(values, 10000, 5000, 'gedaempft')[0]!
    const linear = computeElevations(values, 10000, 5000, 'linear')[0]!
    expect(gedaempft).toBeGreaterThan(linear * 5)
  })

  it('is monotonic', () => {
    const values = new Float32Array([4, 17, 250, 4820])
    for (const mode of ['gedaempft', 'linear'] as const) {
      const h = computeElevations(values, 4820, 5000, mode)
      for (let i = 1; i < h.length; i++) expect(h[i]!).toBeGreaterThan(h[i - 1]!)
    }
  })

  it('never returns NaN when vmax is zero', () => {
    const h = computeElevations(new Float32Array([0, 0]), 0, 5000, 'gedaempft')
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
    const h = computeElevations(values, vmax, maxHeight, 'gedaempft')
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

describe('referenceTicks', () => {
  it('returns three ascending ticks bounded by vmax', () => {
    const ticks = referenceTicks(4820, 'gedaempft')
    expect(ticks).toHaveLength(3)
    expect(ticks[0]!).toBeGreaterThan(0)
    expect(ticks[2]!).toBeLessThanOrEqual(4820)
    expect(ticks[0]!).toBeLessThan(ticks[1]!)
    expect(ticks[1]!).toBeLessThan(ticks[2]!)
  })

  // The real data never gets this small (STATENT suppresses cells below 4), but the
  // function must not silently collapse ticks into duplicates when it does: the top tick
  // is pinned to vmax, and for small vmax the damped-scale spacing squeezes the lower two
  // fractions (0.25, 0.6) close together, so naive rounding-to-integer can round both to
  // the same value, or round the 0.6-fraction tick up to meet vmax itself.
  it('stays strictly ascending for small vmax, including vmax near 1', () => {
    for (const mode of ['gedaempft', 'linear'] as const) {
      for (let vmax = 1; vmax <= 30; vmax++) {
        const ticks = referenceTicks(vmax, mode)
        expect(ticks).toHaveLength(3)
        expect(ticks[0]!).toBeGreaterThan(0)
        expect(ticks[1]!).toBeGreaterThan(ticks[0]!)
        expect(ticks[2]!).toBeGreaterThan(ticks[1]!)
        expect(ticks[2]!).toBeLessThanOrEqual(vmax)
      }
    }
  })

  it('stays strictly ascending for realistic large vmax (gemeinde and kanton totals)', () => {
    for (const vmax of [4670, 36677, 383203]) {
      const ticks = referenceTicks(vmax, 'gedaempft')
      expect(ticks[0]!).toBeGreaterThan(0)
      expect(ticks[1]!).toBeGreaterThan(ticks[0]!)
      expect(ticks[2]!).toBeGreaterThan(ticks[1]!)
    }
  })

  // Municipality range from the ETL data (`ag_gemeinde.json`, vmax = Aarau =
  // 36'677) — the exact ticks the legend shows in Ansicht A today.
  it('returns the expected ticks for the Aargau gemeinde vmax', () => {
    const ticks = referenceTicks(36677, 'gedaempft')
    expect(ticks[0]).toBeCloseTo(1146, 0)
    expect(ticks[1]).toBeCloseTo(10228, 0)
    expect(ticks[2]).toBe(36677)
  })
})
