import { describe, expect, it } from 'vitest'
import type { Level, LevelMeta } from '../data/loader'
import type { Company } from '../layers/visible'
import { aggregateCellContent, companyContent, configureCanton } from './panel'

// Diese Tests prüfen genau die Formulierungen, deren Regression dieses
// Projekt am meisten schaden würde: die Obergrenzen-Notiz auf Aggregaten
// (mit korrektem Geltungsbereich Gemeinde vs. Kanton) und die
// Nicht-Vergleichbarkeits-Kennzeichnung bei `operating_income` (siehe
// Abschluss-Review, Finding I9). `panel.ts` ist bewusst DOM-frei dafür gebaut
// — genau damit sich das hier, ohne Browser, prüfen lässt.

const NOGA_GROUPS: LevelMeta['nogaGroups'] = [
  { key: 'industrie', label: 'Industrie', color: '#111111' },
  { key: 'finanz', label: 'Finanzdienstleistungen', color: '#222222' },
]

function baseMeta(overrides: Partial<LevelMeta> = {}): LevelMeta {
  return {
    level: 'gemeinde',
    year: 2023,
    canton: 'AG',
    count: 2,
    arrays: {},
    nogaGroups: NOGA_GROUPS,
    unknownColor: '#BFBFBF',
    unknownIndex: 255,
    stats: { min: 4, max: 100, sum: 104, p99: 100, ambiguousCells: 1, overstatementMax: 3 },
    ...overrides,
  }
}

function aggregateLevel(
  opts: {
    level: 'gemeinde' | 'kanton'
    value?: number
    dist?: number[]
    gemeinden?: LevelMeta['gemeinden']
    gemeindeIdx?: number
    population?: number
  },
): Level {
  return {
    meta: baseMeta({
      level: opts.level,
      gemeinden: opts.gemeinden,
      stats: {
        min: 4,
        max: 100,
        sum: 104,
        p99: 100,
        ambiguousCells: 1,
        overstatementMax: 3,
        population: opts.population,
      },
    }),
    arrays: {
      positions: new Float32Array([8.0, 47.4]),
      values: new Float32Array([opts.value ?? 1000]),
      noga: new Uint8Array([0]),
      flags: new Uint8Array([0]),
      dist: new Float32Array(opts.dist ?? [600, 400]),
      gemeindeIdx:
        opts.gemeindeIdx !== undefined ? new Uint16Array([opts.gemeindeIdx]) : undefined,
    },
  }
}

function company(overrides: Partial<Company> = {}): Company {
  return {
    uid: 'CHE-1',
    name: 'Beispiel AG',
    sixSymbol: null,
    lon: 8,
    lat: 47.4,
    nogaGroupIndex: 0,
    revenue: 1_250_000_000,
    currency: 'CHF',
    revenueType: 'net_sales',
    employees: 3400,
    fiscalYear: 2024,
    reportUrl: 'https://example.test/gb.pdf',
    note: null,
    placeholder: false,
    city: 'Aarau',
    ...overrides,
  }
}

