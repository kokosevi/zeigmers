import { describe, expect, it } from 'vitest'
import { applySelection, branchTotals, type Selection } from './selection'
import type { Company } from '../layers/visible'

function company(overrides: Partial<Company> = {}): Company {
  return {
    uid: null, name: 'X AG', sixSymbol: null, lon: 8, lat: 47, nogaGroupIndex: 1,
    revenue: 100, revenueChf: 100, currency: 'CHF', revenueType: 'net_sales',
    profit: 10, profitChf: 10, profitCurrency: 'CHF', consolidationBasis: 'total_group',
    coreProducts: null, productsUrl: null, foundingYear: null, employees: 10,
    fiscalYear: 2025, reportUrl: null, note: null, placeholder: false,
    researched: true, city: null, positionAdjusted: null, orgForm: 'boersenkotiert',
    ...overrides,
  }
}

const alle = (metric: Selection['metric'], branches: number[], forms = ['boersenkotiert']):
  Selection => ({ metric, branches: new Set(branches), orgForms: new Set(forms) })

describe('applySelection', () => {
  it('behält nur Firmen, deren Branche UND Organisationsform gewählt sind', () => {
    const cs = [
      company({ name: 'A', nogaGroupIndex: 1 }),
      company({ name: 'B', nogaGroupIndex: 2 }),
      company({ name: 'C', nogaGroupIndex: 1, orgForm: 'genossenschaft' }),
    ]
    const r = applySelection(cs, alle('umsatz', [1]))
    expect(r.visible.map((c) => c.name)).toEqual(['A'])
  })

  it('nimmt unrecherchierte Firmen nie in die Auswahl', () => {
    // Sie haben keine Höhenaussage und erscheinen als eigener Marker-Layer.
    const cs = [company({ name: 'A' }), company({ name: 'B', researched: false })]
    expect(applySelection(cs, alle('umsatz', [1])).visible.map((c) => c.name)).toEqual(['A'])
  })

  it('trennt sichtbar von bewertbar', () => {
    const cs = [company({ revenueChf: 100 }), company({ revenueChf: null })]
    const r = applySelection(cs, alle('umsatz', [1]))
    expect(r.visible).toHaveLength(2)
    expect(r.withValue).toHaveLength(1)
    expect(r.missing).toBe(1)
  })

  it('nimmt vmax aus den Beträgen, damit reine Verlustauswahlen skalieren', () => {
    const cs = [company({ profitChf: -300 }), company({ profitChf: -50 })]
    const r = applySelection(cs, alle('gewinn', [1]))
    expect(r.vmax).toBe(300)
    expect(r.losses).toBe(2)
    expect(r.sum).toBe(-350)
    expect(r.top?.profitChf).toBe(-300)
  })

  it('gibt bei leerer Auswahl vmax 0 und keine Firmen', () => {
    const r = applySelection([company()], alle('umsatz', []))
    expect(r.visible).toEqual([])
    expect(r.vmax).toBe(0)
    expect(r.sum).toBe(0)
    expect(r.top).toBeNull()
  })

  it('gibt bei einer Auswahl ganz ohne Werte vmax 0, nicht NaN', () => {
    const r = applySelection([company({ employees: null })], alle('mitarbeitende', [1]))
    expect(r.vmax).toBe(0)
    expect(r.sum).toBe(0)
  })
})

describe('branchTotals', () => {
  it('zählt je Branche Firmen und Summe', () => {
    const cs = [
      company({ nogaGroupIndex: 1, revenueChf: 100 }),
      company({ nogaGroupIndex: 1, revenueChf: 300 }),
      company({ nogaGroupIndex: 2, revenueChf: 50 }),
    ]
    const r = applySelection(cs, alle('umsatz', [1, 2]))
    const totals = branchTotals(r, 'umsatz')
    expect(totals.get(1)).toEqual({ count: 2, sum: 400 })
    expect(totals.get(2)).toEqual({ count: 1, sum: 50 })
  })
})
