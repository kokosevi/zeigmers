// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { applySelection, type Selection } from '../domain/selection'
import type { Company } from '../layers/visible'
import { renderKennzahlen } from './kennzahlen'

// `renderKennzahlen` hängt sich an `#ui` (gleiches Muster wie `ui/legend.ts`,
// `box()`) — ohne dieses Grundgerüst bliebe die Zeile ein Element ohne
// Elternknoten, nie im `document` auffindbar.
beforeEach(() => {
  document.body.innerHTML = '<div id="ui"></div>'
})

// Dieselbe minimale Firmen-Fabrik wie `domain/selection.test.ts` und
// `ui/legend.test.ts` — auch hier entsteht `SelectionResult` aus echten
// Firmen über `applySelection`, statt Summen und Anzahlen von Hand in die
// Testfixtur zu schreiben (Zahlen werden hergeleitet, nie hartkodiert).
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

const auswahl = (metric: Selection['metric'], branches: number[]): Selection => ({
  metric,
  branches: new Set(branches),
  orgForms: new Set(['boersenkotiert']),
})

describe('renderKennzahlen', () => {
  it('nennt den Nenner der Summe, nicht nur die Grundgesamtheit', () => {
    // 187 Gesellschaften mit ausgewiesenen 0 CHF (ein gültiger Wert, siehe
    // `domain/metric.ts`) plus eine mit 762.1 Mrd. CHF ergeben 188 Angaben
    // mit Summe 762.1 Mrd. CHF — dazu 13 Platzhalterzeilen (`placeholder:
    // true`), die zwar sichtbar sind, aber keinen Wert in dieser Kennzahl
    // tragen. 188 + 13 = 201 sichtbare Gesellschaften, aber nur 188 Angaben.
    const mitWert = [
      ...Array.from({ length: 187 }, () => company({ revenueChf: 0 })),
      company({ revenueChf: 762_100_000_000 }),
    ]
    const ohneWert = Array.from({ length: 13 }, () => company({ placeholder: true }))
    const companies = [...mitWert, ...ohneWert]
    const result = applySelection(companies, auswahl('umsatz', [1]))
    expect(result.visible).toHaveLength(201)
    expect(result.withValue).toHaveLength(188)

    renderKennzahlen({
      result,
      metric: 'umsatz',
      totalCompanies: result.visible.length,
      nationalEmployees: null,
    })

    const text = document.getElementById('kennzahlen')!.textContent!
    expect(text).toContain('201 Gesellschaften')
    expect(text).toContain('aus 188 Angaben')
    // Die Summe selbst gehört dazu — ohne sie bliebe der Nenner ohne die
    // Zahl, die er trägt.
    expect(text).toContain('762.1 Mrd. CHF')
  })

  it('stellt bei Mitarbeitenden den Vergleich zur Schweiz daneben', () => {
    const companies = [
      company({ employees: 400_000 }),
      company({ employees: 300_000 }),
    ]
    const result = applySelection(companies, auswahl('mitarbeitende', [1]))

    renderKennzahlen({
      result,
      metric: 'mitarbeitende',
      totalCompanies: result.visible.length,
      nationalEmployees: 5_876_865,
    })

    const text = document.getElementById('kennzahlen')!.textContent!
    expect(text).toContain("5'876'865")
    expect(text).toContain('Vergleich')
  })

  it('lässt den Vergleich weg, wenn die Zahl fehlt', () => {
    const companies = [company({ employees: 400_000 })]
    const result = applySelection(companies, auswahl('mitarbeitende', [1]))

    renderKennzahlen({
      result,
      metric: 'mitarbeitende',
      totalCompanies: result.visible.length,
      nationalEmployees: null,
    })

    expect(document.getElementById('kennzahlen')!.textContent).not.toContain('Vergleich')
  })

  it('nennt bei Gewinn den Saldo und die Verlustfirmen', () => {
    // 41 Verlust-, 10 Gewinnfirmen — derselbe Bezug wie `metric.ts`s
    // Kommentar zu `metricAllowsNegative` ("41 der 201 Gesellschaften").
    const verlust = Array.from({ length: 41 }, () => company({ profitChf: -1_000_000 }))
    const gewinn = Array.from({ length: 10 }, () => company({ profitChf: 500_000 }))
    const companies = [...verlust, ...gewinn]
    const result = applySelection(companies, auswahl('gewinn', [1]))
    expect(result.losses).toBe(41)

    renderKennzahlen({
      result,
      metric: 'gewinn',
      totalCompanies: result.visible.length,
      nationalEmployees: null,
    })

    const text = document.getElementById('kennzahlen')!.textContent!
    expect(text).toContain('41')
    expect(text).toContain('Verlust')
  })

  it('sagt es, wenn die Auswahl leer ist', () => {
    const companies = [company()]
    const result = applySelection(companies, auswahl('umsatz', []))
    expect(result.visible).toHaveLength(0)

    renderKennzahlen({
      result,
      metric: 'umsatz',
      totalCompanies: companies.length,
      nationalEmployees: null,
    })

    expect(document.getElementById('kennzahlen')!.textContent).toContain('Keine Gesellschaft ausgewählt')
  })

  it('zeigt den Nenner des Filters, wenn dieser die Auswahl verkleinert hat', () => {
    // `totalCompanies` ist die Grundgesamtheit VOR dem Branchen-/
    // Organisationsformfilter (z. B. `companies.stats.count`) — schrumpft
    // ein Filter die Auswahl, sagt die Zeile das («X von Y»), sonst liesse
    // sich aus ihr allein nicht ablesen, dass gerade nicht alle
    // Gesellschaften mitgezählt werden.
    const companies = [
      company({ nogaGroupIndex: 1 }),
      company({ nogaGroupIndex: 2 }),
    ]
    const result = applySelection(companies, auswahl('umsatz', [1]))
    expect(result.visible).toHaveLength(1)

    renderKennzahlen({
      result,
      metric: 'umsatz',
      totalCompanies: companies.length,
      nationalEmployees: null,
    })

    const text = document.getElementById('kennzahlen')!.textContent!
    expect(text).toContain('1 von 2 Gesellschaften')
  })
})
