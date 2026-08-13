import { describe, expect, it } from 'vitest'
import { activeLevel, lodWeights } from './lod'

describe('lodWeights', () => {
  it('shows only the canton far out', () => {
    expect(lodWeights(7)).toEqual({ kanton: 1, gemeinde: 0, hektar: 0 })
  })

  it('shows only municipalities in the middle band', () => {
    expect(lodWeights(10.5)).toEqual({ kanton: 0, gemeinde: 1, hektar: 0 })
  })

  it('shows only hectares when zoomed in', () => {
    expect(lodWeights(14)).toEqual({ kanton: 0, gemeinde: 0, hektar: 1 })
  })

  it('splits evenly at the centre of the first transition', () => {
    const w = lodWeights(9)
    expect(w.kanton).toBeCloseTo(0.5, 6)
    expect(w.gemeinde).toBeCloseTo(0.5, 6)
    expect(w.hektar).toBe(0)
  })

  it('splits evenly at the centre of the second transition', () => {
    const w = lodWeights(12)
    expect(w.gemeinde).toBeCloseTo(0.5, 6)
    expect(w.hektar).toBeCloseTo(0.5, 6)
    expect(w.kanton).toBe(0)
  })

  it('always sums to one', () => {
    for (let zoom = 5; zoom <= 18; zoom += 0.05) {
      const w = lodWeights(zoom)
      expect(w.kanton + w.gemeinde + w.hektar).toBeCloseTo(1, 6)
    }
  })

  it('never returns a negative weight', () => {
    for (let zoom = 5; zoom <= 18; zoom += 0.05) {
      const w = lodWeights(zoom)
      expect(Math.min(w.kanton, w.gemeinde, w.hektar)).toBeGreaterThanOrEqual(0)
    }
  })

  it('changes continuously — no step larger than 0.1 per 0.05 zoom', () => {
    let previous = lodWeights(5)
    for (let zoom = 5.05; zoom <= 18; zoom += 0.05) {
      const current = lodWeights(zoom)
      expect(Math.abs(current.gemeinde - previous.gemeinde)).toBeLessThan(0.1)
      previous = current
    }
  })
})

describe('activeLevel', () => {
  it('names the dominant level', () => {
    expect(activeLevel(7)).toBe('kanton')
    expect(activeLevel(10.5)).toBe('gemeinde')
    expect(activeLevel(14)).toBe('hektar')
  })
})
