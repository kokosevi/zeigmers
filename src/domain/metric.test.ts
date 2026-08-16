import { describe, expect, it } from 'vitest'
import { formatMetric, metricAllowsNegative, metricValue, type Metric } from './metric'
import type { Company } from '../layers/visible'

function company(overrides: Partial<Company> = {}): Company {
  return {
    uid: 'CHE-1', name: 'Beispiel AG', sixSymbol: 'BSP', lon: 8, lat: 47,
    nogaGroupIndex: 1, revenue: 1_000_000, revenueChf: 1_000_000, currency: 'CHF',
    revenueType: 'net_sales', profit: 100_000, profitChf: 100_000,
    profitCurrency: 'CHF', consolidationBasis: 'total_group', coreProducts: null,
    productsUrl: null, foundingYear: null, employees: 500, fiscalYear: 2025,
    reportUrl: null, note: null, placeholder: false, researched: true,
    city: 'Aarau', positionAdjusted: null, orgForm: 'boersenkotiert',
    ...overrides,
  }
}

describe('metricValue', () => {
  it('nimmt für Umsatz den umgerechneten Betrag, nicht den berichteten', () => {
    const c = company({ revenue: 900, revenueChf: 750 })
    expect(metricValue(c, 'umsatz')).toBe(750)
  })

  it('liefert null statt auf die Berichtswährung zurückzufallen', () => {
    // Ohne Umrechnung verglichen die Höhen CHF mit EUR — lieber keine Säule.
    expect(metricValue(company({ revenueChf: null }), 'umsatz')).toBeNull()
    expect(metricValue(company({ profitChf: null }), 'gewinn')).toBeNull()
  })

  it('behandelt eine Platzhalter-Zeile als Zeile ohne Umsatz', () => {
    // Molecular Partners AG: revenue 0, placeholder true (siehe ETL-Invariante).
    const c = company({ revenue: 0, revenueChf: 0, placeholder: true })
    expect(metricValue(c, 'umsatz')).toBeNull()
  })

  it('nimmt 0 Mitarbeitende als echten Wert', () => {
    // Sechs Beteiligungsgesellschaften melden 0 — das ist eine Zahl, keine Lücke.
    expect(metricValue(company({ employees: 0 }), 'mitarbeitende')).toBe(0)
  })

  it('behält das Vorzeichen eines Verlusts', () => {
    expect(metricValue(company({ profitChf: -134_400_000 }), 'gewinn')).toBe(-134_400_000)
  })
})

describe('metricAllowsNegative', () => {
  it('gilt nur für den Gewinn', () => {
    expect(metricAllowsNegative('gewinn')).toBe(true)
    expect(metricAllowsNegative('umsatz')).toBe(false)
    expect(metricAllowsNegative('mitarbeitende')).toBe(false)
  })
})

describe('formatMetric', () => {
  it('nennt einen Verlust beim Wort', () => {
    expect(formatMetric(-2_000_000, 'gewinn')).toContain('Verlust')
  })

  it('gibt Mitarbeitende als ganze Zahl ohne Währung', () => {
    expect(formatMetric(3891, 'mitarbeitende')).toBe("3'891")
  })
})
