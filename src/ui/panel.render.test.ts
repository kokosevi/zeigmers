// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { Company } from '../layers/visible'
import { showCompanyPanel, type CompanyContext } from './panel'

/** Was der Steckbrief einer Firma ZEICHNET.
 *
 *  `panel.test.ts` ist bewusst DOM-frei und prüft das Datenmodell — genau
 *  darum braucht es diese zweite Datei: die Entfernungen vom 17. August 2026
 *  («das ganze Kursiv geschriebene», «Kerngeschäft belegen», die UID) betreffen
 *  nicht das Modell, sondern nur, was `renderLayout` daraus zeigt. Ein Test am
 *  Modell allein würde sie nicht bewachen — `content.notes` ist ja weiterhin
 *  gefüllt. */

const ctx: CompanyContext = { metric: 'umsatz', rank: 1, rankTotal: 187, revenueTotal: 1_000_000_000 }

function company(overrides: Partial<Company> = {}): Company {
  return {
    uid: 'CHE-105.909.036',
    name: 'Beispiel AG',
    sixSymbol: 'BSP',
    lon: 8,
    lat: 47.4,
    revenueChf: 1_250_000_000,
    positionAdjusted: null,
    nogaGroupIndex: 0,
    orgForm: 'boersenkotiert',
    revenue: 1_250_000_000,
    currency: 'CHF',
    revenueType: 'net_sales',
    profit: 45_000_000,
    profitChf: 45_000_000,
    profitCurrency: 'CHF',
    // Beides erzeugt sonst je eine Kursivzeile: die Konsolidierungsbasis und
    // die freie Notiz aus den Daten.
    consolidationBasis: 'total_group',
    coreProducts: 'Pharmazeutische Wirkstoffe im Auftrag.',
    productsUrl: 'https://example.test/produkte',
    foundingYear: 1873,
    employees: 3400,
    fiscalYear: 2024,
    reportUrl: 'https://example.test/gb.pdf',
    note: 'Eine Bemerkung aus den Daten, die früher kursiv unter dem Raster stand.',
    placeholder: false,
    researched: true,
    city: 'Aarau',
    ...overrides,
  }
}

beforeEach(() => {
  document.body.innerHTML = '<div id="ui"></div>'
})

describe('Steckbrief einer Firma — was gezeichnet wird', () => {
  it('zeichnet keine Fussnoten, auch wo das Datenmodell welche trägt', () => {
    showCompanyPanel(company(), ctx)
    expect(document.querySelectorAll('.panel-fussnote')).toHaveLength(0)
    expect(document.getElementById('panel')?.textContent).not.toContain('Gesamtkonzern')
  })

  it('zeichnet keinen Anteilsbalken und keine Rangzeile', () => {
    showCompanyPanel(company(), ctx)
    expect(document.querySelector('.panel-anteil')).toBeNull()
    expect(document.querySelector('.panel-anteilzeile')).toBeNull()
    expect(document.getElementById('panel')?.textContent).not.toContain('Rang 1')
  })

  it('zeichnet im Fuss einen Link und keine Kennung', () => {
    showCompanyPanel(company(), ctx)
    const links = [...document.querySelectorAll<HTMLAnchorElement>('.panel-fuss a')]
    expect(links.map((a) => a.textContent)).toEqual(['Geschäftsbericht öffnen'])
    expect(document.querySelector('.panel-uid')).toBeNull()
    expect(document.getElementById('panel')?.textContent).not.toContain('CHE-105.909.036')
  })

  it('zeigt weiterhin Kopf, Hauptzahl, Raster und Branche', () => {
    // Die Gegenprobe zu den drei Tests darüber: entfernt wurde, was benannt war
    // — nicht der Steckbrief.
    showCompanyPanel(company(), ctx)
    const panel = document.getElementById('panel')!
    expect(panel.querySelector('h3')?.textContent).toBe('Beispiel AG')
    expect(panel.querySelector('.panel-kennung')?.textContent).toBe('BSP')
    expect(panel.querySelector('.panel-unterzeile')?.textContent).toContain('Aarau')
    expect(panel.querySelector('.panel-hauptzeile')?.textContent).toContain('Jahresumsatz')
    expect(panel.querySelectorAll('.panel-raster > *').length).toBeGreaterThan(0)
    expect(panel.textContent).toContain('Pharmazeutische Wirkstoffe im Auftrag.')
  })
})