describe('aggregateCellContent', () => {
  it('marks the sum as an upper bound (Obergrenze), never as an exact figure', () => {
    const content = aggregateCellContent(
      aggregateLevel({ level: 'kanton', value: 383203 }),
      0,
    )
    expect(content.footnote).toMatch(/Obergrenze/)
    expect(content.footnote).toMatch(/keine exakte Zahl/)
  })

  // Change 1 (2026-08-14): die Obergrenzen-Notiz ist jetzt `footnote`, nicht
  // mehr Teil von `notes` — sie soll unten im Panel erscheinen, kleiner
  // gewichtet, `notes` bleibt für Hinweise auf Feld-Ebene reserviert.
  it('no longer places the upper-bound note in notes', () => {
    const content = aggregateCellContent(aggregateLevel({ level: 'kanton' }), 0)
    expect(content.notes).toEqual([])
  })

  it('scopes the overstatement figure to the municipality, using its own ambiguous count', () => {
    const gemeinden: LevelMeta['gemeinden'] = [
      { bfsNr: 4001, name: 'Aarau', ambiguousCells: 5 },
      { bfsNr: 4002, name: 'Baden', ambiguousCells: 12 },
    ]
    const content = aggregateCellContent(
      aggregateLevel({ level: 'gemeinde', gemeinden, gemeindeIdx: 1 }),
      0,
    )
    expect(content.title).toBe('Baden')
    expect(content.footnote).toContain('in dieser Gemeinde')
    // 3 * ambiguousCells (12) = 36, nicht die kantonsweite overstatementMax (3).
    expect(content.footnote).toContain('36')
    expect(content.footnote).not.toContain('im ganzen Kanton')
  })

  it('falls back to the canton-wide overstatement figure when there is no municipality', () => {
    const content = aggregateCellContent(aggregateLevel({ level: 'kanton' }), 0)
    expect(content.footnote).toContain('im ganzen Kanton')
    // overstatementMax aus stats (3) statt einer Gemeindezahl.
    expect(content.footnote).toContain('3')
    expect(content.footnote).not.toContain('in dieser Gemeinde')
  })

  it('uses the configured canton name for the canton-level title', () => {
    configureCanton('Zürich')
    const content = aggregateCellContent(aggregateLevel({ level: 'kanton' }), 0)
    expect(content.title).toBe('Kanton Zürich')
    configureCanton('Aargau') // andere Tests nicht beeinflussen
  })

  // Change 2 (2026-08-14): Beschäftigte je Einwohner, direkt nach der Summe.
  describe('employees per inhabitant', () => {
    it('adds the ratio directly after the employee count, noting the differing years', () => {
      const gemeinden: LevelMeta['gemeinden'] = [
        { bfsNr: 4001, name: 'Islisberg', ambiguousCells: 0, einwohnerzahl: 692 },
      ]
      const content = aggregateCellContent(
        aggregateLevel({ level: 'gemeinde', gemeinden, gemeindeIdx: 0, value: 99 }),
        0,
      )
      expect(content.fields[0]?.label).toBe('Beschäftigte (Summe)')
      expect(content.fields[1]?.label).toBe('Beschäftigte je Einwohner')
      expect(content.fields[1]?.value).toMatch(/^0[.,]14\b/) // 99 / 692 ≈ 0.1431
      expect(content.fields[1]?.value).toContain('2024')
      expect(content.fields[1]?.value).toContain('2023')
    })

    it('omits the ratio when einwohnerzahl is missing (no crash, no fabricated ratio)', () => {
      const gemeinden: LevelMeta['gemeinden'] = [
        { bfsNr: 4001, name: 'Ohne Bevölkerungszahl', ambiguousCells: 0 },
      ]
      const content = aggregateCellContent(
        aggregateLevel({ level: 'gemeinde', gemeinden, gemeindeIdx: 0, value: 99 }),
        0,
      )
      expect(content.fields).toHaveLength(1)
      expect(content.fields.find((f) => f.label.includes('Einwohner'))).toBeUndefined()
    })

    it('omits the ratio when einwohnerzahl is exactly zero (no division by zero)', () => {
      const gemeinden: LevelMeta['gemeinden'] = [
        { bfsNr: 4001, name: 'Nullgemeinde', ambiguousCells: 0, einwohnerzahl: 0 },
      ]
      const content = aggregateCellContent(
        aggregateLevel({ level: 'gemeinde', gemeinden, gemeindeIdx: 0, value: 99 }),
        0,
      )
      expect(content.fields).toHaveLength(1)
      expect(
        content.fields.some((f) => f.value.includes('Infinity') || f.value.includes('NaN')),
      ).toBe(false)
    })

    it('falls back to the canton-wide population for a canton-level cell', () => {
      const content = aggregateCellContent(
        aggregateLevel({ level: 'kanton', value: 383203, population: 735808 }),
        0,
      )
      expect(content.fields[1]?.label).toBe('Beschäftigte je Einwohner')
      expect(content.fields[1]?.value).toMatch(/^0[.,]52\b/) // 383203 / 735808 ≈ 0.5208
    })
  })
})

describe('companyContent', () => {
  it('labels net_sales as ordinary Nettoumsatz', () => {
    const content = companyContent(company({ revenueType: 'net_sales' }))
    expect(content.fields[0]?.label).toBe('Jahresumsatz (Nettoumsatz)')
  })

  it('names operating_income explicitly as not comparable to net sales', () => {
    const content = companyContent(company({ revenueType: 'operating_income' }))
    expect(content.fields[0]?.label).toMatch(/Geschäftsertrag/)
    expect(content.fields[0]?.label).toMatch(/nicht mit Nettoumsatz vergleichbar/)
  })

  it('shows an explicit hint instead of a fabricated number when revenue is absent', () => {
    const content = companyContent(
      company({ placeholder: true, revenue: null, note: 'Nicht kotiert genug Angaben' }),
    )
    expect(content.notes).toContain('Umsatz nicht öffentlich verfügbar.')
    expect(content.fields.find((f) => f.label.includes('Umsatz'))).toBeUndefined()
  })
})
