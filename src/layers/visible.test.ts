import { describe, expect, it } from 'vitest'
import {
  buildCompanyLayer,
  companyElevations,
  UNKNOWN_BAR_FRACTION,
  type Company,
  type CompanyData,
} from './visible'

function company(overrides: Partial<Company> = {}): Company {
  return {
    uid: 'CHE-1', name: 'Test AG', sixSymbol: null, lon: 8, lat: 47.4,
    nogaGroupIndex: 1, revenue: 1e9, currency: 'CHF', revenueType: 'net_sales',
    employees: null, fiscalYear: 2024, reportUrl: null, note: null,
    placeholder: false, city: 'Aarau',
    ...overrides,
  }
}

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
    const h = companyElevations(data([1e9, 1e10]), 5000, 'gedaempft')
    expect(h[1]).toBeCloseTo(5000, 3)
  })

  it('gives companies without revenue a fixed fraction of the smallest bar', () => {
    const h = companyElevations(data([1e9, 1e10, null]), 5000, 'gedaempft')
    const smallest = Math.min(h[0]!, h[1]!)
    expect(h[2]).toBeCloseTo(smallest * UNKNOWN_BAR_FRACTION, 3)
  })

  it('never gives a placeholder a height of zero', () => {
    const h = companyElevations(data([null]), 5000, 'gedaempft')
    expect(h[0]!).toBeGreaterThan(0)
  })

  it('keeps placeholders below every real bar', () => {
    const h = companyElevations(data([1e6, 1e12, null]), 5000, 'gedaempft')
    expect(h[2]!).toBeLessThan(Math.min(h[0]!, h[1]!))
  })

  it('handles a dataset where no company has revenue', () => {
    const h = companyElevations(data([null, null]), 5000, 'gedaempft')
    expect(h[0]!).toBeGreaterThan(0)
    expect(Number.isFinite(h[0]!)).toBe(true)
  })
})

// A ColumnLayer instance is a plain object right after construction — no
// WebGL, no DOM — so its accessor props can be invoked directly with a
// Company object, exactly as deck.gl would call them per row when drawing.
describe('buildCompanyLayer outline predicate', () => {
  function accessors(revenueType: Company['revenueType']) {
    const layer = buildCompanyLayer(
      { canton: 'AG', companies: [company({ revenueType })], stats: { count: 1, withRevenue: 1, max: 1e9 } },
      'gedaempft',
      () => {},
    )
    const getLineColor = layer.props.getLineColor as unknown as (c: Company) => number[]
    const getLineWidth = layer.props.getLineWidth as unknown as (c: Company) => number
    return { getLineColor, getLineWidth, lineWidthUnits: layer.props.lineWidthUnits }
  }

  it('gives a net_sales company an invisible outline (zero alpha AND zero width)', () => {
    const { getLineColor, getLineWidth } = accessors('net_sales')
    const c = company({ revenueType: 'net_sales' })
    expect(getLineColor(c)[3]).toBe(0)
    expect(getLineWidth(c)).toBe(0)
  })

  it('gives an operating_income company the visible dark outline at width 60', () => {
    const { getLineColor, getLineWidth } = accessors('operating_income')
    const c = company({ revenueType: 'operating_income' })
    expect(getLineColor(c)).toEqual([30, 30, 30, 220])
    expect(getLineWidth(c)).toBe(60)
  })

  it('treats a null revenueType as not net_sales and shows the outline', () => {
    const { getLineColor, getLineWidth } = accessors(null)
    const c = company({ revenueType: null })
    expect(getLineColor(c)).toEqual([30, 30, 30, 220])
    expect(getLineWidth(c)).toBe(60)
  })

  it('measures the outline width in metres, not pixels', () => {
    const { lineWidthUnits } = accessors('operating_income')
    expect(lineWidthUnits).toBe('meters')
  })
})
