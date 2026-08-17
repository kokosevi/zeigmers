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
// entstehen `SelectionResult` aus echten Firmen über `applySelection`, statt
// Werte von Hand in die Testfixtur zu schreiben (Zahlen werden hergeleitet,
// nie hartkodiert).
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

/** Alle Zeilen (`<li>`) innerhalb von `#legende` als Text — hilft, gezielt
 *  nach einem Eintrag mit exakt diesem Wortlaut zu suchen (z. B. der
 *  Verlust-Swatch), statt einen Teilstring irgendwo in der ganzen Box zu
 *  matchen. */
function zeilenTexte(): string[] {
  return [...document.querySelectorAll('#leiste-liste li')].map((li) => li.textContent ?? '')
}

describe('renderLegend — Kahlschlag (Auftrag 2026-08-17)', () => {
  // Ansicht «Börsennotierte Firmen» zeigt seither nur noch Farbtupfer und
  // Branchenname je Zeile — weder Anzahl noch Anteil/Saldo. Vier der
  // ehemals erklärenden Sätze sind in die Eckbox umgezogen (siehe
  // `notices.test.ts`), der Rest ist ersatzlos entfallen.
  it('zeigt in einer Branchenzeile nur Farbtupfer und Namen, keine Zahl', () => {
    const companies = [company({ nogaGroupIndex: 1, revenueChf: 250 })]
    renderLegend(options(companies, 'umsatz'))
    const zeile = document.querySelector('[data-branch="1"]')!
    // Der Branchenname selbst steht fest (`NOGA_GROUPS`, Index 1) — die Zeile
    // darf daneben keine Ziffer und kein Prozentzeichen tragen.
    expect(zeile.textContent).not.toMatch(/\d/)
    expect(zeile.textContent).not.toContain('%')
  })

  it('zeigt keine «nur diese»-Schaltfläche mehr', () => {
    const companies = [company({ nogaGroupIndex: 1 })]
    renderLegend(options(companies, 'umsatz'))
    expect(document.querySelector('[data-only]')).toBeNull()
  })

  it('nennt den Weg zurück zur vollen Auswahl nur noch mit einem Wort', () => {
    const companies = [company({ nogaGroupIndex: 1 })]
    renderLegend(options(companies, 'umsatz'))
    expect(document.querySelector('[data-all-branches]')!.textContent).toBe('Alle')
  })

  it('zeigt keine Titelzeile mit Abdeckungsangabe mehr', () => {
    const companies = [company({ nogaGroupIndex: 1 })]
    renderLegend(options(companies, 'umsatz', { scopeLabel: '201 Gesellschaften von 224 kotierten SIX-Titeln' }))
    // Seit dem Redesign trägt die Leiste ein Gruppenlabel «Branchen» — dessen
    // Anwesenheit ist also kein Rückfall. Geprüft wird, was der Kahlschlag
    // tatsächlich meinte: die Abdeckungsangabe steht hier nicht mehr (sie ist
    // in die Vorbehalte des Leistenfusses gewandert, `ui/notices.ts`).
    expect(document.getElementById('leiste-liste')!.textContent).not.toContain('kotierten SIX-Titeln')
    expect(document.getElementById('leiste-liste')!.textContent).not.toContain('Datenjahr')
  })

  it('nennt keine erklärenden Sätze mehr (Randmarkierung, unrecherchiert, Mindesthöhe, Branchenzahl)', () => {
    const companies = [company({ nogaGroupIndex: 1 })]
    renderLegend(options(companies, 'umsatz'))
    const text = document.getElementById('leiste-liste')!.textContent!
    expect(text).not.toContain('Balken mit Rand')
    expect(text).not.toContain('noch nicht recherchiert')
    expect(text).not.toContain('Mindesthöhe')
    expect(text).not.toContain('Branchenzahl')
  })

  it('nennt keine Bezugszeile «Höchste Säule» mehr', () => {
    const companies = [
      company({ nogaGroupIndex: 1, name: 'Nestlé', revenueChf: 89_500_000_000 }),
      company({ nogaGroupIndex: 1, name: 'Kleinfirma AG', revenueChf: 1_000_000 }),
    ]
    renderLegend(options(companies, 'umsatz'))
    expect(document.getElementById('leiste-liste')!.textContent).not.toContain('Höchste Säule')
  })

  // Auftraggeber-Korrektur (2026-08-17): der Leerauswahl-Hinweis war zunächst
  // mit den übrigen erklärenden Sätzen entfernt worden — zu Unrecht, er ist
  // kein erklärender Satz, sondern die Antwort auf einen Zustand, den die
  // Karte sonst unerklärt liesse (leere Karte: kaputt oder selbst gefiltert?).
  it('sagt es, wenn alle Branchen abgewählt sind', () => {
    const companies = [company({ nogaGroupIndex: 1 })]
    renderLegend(options(companies, 'umsatz', { selectedBranches: new Set() }))
    expect(document.getElementById('leiste-liste')!.textContent).toContain('Keine Branche ausgewählt')
  })

  it('zeigt den Leerauswahl-Hinweis nicht, solange mindestens eine Branche gewählt ist', () => {
    const companies = [
      company({ nogaGroupIndex: 1 }),
      company({ nogaGroupIndex: 2 }),
    ]
    renderLegend(options(companies, 'umsatz', { selectedBranches: new Set([1]) }))
    expect(document.getElementById('leiste-liste')!.textContent).not.toContain('Keine Branche ausgewählt')
  })

  it('zeigt bei Ansicht «Beschäftigte» weiterhin die Titelzeile mit Jahr und Einheit', () => {
    renderLegend({
      view: 'beschaeftigte',
      year: 2023,
      presentGroups: presentGroupsFromIndices([1, 2]),
      scopeLabel: 'Kanton Aargau',
    })
    const titel = document.querySelector('.leiste-label')
    expect(titel).not.toBeNull()
    expect(titel!.textContent).toContain('Beschäftigte')
    expect(titel!.textContent).toContain('Kanton Aargau')
    expect(titel!.textContent).toContain('Datenjahr 2023')
  })
})

