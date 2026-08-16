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

  it('nennt bei aktivem Filter die Auswahl, nicht die Kartenabdeckung', () => {
    // `totalCompanies` ist die Grundgesamtheit VOR dem Branchen-/
    // Organisationsformfilter (z. B. `companies.stats.count`) — schrumpft
    // ein Filter die Auswahl, sagt die Zeile das («X von Y … ausgewählt»).
    // Das Wort «ausgewählt» ist Pflicht, nicht Zierrat: die Legende zeigt
    // auf derselben Seite bereits ein anderes «X von Y» über Gesellschaften
    // (Kartenabdeckung ggü. kotierten SIX-Titeln) — ohne benannten Bezug
    // liessen sich die beiden Aussagen verwechseln.
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
    expect(text).toContain('1 von 2 Gesellschaften ausgewählt')
  })

  it('lässt «ausgewählt» weg, wenn kein Filter aktiv ist', () => {
    // Gegenprobe zum vorigen Test: ohne Filter (`totalCompanies ===
    // result.visible.length`) bliebe «ausgewählt» eine Behauptung über
    // einen Filter, den es gerade nicht gibt.
    const companies = [company({ nogaGroupIndex: 1 }), company({ nogaGroupIndex: 1 })]
    const result = applySelection(companies, auswahl('umsatz', [1]))
    expect(result.visible).toHaveLength(2)

    renderKennzahlen({
      result,
      metric: 'umsatz',
      totalCompanies: companies.length,
      nationalEmployees: null,
    })

    const text = document.getElementById('kennzahlen')!.textContent!
    expect(text).toContain('2 Gesellschaften')
    expect(text).not.toContain('ausgewählt')
    expect(text).not.toContain(' von ')
  })

  it('behauptet keine Null, wenn die Auswahl sichtbar, aber wertlos ist', () => {
    // Eine Branche voller Platzhalterfirmen bei Kennzahl Umsatz: sichtbar
    // (`visible.length > 0`), aber ohne einen einzigen Wert
    // (`withValue.length === 0`, siehe `domain/metric.ts`, `metricValue`).
    // `result.sum` ist dabei technisch `0` — dieselbe Ziffer wie eine
    // tatsächlich gemessene Nullsumme. Die Zeile darf diesen Unterschied
    // nicht verschweigen.
    const companies = Array.from({ length: 5 }, () => company({ placeholder: true }))
    const result = applySelection(companies, auswahl('umsatz', [1]))
    expect(result.visible).toHaveLength(5)
    expect(result.withValue).toHaveLength(0)

    renderKennzahlen({
      result,
      metric: 'umsatz',
      totalCompanies: result.visible.length,
      nationalEmployees: null,
    })

    const text = document.getElementById('kennzahlen')!.textContent!
    expect(text).not.toContain('0 CHF')
    expect(text).not.toContain('aus 0 Angaben')
    expect(text).toContain('keine')
  })

  it('zeigt den Vergleich nicht bei Umsatz oder Gewinn, selbst mit echter Vergleichszahl', () => {
    // Regressionsschutz: alle bisherigen Umsatz-/Gewinn-Tests übergeben
    // `nationalEmployees: null` — eine Regression, die die Kennzahl-Prüfung
    // entfernt und nur die Null-Prüfung stehen lässt, bliebe ohne diesen
    // Test unbemerkt. Der Vergleich «Mitarbeitende weltweit gegen
    // Beschäftigte in der Schweiz» ergibt neben einer Umsatz- oder
    // Gewinnsumme keinen Sinn.
    for (const metric of ['umsatz', 'gewinn'] as const) {
      const companies = [company()]
      const result = applySelection(companies, auswahl(metric, [1]))

      renderKennzahlen({ result, metric, totalCompanies: result.visible.length, nationalEmployees: 5_876_865 })

      expect(document.getElementById('kennzahlen')!.textContent).not.toContain('Vergleich')
    }
  })

  it('schreibt die Einzahl bei genau einer Gesellschaft bzw. einer Angabe', () => {
    // Bei engem Filter (eine einzige übrig gebliebene Branche mit genau
    // einer Gesellschaft) ist «1 Gesellschaften»/«aus 1 Angaben» ein
    // erreichbarer, falscher Plural.
    const companies = [company()]
    const result = applySelection(companies, auswahl('umsatz', [1]))
    expect(result.visible).toHaveLength(1)
    expect(result.withValue).toHaveLength(1)

    renderKennzahlen({
      result,
      metric: 'umsatz',
      totalCompanies: result.visible.length,
      nationalEmployees: null,
    })

    const text = document.getElementById('kennzahlen')!.textContent!
    expect(text).toContain('1 Gesellschaft')
    expect(text).not.toContain('1 Gesellschaften')
    expect(text).toContain('aus 1 Angabe')
    expect(text).not.toContain('aus 1 Angaben')
  })
})
