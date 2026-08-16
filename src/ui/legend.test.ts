// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { presentGroupsFromIndices } from '../domain/legendGroups'
import { applySelection, type Selection } from '../domain/selection'
import type { Company } from '../layers/visible'
import { renderLegend, type LegendOptions } from './legend'

// `renderLegend` hängt sich an `#ui` (siehe `box()` in `legend.ts`) —
// dasselbe Element, das `firmen/index.html` im echten Markup bereitstellt.
// Ohne dieses Grundgerüst bliebe die Legende ein Element ohne Elternknoten,
// nie im `document` auffindbar.
beforeEach(() => {
  document.body.innerHTML = '<div id="ui"></div>'
})

// Dieselbe minimale Firmen-Fabrik wie `domain/selection.test.ts` — auch hier
// entstehen `SelectionResult`/`branchTotals` aus echten Firmen über
// `applySelection`, statt Summen und Anzahlen von Hand in die Testfixtur zu
// schreiben (Zahlen werden hergeleitet, nie hartkodiert).
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

/** Baut die Basisoptionen aus echten Firmen, statt `SelectionResult` von Hand
 *  zusammenzustellen — jeder Test überschreibt nur, was er tatsächlich
 *  prüft. */
function options(
  companies: Company[],
  metric: Selection['metric'],
  overrides: Partial<LegendOptions> = {},
): LegendOptions {
  const branches = [...new Set(companies.map((c) => c.nogaGroupIndex))]
  const result = applySelection(companies, auswahl(metric, branches))
  return {
    view: 'sichtbare',
    year: 2025,
    presentGroups: presentGroupsFromIndices(companies.map((c) => c.nogaGroupIndex)),
    metric,
    result,
    ...overrides,
  }
}

describe('renderLegend als Filter', () => {
  it('zeigt bei Umsatz den Anteil je Branche', () => {
    // Gruppe 1: 250 + 150 = 400. Gruppe 2: 100. Gesamtsumme 500 — Gruppe 1
    // trägt 400/500 = 80 % bei.
    const companies = [
      company({ nogaGroupIndex: 1, revenueChf: 250 }),
      company({ nogaGroupIndex: 1, revenueChf: 150 }),
      company({ nogaGroupIndex: 2, revenueChf: 100 }),
    ]
    renderLegend(options(companies, 'umsatz'))
    expect(document.querySelector('[data-branch="1"]')!.textContent).toContain('80 %')
  })

  it('zeigt bei Gewinn den Saldo statt eines Anteils', () => {
    // Ein Anteil an einer Summe, in die 41 negative Beträge eingehen, wäre
    // eine Zahl ohne Bedeutung — deshalb der Saldo, nicht ein Prozentwert.
    const companies = [company({ nogaGroupIndex: 1, profitChf: -75_000_000 })]
    renderLegend(options(companies, 'gewinn'))
    const text = document.querySelector('[data-branch="1"]')!.textContent!
    expect(text).toContain('Verlust')
    expect(text).not.toContain('%')
  })

  it('zeigt bei gemischten Vorzeichen den Saldo, nicht die Summe der Beträge', () => {
    // Regressionsschutz für eine offene Testlücke aus Task 7: `branchTotals`
    // summiert vorzeichenrichtig (+300 Mio., -100 Mio. = 200 Mio.), nicht die
    // Summe der Beträge (400 Mio.) — ein Rückfall auf Letzteres blieb bisher
    // unentdeckt, weil kein Test eine Branche mit Gewinn- UND Verlustfirmen
    // durch die Legende schickte.
    const companies = [
      company({ nogaGroupIndex: 1, profitChf: 300_000_000 }),
      company({ nogaGroupIndex: 1, profitChf: -100_000_000 }),
    ]
    renderLegend(options(companies, 'gewinn'))
    const text = document.querySelector('[data-branch="1"]')!.textContent!
    expect(text).toContain('200 Mio.')
    expect(text).not.toContain('400 Mio.')
  })

  it('meldet den Klick auf eine Branche', () => {
    const getoggelt: number[] = []
    const companies = [
      company({ nogaGroupIndex: 1 }),
      company({ nogaGroupIndex: 2 }),
    ]
    renderLegend(options(companies, 'umsatz', { onToggleBranch: (i) => getoggelt.push(i) }))
    document.querySelector<HTMLButtonElement>('[data-branch="1"]')!.click()
    expect(getoggelt).toEqual([1])
  })

  it('meldet den Klick auf «nur diese»', () => {
    const nurDiese: number[] = []
    const companies = [
      company({ nogaGroupIndex: 1 }),
      company({ nogaGroupIndex: 2 }),
    ]
    renderLegend(options(companies, 'umsatz', { onOnlyBranch: (i) => nurDiese.push(i) }))
    document.querySelector<HTMLButtonElement>('[data-only="2"]')!.click()
    expect(nurDiese).toEqual([2])
  })

  it('meldet den Klick auf «alle»', () => {
    let aufgerufen = 0
    const companies = [company({ nogaGroupIndex: 1 })]
    renderLegend(options(companies, 'umsatz', { onAllBranches: () => aufgerufen++ }))
    document.querySelector<HTMLButtonElement>('[data-all-branches]')!.click()
    expect(aufgerufen).toBe(1)
  })

  it('markiert abgewählte Branchen', () => {
    const companies = [
      company({ nogaGroupIndex: 1 }),
      company({ nogaGroupIndex: 2 }),
    ]
    renderLegend(options(companies, 'umsatz', { selectedBranches: new Set([2]) }))
    expect(document.querySelector('[data-branch="1"]')!.getAttribute('aria-pressed')).toBe('false')
    expect(document.querySelector('[data-branch="2"]')!.getAttribute('aria-pressed')).toBe('true')
  })

  it('sagt es, wenn alle Branchen abgewählt sind', () => {
    const companies = [company({ nogaGroupIndex: 1 })]
    renderLegend(options(companies, 'umsatz', { selectedBranches: new Set() }))
    expect(document.getElementById('legende')!.textContent)
      .toContain('Keine Branche ausgewählt')
  })

  it('bildet für die Branchenschaltflächen eine benannte ARIA-Gruppe', () => {
    // Ohne `role="group"` gibt der Container seinen `aria-label` nicht aus
    // (dasselbe Muster, das Task 12 für die Organisationsform in `ui/nav.ts`
    // schon einmal geschlossen hat) — eine Screenreader-Nutzerin hörte sonst
    // nur "Button, gedrückt, Industrie und Energie, 3, 45 %", ohne jeden
    // Hinweis, dass die Zeilen eine zusammengehörige Gruppe bilden.
    const companies = [
      company({ nogaGroupIndex: 1 }),
      company({ nogaGroupIndex: 2 }),
    ]
    renderLegend(options(companies, 'umsatz'))
    const gruppe = document.querySelector('[aria-label="Branchen"]')
    expect(gruppe?.getAttribute('role')).toBe('group')
    expect(gruppe?.contains(document.querySelector('[data-branch="1"]'))).toBe(true)
    expect(gruppe?.contains(document.querySelector('[data-branch="2"]'))).toBe(true)
  })

  it('nennt, worauf sich die Höhe gerade bezieht', () => {
    // Auswahlabhängiges vmax ohne Bezugszeile behauptete einen absoluten
    // Massstab, den die Karte nicht hat.
    const companies = [
      company({ nogaGroupIndex: 1, name: 'Nestlé', revenueChf: 89_500_000_000 }),
      company({ nogaGroupIndex: 1, name: 'Kleinfirma AG', revenueChf: 1_000_000 }),
    ]
    renderLegend(options(companies, 'umsatz'))
    expect(document.getElementById('legende')!.textContent).toContain('Höchste Säule')
    expect(document.getElementById('legende')!.textContent).toContain('Nestlé')
  })

  // Finding I8: `result.vmax` ist der vorzeichenlose BETRAG (siehe
  // `applySelection`, `Math.abs`) — bei einer Verlustfirma an der Spitze
  // stand hier bisher ein positiver Betrag ohne das Wort «Verlust».
  it('nennt bei einem Verlust an der Spitze das Wort «Verlust», nicht den blossen Betrag', () => {
    const companies = [
      company({ nogaGroupIndex: 1, name: 'Grösster Verlust AG', profitChf: -900_000_000 }),
      company({ nogaGroupIndex: 1, name: 'Kleiner Gewinn AG', profitChf: 10_000_000 }),
    ]
    renderLegend(options(companies, 'gewinn'))
    const text = document.getElementById('legende')!.textContent!
    expect(text).toContain('Höchste Säule')
    expect(text).toContain('Grösster Verlust AG')
    expect(text).toMatch(/Höchste Säule:[^]*Verlust/)
  })
})

