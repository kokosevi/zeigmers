import { describe, expect, it } from 'vitest'
import { companyElevations, UNKNOWN_BAR_FRACTION, type CompanyData } from './visible'

function data(revenues: (number | null)[]): CompanyData {
  return {
    canton: 'AG',
    companies: revenues.map((revenue, i) => ({
      uid: `CHE-${i}`, name: `F${i}`, sixSymbol: null, lon: 8, lat: 47.4,
      nogaGroupIndex: 1, revenue, currency: 'CHF',
      revenueType: revenue === null ? null : 'net_sales', employees: null,
      fiscalYear: 2024, reportUrl: null, note: null,
      placeholder: revenue === null, city: 'Aarau',
    })),
    stats: {
      count: revenues.length,
      withRevenue: revenues.filter((r) => r !== null).length,
      max: Math.max(...revenues.map((r) => r ?? 0)),
    },
  }
}

describe('companyElevations', () => {
  it('gives the largest revenue the full height', () => {
    const h = companyElevations(data([1e9, 1e10]), 5000, 'log')
    expect(h[1]).toBeCloseTo(5000, 3)
  })

  it('gives companies without revenue a fixed fraction of the smallest bar', () => {
    const h = companyElevations(data([1e9, 1e10, null]), 5000, 'log')
    const smallest = Math.min(h[0]!, h[1]!)
    expect(h[2]).toBeCloseTo(smallest * UNKNOWN_BAR_FRACTION, 3)
  })

  it('never gives a placeholder a height of zero', () => {
    const h = companyElevations(data([null]), 5000, 'log')
    expect(h[0]!).toBeGreaterThan(0)
  })

  it('keeps placeholders below every real bar', () => {
    const h = companyElevations(data([1e6, 1e12, null]), 5000, 'log')
    expect(h[2]!).toBeLessThan(Math.min(h[0]!, h[1]!))
  })

  it('handles a dataset where no company has revenue', () => {
    const h = companyElevations(data([null, null]), 5000, 'log')
    expect(h[0]!).toBeGreaterThan(0)
    expect(Number.isFinite(h[0]!)).toBe(true)
  })
})
