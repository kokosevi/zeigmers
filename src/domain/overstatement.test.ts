import { describe, expect, it } from 'vitest'
import type { Level, LevelMeta } from '../data/loader'
import { municipalityOverstatementStats } from './overstatement'

const NOGA_GROUPS: LevelMeta['nogaGroups'] = [
  { key: 'industrie', label: 'Industrie', color: '#111111' },
]

function level(
  rows: { value: number; ambiguousCells: number }[],
  opts: { withGemeindeIdx?: boolean; withGemeinden?: boolean } = {},
): Level {
  const { withGemeindeIdx = true, withGemeinden = true } = opts
  const gemeinden = withGemeinden
    ? rows.map((r, i) => ({ bfsNr: 4000 + i, name: `Ort${i}`, ambiguousCells: r.ambiguousCells }))
    : undefined
  return {
    meta: {
      level: 'gemeinde',
      year: 2023,
      canton: 'AG',
      count: rows.length,
      arrays: {},
      nogaGroups: NOGA_GROUPS,
      unknownColor: '#BFBFBF',
      unknownIndex: 255,
      stats: { min: 0, max: 0, sum: 0, p99: 0, ambiguousCells: 0, overstatementMax: 0 },
      gemeinden,
    },
    arrays: {
      positions: new Float32Array(rows.length * 2),
      values: new Float32Array(rows.map((r) => r.value)),
      noga: new Uint8Array(rows.length),
      flags: new Uint8Array(rows.length),
      gemeindeIdx: withGemeindeIdx ? new Uint16Array(rows.map((_, i) => i)) : undefined,
    },
  }
}

describe('municipalityOverstatementStats', () => {
  it('computes 3 * ambiguousCells / value as a percentage per row', () => {
    // Eine Gemeinde: value 100, 10 mehrdeutige Hektaren -> 30/100 = 30 %.
    const stats = municipalityOverstatementStats(level([{ value: 100, ambiguousCells: 10 }]))
    expect(stats.medianPct).toBeCloseTo(30, 6)
    expect(stats.maxPct).toBeCloseTo(30, 6)
  })

  it('takes the average of the two middle values for an even count', () => {
    const stats = municipalityOverstatementStats(
      level([
        { value: 100, ambiguousCells: 0 }, // 0 %
        { value: 100, ambiguousCells: 10 }, // 30 %
        { value: 100, ambiguousCells: 20 }, // 60 %
        { value: 100, ambiguousCells: 30 }, // 90 %
      ]),
    )
    expect(stats.medianPct).toBeCloseTo(45, 6) // (30 + 60) / 2
    expect(stats.maxPct).toBeCloseTo(90, 6)
  })

  it('picks the middle value for an odd count', () => {
    const stats = municipalityOverstatementStats(
      level([
        { value: 100, ambiguousCells: 0 }, // 0 %
        { value: 100, ambiguousCells: 10 }, // 30 %
        { value: 100, ambiguousCells: 30 }, // 90 %
      ]),
    )
    expect(stats.medianPct).toBeCloseTo(30, 6)
    expect(stats.maxPct).toBeCloseTo(90, 6)
  })

  it('skips municipalities without employees (value 0), matching the ETL keep filter', () => {
    const stats = municipalityOverstatementStats(
      level([
        { value: 0, ambiguousCells: 5 },
        { value: 100, ambiguousCells: 10 },
      ]),
    )
    expect(stats.medianPct).toBeCloseTo(30, 6)
    expect(stats.maxPct).toBeCloseTo(30, 6)
  })

  it('returns zero for both when gemeindeIdx or gemeinden are missing (e.g. a hectare or canton level)', () => {
    expect(municipalityOverstatementStats(level([{ value: 100, ambiguousCells: 10 }], { withGemeindeIdx: false }))).toEqual({ medianPct: 0, maxPct: 0 })
    expect(municipalityOverstatementStats(level([{ value: 100, ambiguousCells: 10 }], { withGemeinden: false }))).toEqual({ medianPct: 0, maxPct: 0 })
  })

  it('returns zero for both on an empty level', () => {
    expect(municipalityOverstatementStats(level([]))).toEqual({ medianPct: 0, maxPct: 0 })
  })
})
