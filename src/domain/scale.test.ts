import { describe, expect, it } from 'vitest'
import { computeElevations, referenceTicks } from './scale'

describe('computeElevations', () => {
  it('maps zero to zero in both modes', () => {
    const values = new Float32Array([0])
    expect(computeElevations(values, 100, 5000, 'log')[0]).toBe(0)
    expect(computeElevations(values, 100, 5000, 'linear')[0]).toBe(0)
  })

  it('maps the maximum to the full height in both modes', () => {
    const values = new Float32Array([100])
    expect(computeElevations(values, 100, 5000, 'log')[0]).toBeCloseTo(5000, 5)
    expect(computeElevations(values, 100, 5000, 'linear')[0]).toBeCloseTo(5000, 5)
  })

  it('lifts small values much higher on the log scale', () => {
    const values = new Float32Array([10])
    const log = computeElevations(values, 10000, 5000, 'log')[0]!
    const linear = computeElevations(values, 10000, 5000, 'linear')[0]!
    expect(log).toBeGreaterThan(linear * 5)
  })

  it('is monotonic', () => {
    const values = new Float32Array([4, 17, 250, 4820])
    for (const mode of ['log', 'linear'] as const) {
      const h = computeElevations(values, 4820, 5000, mode)
      for (let i = 1; i < h.length; i++) expect(h[i]!).toBeGreaterThan(h[i - 1]!)
    }
  })

  it('never returns NaN when vmax is zero', () => {
    const h = computeElevations(new Float32Array([0, 0]), 0, 5000, 'log')
    expect([...h]).toEqual([0, 0])
  })
})

describe('referenceTicks', () => {
  it('returns three ascending ticks bounded by vmax', () => {
    const ticks = referenceTicks(4820, 'log')
    expect(ticks).toHaveLength(3)
    expect(ticks[0]!).toBeGreaterThan(0)
    expect(ticks[2]!).toBeLessThanOrEqual(4820)
    expect(ticks[0]!).toBeLessThan(ticks[1]!)
    expect(ticks[1]!).toBeLessThan(ticks[2]!)
  })

  // The real data never gets this small (STATENT suppresses cells below 4), but the
  // function must not silently collapse ticks into duplicates when it does: the top tick
  // is pinned to vmax, and for small vmax the log spacing squeezes the lower two fractions
  // (0.25, 0.6) close together, so naive rounding-to-integer can round both to the same
  // value, or round the 0.6-fraction tick up to meet vmax itself.
  it('stays strictly ascending for small vmax, including vmax near 1', () => {
    for (const mode of ['log', 'linear'] as const) {
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
      const ticks = referenceTicks(vmax, 'log')
      expect(ticks[0]!).toBeGreaterThan(0)
      expect(ticks[1]!).toBeGreaterThan(ticks[0]!)
      expect(ticks[2]!).toBeGreaterThan(ticks[1]!)
    }
  })
})