describe('renderLegend als Filter', () => {
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

  it('bildet für die Branchenschaltflächen eine benannte ARIA-Gruppe', () => {
    // Ohne `role="group"` gibt der Container seinen `aria-label` nicht aus
    // (dasselbe Muster, das Task 12 für die Organisationsform in `ui/nav.ts`
    // schon einmal geschlossen hat) — eine Screenreader-Nutzerin hörte sonst
    // nur "Button, gedrückt, Industrie und Energie", ohne jeden Hinweis,
    // dass die Zeilen eine zusammengehörige Gruppe bilden.
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
})

describe('renderLegend — Verlustfarbe (Finding C2, seit 2026-08-17 auf ein Wort gekürzt)', () => {
  it('zeigt in der Gewinn-Ansicht einen Swatch mit dem Wort «Verlust»', () => {
    const companies = [company({ nogaGroupIndex: 1, profitChf: -1 })]
    renderLegend(options(companies, 'gewinn'))
    expect(zeilenTexte()).toContain('Verlust')
  })

  it('zeigt den Verlust-Swatch nicht bei Umsatz oder Mitarbeitende', () => {
    for (const metric of ['umsatz', 'mitarbeitende'] as const) {
      const companies = [company({ nogaGroupIndex: 1 })]
      renderLegend(options(companies, metric))
      expect(zeilenTexte()).not.toContain('Verlust')
    }
  })

  // Regressionsschutz: `lossSwatch` hing bisher nur an `metric === 'gewinn'`,
  // nicht daran, ob die aktuelle AUSWAHL überhaupt eine Verlustfirma enthält
  // — eine auf eine verlustfreie Branche gefilterte Karte erklärte damit eine
  // Farbe, die sie gar nicht zeichnete (das Spiegelbild von Finding C2).
  it('zeigt den Verlust-Swatch nicht, wenn die Auswahl keine Verlustfirma enthält', () => {
    const companies = [company({ nogaGroupIndex: 1, profitChf: 10_000_000 })]
    renderLegend(options(companies, 'gewinn'))
    expect(zeilenTexte()).not.toContain('Verlust')
  })
})
