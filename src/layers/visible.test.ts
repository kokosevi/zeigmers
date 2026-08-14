import { describe, expect, it } from 'vitest'
import {
  buildCompanyLayer,
  buildUnresearchedCompanyLayer,
  companyElevations,
  UNKNOWN_BAR_FRACTION,
  UNRESEARCHED_MARKER_COLOR,
  heightValue,
  type Company,
  type CompanyData,
} from './visible'

function company(overrides: Partial<Company> = {}): Company {
  return {
    uid: 'CHE-1', name: 'Test AG', sixSymbol: null, lon: 8, lat: 47.4,
    nogaGroupIndex: 1, revenue: 1e9, revenueChf: null, currency: 'CHF', revenueType: 'net_sales',
    profit: null, profitCurrency: null, consolidationBasis: null,
    coreProducts: null, productsUrl: null,
    foundingYear: null,
    employees: null, fiscalYear: 2024, reportUrl: null, note: null,
    placeholder: false, researched: true, city: 'Aarau',
    ...overrides,
  }
}

function companiesOf(revenues: (number | null)[]): Company[] {
  return revenues.map((revenue, i) => ({
    uid: `CHE-${i}`, name: `F${i}`, sixSymbol: null, lon: 8, lat: 47.4,
    nogaGroupIndex: 1, revenue, revenueChf: null, currency: 'CHF',
    revenueType: revenue === null ? null : 'net_sales',
    profit: null, profitCurrency: null, consolidationBasis: null,
    coreProducts: null, productsUrl: null,
    foundingYear: null,
    employees: null,
    fiscalYear: 2024, reportUrl: null, note: null,
    placeholder: revenue === null, researched: true, city: 'Aarau',
  }))
}


describe('companyElevations', () => {
  it('gives the largest revenue the full height', () => {
    const c = companiesOf([1e9, 1e10])
    const h = companyElevations(c, 1e10, 5000, 'logarithmisch')
    expect(h[1]).toBeCloseTo(5000, 3)
  })

  it('gives companies without revenue a fixed fraction of the smallest bar', () => {
    const c = companiesOf([1e9, 1e10, null])
    const h = companyElevations(c, 1e10, 5000, 'logarithmisch')
    const smallest = Math.min(h[0]!, h[1]!)
    expect(h[2]).toBeCloseTo(smallest * UNKNOWN_BAR_FRACTION, 3)
  })

  it('never gives a placeholder a height of zero', () => {
    const c = companiesOf([null])
    const h = companyElevations(c, 0, 5000, 'logarithmisch')
    expect(h[0]!).toBeGreaterThan(0)
  })

  it('keeps placeholders below every real bar', () => {
    const c = companiesOf([1e6, 1e12, null])
    const h = companyElevations(c, 1e12, 5000, 'logarithmisch')
    expect(h[2]!).toBeLessThan(Math.min(h[0]!, h[1]!))
  })

  it('handles a dataset where no company has revenue', () => {
    const c = companiesOf([null, null])
    const h = companyElevations(c, 0, 5000, 'logarithmisch')
    expect(h[0]!).toBeGreaterThan(0)
    expect(Number.isFinite(h[0]!)).toBe(true)
  })
})

describe('buildCompanyLayer researched filter', () => {
  it('only includes researched companies as bars', () => {
    const d: CompanyData = {
      companies: [
        company({ uid: 'A', researched: true }),
        company({ uid: 'B', researched: false, revenue: null, revenueType: null }),
      ],
      stats: { count: 2, withRevenue: 1, max: 1e9, revenueInChf: false, researched: 1, totalListed: 2, sixRetrievedDate: null },
    }
    const layer = buildCompanyLayer(d, 'logarithmisch', () => {})
    expect((layer.props.data as Company[]).map((c) => c.uid)).toEqual(['A'])
  })
})

describe('buildUnresearchedCompanyLayer', () => {
  it('only includes unresearched companies as markers, with the documented neutral color', () => {
    const d: CompanyData = {
      companies: [
        company({ uid: 'A', researched: true }),
        company({ uid: 'B', researched: false, revenue: null, revenueType: null }),
      ],
      stats: { count: 2, withRevenue: 1, max: 1e9, revenueInChf: false, researched: 1, totalListed: 2, sixRetrievedDate: null },
    }
    const layer = buildUnresearchedCompanyLayer(d, () => {}, () => {})
    expect((layer.props.data as Company[]).map((c) => c.uid)).toEqual(['B'])
    expect(layer.props.getFillColor).toEqual(UNRESEARCHED_MARKER_COLOR)
  })

  it('reports hover by name, not just index', () => {
    const d: CompanyData = {
      companies: [company({ uid: 'B', researched: false, revenue: null, revenueType: null })],
      stats: { count: 1, withRevenue: 0, max: 0, revenueInChf: false, researched: 0, totalListed: 1, sixRetrievedDate: null },
    }
    let hovered: Company | null = null
    const layer = buildUnresearchedCompanyLayer(d, () => {}, (c) => {
      hovered = c
    })
    const onHover = layer.props.onHover as unknown as (info: {
      object: Company | null
      x: number
      y: number
    }) => void
    onHover({ object: d.companies[0]!, x: 1, y: 2 })
    expect(hovered).toBe(d.companies[0])
  })
})

// A ColumnLayer instance is a plain object right after construction — no
// WebGL, no DOM — so its accessor props can be invoked directly with a
// Company object, exactly as deck.gl would call them per row when drawing.
describe('buildCompanyLayer outline predicate', () => {
  function accessors(revenueType: Company['revenueType']) {
    const layer = buildCompanyLayer(
      {
        companies: [company({ revenueType })],
        stats: {
          count: 1, withRevenue: 1, max: 1e9, revenueInChf: false,
          researched: 1, totalListed: 1, sixRetrievedDate: null,
        },
      },
      'logarithmisch',
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


describe('heightValue', () => {
  it('nimmt den in CHF umgerechneten Betrag, wo er vorliegt', () => {
    // Ohne Umrechnung vergliche die Höhe CHF, EUR und USD, als wären sie
    // dasselbe: ein USD-Betrag als CHF gezeichnet überzeichnet die Firma
    // 2025 um rund ein Fünftel.
    expect(heightValue(company({ revenue: 1e9, revenueChf: 8.3e8 }))).toBe(8.3e8)
  })

  it('fällt auf den berichteten Betrag zurück, solange keine Kurse vorliegen', () => {
    expect(heightValue(company({ revenue: 1e9, revenueChf: null }))).toBe(1e9)
  })

  it('bleibt null, wenn gar kein Umsatz bekannt ist', () => {
    expect(heightValue(company({ revenue: null, revenueChf: null }))).toBeNull()
  })

  it('zeichnet die Höhe aus dem umgerechneten, nicht dem berichteten Betrag', () => {
    // Zwei Firmen mit gleichem berichtetem Betrag, aber verschiedener
    // Währung, dürfen NICHT gleich hoch werden.
    const chf = company({ revenue: 1e9, revenueChf: 1e9 })
    const usd = company({ revenue: 1e9, revenueChf: 8.3e8 })
    const heights = companyElevations([chf, usd], 1e9, 12000, 'linear')
    expect(heights[0]).toBeGreaterThan(heights[1]!)
  })
})