describe('renderLegend — Verlustfarbe (Finding C2)', () => {
  it('zeigt in der Gewinn-Ansicht einen Swatch für die Verlustfarbe', () => {
    const companies = [company({ nogaGroupIndex: 1, profitChf: -1 })]
    renderLegend(options(companies, 'gewinn'))
    const text = document.getElementById('legende')!.textContent!
    expect(text).toContain('Verlust')
    expect(text).toMatch(/Diese Farbe/)
  })

  it('zeigt den Verlust-Swatch nicht bei Umsatz oder Mitarbeitende', () => {
    for (const metric of ['umsatz', 'mitarbeitende'] as const) {
      const companies = [company({ nogaGroupIndex: 1 })]
      renderLegend(options(companies, metric))
      expect(document.getElementById('legende')!.textContent).not.toMatch(/Diese Farbe/)
    }
  })
})

describe('renderLegend — Mindesthöhen-Hinweis folgt der Kennzahl (Finding I1)', () => {
  it.each([
    ['umsatz' as const, 'nicht mehr den Umsatz'],
    ['mitarbeitende' as const, 'nicht mehr die Mitarbeitendenzahl'],
    ['gewinn' as const, 'nicht mehr den Reingewinn'],
  ])('nennt bei Kennzahl %s die richtige Grösse', (metric, expected) => {
    const companies = [company({ nogaGroupIndex: 1 })]
    renderLegend(options(companies, metric))
    expect(document.getElementById('legende')!.textContent).toContain(expected)
  })
})

describe('renderLegend — Branchenzahl-Hinweis (Finding I4)', () => {
  it('sagt, dass die Branchenzahl nur Gesellschaften mit Wert zählt', () => {
    const companies = [company({ nogaGroupIndex: 1 })]
    renderLegend(options(companies, 'umsatz'))
    expect(document.getElementById('legende')!.textContent).toContain('Branchenzahl')
  })
})
