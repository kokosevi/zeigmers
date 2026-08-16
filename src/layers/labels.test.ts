import { describe, expect, it } from 'vitest'
import { applySelection } from '../domain/selection'
import type { Metric } from '../domain/metric'
import { buildLabelLayer, topByMetric, TOP_LABEL_COUNT } from './labels'
import type { Company } from './visible'

function company(overrides: Partial<Company> = {}): Company {
  return {
    uid: 'CHE-1', name: 'Test AG', sixSymbol: null, lon: 8, lat: 47.4,
    nogaGroupIndex: 1, orgForm: 'boersenkotiert',
    revenue: 1e9, revenueChf: 1e9, currency: 'CHF', revenueType: 'net_sales',
    profit: 10, profitChf: 10, profitCurrency: 'CHF', consolidationBasis: 'total_group',
    coreProducts: null, productsUrl: null, foundingYear: null,
    employees: null, fiscalYear: 2024, reportUrl: null, note: null,
    placeholder: false, researched: true, city: 'Aarau', positionAdjusted: null,
    ...overrides,
  }
}

// Dieselbe Auswahl wie in `visible.test.ts`: alle elf Branchen plus
// «unbestimmt» (255), nur die Rechtsform, die der Datensatz heute kennt.
const selectionFor = (metric: Metric) => ({
  metric, branches: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 255]),
  orgForms: new Set(['boersenkotiert']),
})

describe('topByMetric', () => {
  it('nimmt die grössten Beträge der aktiven Kennzahl', () => {
    const cs = [
      company({ name: 'Klein', revenueChf: 10 }),
      company({ name: 'Gross', revenueChf: 1000 }),
      company({ name: 'Mittel', revenueChf: 100 }),
    ]
    const r = applySelection(cs, selectionFor('umsatz'))
    expect(topByMetric(r, 'umsatz', 2).map((c) => c.name)).toEqual(['Gross', 'Mittel'])
  })

  it('folgt dem Filter statt immer dieselben Namen zu zeigen', () => {
    const cs = [
      company({ name: 'A', nogaGroupIndex: 1, revenueChf: 1000 }),
      company({ name: 'B', nogaGroupIndex: 2, revenueChf: 500 }),
    ]
    const nurZwei = applySelection(cs, {
      metric: 'umsatz',
      branches: new Set([2]),
      orgForms: new Set(['boersenkotiert']),
    })
    expect(topByMetric(nurZwei, 'umsatz', 5).map((c) => c.name)).toEqual(['B'])
  })

  it('ordnet Verluste nach Betrag, nicht nach Wert', () => {
    // Ein Verlust von 900 ist der grössere Ausschlag als ein Gewinn von 10 —
    // eine Sortierung nach dem Wert selbst (statt dem Betrag) würde den
    // kleinen Gewinn fälschlich vor den grossen Verlust stellen.
    const cs = [company({ name: 'Tief', profitChf: -900 }), company({ name: 'Klein', profitChf: 10 })]
    const r = applySelection(cs, selectionFor('gewinn'))
    expect(topByMetric(r, 'gewinn', 1).map((c) => c.name)).toEqual(['Tief'])
  })

  it('begrenzt auf TOP_LABEL_COUNT, wenn mehr Firmen vorliegen als angefordert', () => {
    const cs = Array.from({ length: TOP_LABEL_COUNT + 5 }, (_, i) =>
      company({ name: `F${i}`, revenueChf: i + 1 }),
    )
    const r = applySelection(cs, selectionFor('umsatz'))
    expect(topByMetric(r, 'umsatz', TOP_LABEL_COUNT)).toHaveLength(TOP_LABEL_COUNT)
  })
})

describe('buildLabelLayer', () => {
  it('beschriftet mit dem Firmennamen', () => {
    const c = company({ name: 'Bâloise' })
    const heights = new Float32Array([2000])
    const layer = buildLabelLayer([c], 'umsatz', heights, 300)
    const getText = layer.props.getText as unknown as (c: Company) => string
    expect(getText(c)).toBe('Bâloise')
  })

  it('setzt die Beschriftung auf die Säulenspitze — Nulllinie plus Höhe, nicht nur die Höhe', () => {
    // Seit dem Umbau der Säulen (`buildCompanyLayer`) sitzt die Spitze auf
    // `zeroPlane + heights[i]`, nicht auf `heights[i]` allein — hier mit
    // einem willkürlichen `zeroPlane` (4200) geprüft, unabhängig davon, was
    // `zeroPlaneHeight()` in der echten App liefert (seit Aufgabe 18 immer
    // die Plattenoberkante, siehe `layers/visible.ts`). Ohne den Summanden
    // schwebte der Name unter seiner Säule.
    const c = company({ lon: 8.5, lat: 47.1 })
    const heights = new Float32Array([1500])
    const zeroPlane = 4200
    const layer = buildLabelLayer([c], 'gewinn', heights, zeroPlane)
    const getPosition = layer.props.getPosition as unknown as (
      c: Company,
      ctx: { index: number },
    ) => number[]
    expect(getPosition(c, { index: 0 })).toEqual([8.5, 47.1, zeroPlane + 1500])
  })

  it('lässt keine Glyphe aus — Firmennamen tragen Umlaute und Akzente', () => {
    // `characterSet` ohne `'auto'` ist ein festes ASCII-Set (siehe
    // `@deck.gl/layers` TextLayer-Default) — «Zürcher Kantonalbank» oder
    // «DKSH» mit Sonderzeichen verlören einzelne Buchstaben.
    const layer = buildLabelLayer([company()], 'umsatz', new Float32Array([100]), 0)
    expect(layer.props.characterSet).toBe('auto')
  })

  it('filtert kollidierende Beschriftungen statt sie zu überlagern', () => {
    const layer = buildLabelLayer([company()], 'umsatz', new Float32Array([100]), 0)
    expect(layer.props.collisionEnabled).toBe(true)
  })
})
