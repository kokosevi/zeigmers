import { describe, expect, it } from 'vitest'
import type { Level, LevelMeta } from '../data/loader'
import type { Company } from '../layers/visible'
import {
  aggregateCellContent,
  companyContent,
  configureCanton,
  type CompanyContext,
  type PanelContent,
} from './panel'

// Diese Tests prüfen genau die Formulierungen, deren Regression dieses
// Projekt am meisten schaden würde: die Obergrenzen-Notiz auf Aggregaten
// (mit korrektem Geltungsbereich Gemeinde vs. Kanton) und die
// Nicht-Vergleichbarkeits-Kennzeichnung bei `operating_income` (siehe
// Abschluss-Review, Finding I9). `panel.ts` ist bewusst DOM-frei dafür gebaut
// — genau damit sich das hier, ohne Browser, prüfen lässt.

const NOGA_GROUPS: LevelMeta['nogaGroups'] = [
  { key: 'industrie', label: 'Industrie', color: '#111111' },
  { key: 'finanz', label: 'Finanzdienstleistungen', color: '#222222' },
]

function baseMeta(overrides: Partial<LevelMeta> = {}): LevelMeta {
  return {
    level: 'gemeinde',
    year: 2023,
    canton: 'AG',
    count: 2,
    arrays: {},
    nogaGroups: NOGA_GROUPS,
    unknownColor: '#BFBFBF',
    unknownIndex: 255,
    stats: { min: 4, max: 100, sum: 104, p99: 100, ambiguousCells: 1, overstatementMax: 3 },
    ...overrides,
  }
}

function aggregateLevel(
  opts: {
    level: 'gemeinde' | 'kanton'
    value?: number
    dist?: number[]
    gemeinden?: LevelMeta['gemeinden']
    gemeindeIdx?: number
    population?: number
  },
): Level {
  return {
    meta: baseMeta({
      level: opts.level,
      gemeinden: opts.gemeinden,
      stats: {
        min: 4,
        max: 100,
        sum: 104,
        p99: 100,
        ambiguousCells: 1,
        overstatementMax: 3,
        population: opts.population,
      },
    }),
    arrays: {
      positions: new Float32Array([8.0, 47.4]),
      values: new Float32Array([opts.value ?? 1000]),
      noga: new Uint8Array([0]),
      flags: new Uint8Array([0]),
      dist: new Float32Array(opts.dist ?? [600, 400]),
      gemeindeIdx:
        opts.gemeindeIdx !== undefined ? new Uint16Array([opts.gemeindeIdx]) : undefined,
    },
  }
}

function company(overrides: Partial<Company> = {}): Company {
  return {
    uid: 'CHE-1',
    name: 'Beispiel AG',
    sixSymbol: null,
    lon: 8,
    lat: 47.4,
    revenueChf: null,
    positionAdjusted: null,
    nogaGroupIndex: 0,
    orgForm: 'boersenkotiert',
    revenue: 1_250_000_000,
    currency: 'CHF',
    revenueType: 'net_sales',
    profit: 45_000_000,
    profitChf: 45_000_000,
    profitCurrency: 'CHF',
    consolidationBasis: 'total_group',
    coreProducts: 'Pharmazeutische Wirkstoffe im Auftrag.',
    productsUrl: null,
    foundingYear: 1873,
    employees: 3400,
    fiscalYear: 2024,
    reportUrl: 'https://example.test/gb.pdf',
    note: null,
    placeholder: false,
    researched: true,
    city: 'Aarau',
    ...overrides,
  }
}

// Standardkontext für Tests, denen der Rang/Anteil selbst egal ist — 185
// recherchierte Gesellschaften mit Umsatzwert, die Beispielfirma auf Rang 1.
// `companyContent` rechnet Rang und Nenner nicht selbst (siehe Kommentar bei
// `CompanyContext` in `panel.ts`); wer den echten Kontext befüllt, ist eine
// Folgeaufgabe, hier genügt ein plausibler Platzhalter.
function ctx(overrides: Partial<CompanyContext> = {}): CompanyContext {
  return { metric: 'umsatz', rank: 1, rankTotal: 185, revenueTotal: 1_000_000_000, ...overrides }
}

function field(content: PanelContent, label: string): string | undefined {
  return content.fields.find((f) => f.label === label)?.value
}

function labels(content: PanelContent): string[] {
  return content.fields.map((f) => f.label)
}

describe('aggregateCellContent', () => {
  it('marks the sum as an upper bound (Obergrenze), never as an exact figure', () => {
    const content = aggregateCellContent(
      aggregateLevel({ level: 'kanton', value: 383203 }),
      0,
    )
    expect(content.footnote).toMatch(/Obergrenze/)
    expect(content.footnote).toMatch(/keine exakte Zahl/)
  })

  // Change 1 (2026-08-14): die Obergrenzen-Notiz ist jetzt `footnote`, nicht
  // mehr Teil von `notes` — sie soll unten im Panel erscheinen, kleiner
  // gewichtet, `notes` bleibt für Hinweise auf Feld-Ebene reserviert.
  it('no longer places the upper-bound note in notes', () => {
    const content = aggregateCellContent(aggregateLevel({ level: 'kanton' }), 0)
    expect(content.notes).toEqual([])
  })

  it('scopes the overstatement figure to the municipality, using its own ambiguous count', () => {
    const gemeinden: LevelMeta['gemeinden'] = [
      { bfsNr: 4001, name: 'Aarau', ambiguousCells: 5 },
      { bfsNr: 4002, name: 'Baden', ambiguousCells: 12 },
    ]
    const content = aggregateCellContent(
      aggregateLevel({ level: 'gemeinde', gemeinden, gemeindeIdx: 1 }),
      0,
    )
    expect(content.title).toBe('Baden')
    expect(content.footnote).toContain('in dieser Gemeinde')
    // 3 * ambiguousCells (12) = 36, nicht die kantonsweite overstatementMax (3).
    expect(content.footnote).toContain('36')
    expect(content.footnote).not.toContain('im ganzen Kanton')
  })

  it('falls back to the canton-wide overstatement figure when there is no municipality', () => {
    const content = aggregateCellContent(aggregateLevel({ level: 'kanton' }), 0)
    expect(content.footnote).toContain('im ganzen Kanton')
    // overstatementMax aus stats (3) statt einer Gemeindezahl.
    expect(content.footnote).toContain('3')
    expect(content.footnote).not.toContain('in dieser Gemeinde')
  })

  it('uses the configured canton name for the canton-level title', () => {
    configureCanton('Zürich')
    const content = aggregateCellContent(aggregateLevel({ level: 'kanton' }), 0)
    expect(content.title).toBe('Kanton Zürich')
    configureCanton('Aargau') // andere Tests nicht beeinflussen
  })

  // Change 2 (2026-08-14): Beschäftigte je Einwohner, direkt nach der Summe.
  describe('employees per inhabitant', () => {
    it('adds the ratio directly after the employee count, noting the differing years', () => {
      const gemeinden: LevelMeta['gemeinden'] = [
        { bfsNr: 4001, name: 'Islisberg', ambiguousCells: 0, einwohnerzahl: 692 },
      ]
      const content = aggregateCellContent(
        aggregateLevel({ level: 'gemeinde', gemeinden, gemeindeIdx: 0, value: 99 }),
        0,
      )
      expect(content.fields[0]?.label).toBe('Beschäftigte')
      expect(content.fields[1]?.label).toBe('Beschäftigte je Einwohner')
      expect(content.fields[1]?.value).toMatch(/^0[.,]14\b/) // 99 / 692 ≈ 0.1431
    })

    it('omits the ratio when einwohnerzahl is missing (no crash, no fabricated ratio)', () => {
      const gemeinden: LevelMeta['gemeinden'] = [
        { bfsNr: 4001, name: 'Ohne Bevölkerungszahl', ambiguousCells: 0 },
      ]
      const content = aggregateCellContent(
        aggregateLevel({ level: 'gemeinde', gemeinden, gemeindeIdx: 0, value: 99 }),
        0,
      )
      expect(content.fields).toHaveLength(1)
      expect(content.fields.find((f) => f.label.includes('Einwohner'))).toBeUndefined()
    })

    it('omits the ratio when einwohnerzahl is exactly zero (no division by zero)', () => {
      const gemeinden: LevelMeta['gemeinden'] = [
        { bfsNr: 4001, name: 'Nullgemeinde', ambiguousCells: 0, einwohnerzahl: 0 },
      ]
      const content = aggregateCellContent(
        aggregateLevel({ level: 'gemeinde', gemeinden, gemeindeIdx: 0, value: 99 }),
        0,
      )
      expect(content.fields).toHaveLength(1)
      expect(
        content.fields.some((f) => f.value.includes('Infinity') || f.value.includes('NaN')),
      ).toBe(false)
    })

    it('falls back to the canton-wide population for a canton-level cell', () => {
      const content = aggregateCellContent(
        aggregateLevel({ level: 'kanton', value: 383203, population: 735808 }),
        0,
      )
      expect(content.fields[1]?.label).toBe('Beschäftigte je Einwohner')
      expect(content.fields[1]?.value).toMatch(/^0[.,]52\b/) // 383203 / 735808 ≈ 0.5208
    })
  })
})

describe('companyContent — unresearched (Phase 3)', () => {
  it('shows only name and seat, with a distinct "not yet researched" note', () => {
    const content = companyContent(company({
      researched: false, city: 'St. Gallen',
      revenue: null, revenueType: null, profit: null, consolidationBasis: null,
      coreProducts: null, foundingYear: null, employees: null, fiscalYear: null,
      reportUrl: null,
    }), ctx())
    expect(content.title).toBe('Beispiel AG')
    expect(content.fields).toEqual([{ label: 'Sitz', value: 'St. Gallen' }])
    expect(content.notes).toHaveLength(1)
    expect(content.notes[0]).toMatch(/noch nicht recherchiert/i)
    // Nicht dieselbe Formulierung wie "Umsatz nicht öffentlich verfügbar" —
    // das wäre eine andere Aussage (siehe Kommentar bei companyContent()).
    expect(content.notes[0]).not.toMatch(/öffentlich verfügbar/i)
  })

  it('omits the Sitz field when no seat is known at all', () => {
    const content = companyContent(company({ researched: false, city: null }), ctx())
    expect(content.fields).toEqual([])
  })

  it('has no links or footnote for an unresearched company', () => {
    const content = companyContent(company({ researched: false }), ctx())
    expect(content.links ?? []).toEqual([])
    expect(content.footnote).toBeUndefined()
  })
})

describe('companyContent', () => {
  it('labels net_sales as ordinary Nettoumsatz', () => {
    const content = companyContent(company({ revenueType: 'net_sales' }), ctx())
    const revenue = content.fields.find((f) => f.label.includes('Jahresumsatz'))
    expect(revenue?.label).toBe('Jahresumsatz (Nettoumsatz)')
  })

  it('names operating_income explicitly as not comparable to net sales', () => {
    const content = companyContent(company({ revenueType: 'operating_income' }), ctx())
    const revenue = content.fields.find((f) => f.label.includes('Geschäftsertrag'))
    expect(revenue?.label).toMatch(/Geschäftsertrag/)
    expect(revenue?.label).toMatch(/nicht mit Nettoumsatz vergleichbar/)
  })

  it('shows an explicit hint instead of a fabricated number when revenue is absent', () => {
    const content = companyContent(
      company({ placeholder: true, revenue: null, note: 'Nicht kotiert genug Angaben' }),
      ctx(),
    )
    expect(content.notes).toContain('Umsatz nicht öffentlich verfügbar.')
    expect(content.fields.find((f) => f.label.includes('Umsatz'))).toBeUndefined()
  })

  it('leads with Sitz, Gegründet and Branche, ahead of the figures', () => {
    const content = companyContent(company({ city: 'Zofingen', foundingYear: 1873 }), ctx())
    expect(content.fields[0]).toEqual({ label: 'Sitz', value: 'Zofingen' })
    expect(content.fields[1]).toEqual({ label: 'Gegründet', value: '1873' })
    expect(content.fields[2]?.label).toBe('Branche')
  })

  it('omits Gegründet when the founding year could not be sourced', () => {
    const content = companyContent(company({ foundingYear: null }), ctx())
    expect(content.fields.find((f) => f.label === 'Gegründet')).toBeUndefined()
  })

  it('shows the core products line when sourced', () => {
    const content = companyContent(
      company({ coreProducts: 'Pharmazeutische Wirkstoffe im Auftrag.' }),
      ctx(),
    )
    const products = content.fields.find((f) => f.label === 'Kerngeschäft')
    expect(products?.value).toBe('Pharmazeutische Wirkstoffe im Auftrag.')
  })

  it('notes instead of fabricating when core products could not be sourced', () => {
    const content = companyContent(company({ coreProducts: null }), ctx())
    expect(content.fields.find((f) => f.label === 'Kerngeschäft')).toBeUndefined()
    expect(content.notes).toContain('Kerngeschäft nicht aus einer Primärquelle auffindbar.')
  })

  it('shows net profit under a label that needs no revenue_type-style caveat', () => {
    const content = companyContent(company({ profit: 45_000_000, profitCurrency: 'CHF' }), ctx())
    const profit = content.fields.find((f) => f.label.startsWith('Reingewinn'))
    expect(profit?.value).toMatch(/45\s*Mio\.?\s*CHF/)
  })

  it('renders a loss as the word «Verlust», never a bare minus sign', () => {
    const content = companyContent(company({ profit: -3_071_000, profitCurrency: 'EUR' }), ctx())
    const profit = content.fields.find((f) => f.label.startsWith('Reingewinn'))
    expect(profit?.value).toMatch(/^Verlust\s+3[.,]07\s*Mio\.?\s*EUR$/)
    expect(profit?.value).not.toContain('-')
  })

  it('notes instead of fabricating when profit could not be sourced', () => {
    const content = companyContent(company({ profit: null }), ctx())
    expect(content.fields.find((f) => f.label.startsWith('Reingewinn'))).toBeUndefined()
    expect(content.notes).toContain('Reingewinn nicht öffentlich verfügbar.')
  })

  // Diese vier Tests prüfen dieselbe Art Regression wie die revenueType-Tests
  // oben (siehe Kommentar am Dateianfang): `consolidationBasis` steht seit
  // kurzem in `companies.json`, muss aber im Panel in Klartext erscheinen —
  // nicht nur bei DSM-Firmenich (`continuing_operations`), sondern immer,
  // damit ein Leser den Normalfall nicht stillschweigend annehmen muss.
  describe('consolidation basis', () => {
    it('names the total_group basis in plain German, not the raw enum value', () => {
      const content = companyContent(company({ consolidationBasis: 'total_group' }), ctx())
      expect(content.notes).toContain('Umsatz und Reingewinn: Zahlen für den Gesamtkonzern.')
      expect(content.notes.join(' ')).not.toContain('total_group')
    })

    it('names the continuing_operations basis in plain German, not the raw enum value', () => {
      const content = companyContent(company({ consolidationBasis: 'continuing_operations' }), ctx())
      expect(content.notes).toContain(
        'Umsatz und Reingewinn: Zahlen für die fortgeführten Geschäfte.',
      )
      expect(content.notes.join(' ')).not.toContain('continuing_operations')
    })

    it('omits the basis note entirely when no basis is recorded', () => {
      const content = companyContent(company({ consolidationBasis: null }), ctx())
      expect(content.notes.some((n) => n.includes('Gesamtkonzern'))).toBe(false)
      expect(content.notes.some((n) => n.includes('fortgeführ'))).toBe(false)
    })

    it('places the basis note ahead of the row’s own explanatory note, not after', () => {
      const content = companyContent(
        company({
          consolidationBasis: 'continuing_operations',
          note: 'Ausführliche Erklärung zur Tierernährungssparte.',
        }),
        ctx(),
      )
      const basisIndex = content.notes.findIndex((n) => n.includes('fortgeführten Geschäfte'))
      const ownNoteIndex = content.notes.indexOf('Ausführliche Erklärung zur Tierernährungssparte.')
      expect(basisIndex).toBeGreaterThan(-1)
      expect(ownNoteIndex).toBeGreaterThan(basisIndex)
    })
  })

  it('keeps fiscal year and employees after the figures, in that order', () => {
    const content = companyContent(company({ fiscalYear: 2025, employees: 3891 }), ctx())
    const fiscalYearIndex = content.fields.findIndex((f) => f.label === 'Geschäftsjahr')
    const employeesIndex = content.fields.findIndex((f) => f.label === 'Mitarbeitende')
    const profitIndex = content.fields.findIndex((f) => f.label.startsWith('Reingewinn'))
    expect(fiscalYearIndex).toBeGreaterThan(-1)
    expect(employeesIndex).toBeGreaterThan(fiscalYearIndex)
    expect(fiscalYearIndex).toBeGreaterThan(profitIndex)
  })
})

// Task 15: aus vorhandenen Daten hergeleitete Zusatzfelder, die das Panel
// bisher verschwieg — Rang, Marge, Umsatz je Mitarbeitenden, Anteil am
// Gesamtumsatz, SIX-Symbol und der Link auf die Produktquelle.
describe('companyContent — Rang, Marge, Kennzahlen aus abgeleiteten Werten', () => {
  it('nennt den Rang mit seinem Nenner', () => {
    const content = companyContent(company(), ctx({ metric: 'umsatz', rank: 3, rankTotal: 188 }))
    expect(field(content, 'Rang')).toBe('#3 von 188 nach Jahresumsatz')
  })

  it('lässt den Rang weg, wo die Kennzahl fehlt', () => {
    const content = companyContent(
      company({ revenueChf: null, placeholder: true }),
      ctx({ rank: null, rankTotal: 188 }),
    )
    expect(field(content, 'Rang')).toBeUndefined()
  })

  it('benennt die Marge nach ihrem Nenner', () => {
    // 42 der 185 rechnen gegen Geschäftsertrag, nicht gegen Nettoumsatz — eine
    // Zeile «Marge» ohne diese Unterscheidung stellte zwei verschiedene
    // Grössen unter demselben Namen (siehe Kommentar bei `companyContent`).
    const bank = company({ revenueType: 'operating_income', revenue: 1000, profit: 100 })
    expect(labels(companyContent(bank, ctx()))).toContain('Marge auf Geschäftsertrag')
    const firma = company({ revenueType: 'net_sales', revenue: 1000, profit: 100 })
    expect(labels(companyContent(firma, ctx()))).toContain('Marge auf Nettoumsatz')
  })

  it('rechnet die Marge korrekt und weist sie in Prozent aus', () => {
    const content = companyContent(
      company({ revenueType: 'net_sales', revenue: 1000, profit: 250 }),
      ctx(),
    )
    expect(field(content, 'Marge auf Nettoumsatz')).toBe('25.00 %')
  })

  it('lässt die Marge weg, wenn Umsatz oder Gewinn fehlt', () => {
    const ohneUmsatz = companyContent(company({ revenue: null, profit: 100 }), ctx())
    expect(labels(ohneUmsatz).some((l) => l.startsWith('Marge'))).toBe(false)
    const ohneGewinn = companyContent(company({ revenue: 1000, profit: null }), ctx())
    expect(labels(ohneGewinn).some((l) => l.startsWith('Marge'))).toBe(false)
  })

  it('rendert eine Verlustmarge als «Verlust», nie als Minuszeichen', () => {
    // 41 der 185 Gesellschaften weisen einen Verlust aus — dieselbe
    // Konvention wie beim Reingewinn selbst (`ui/format.ts`, `formatProfit`):
    // ein Minuszeichen vor einer Prozentzahl übersieht man genauso leicht
    // wie vor einem grossen Betrag.
    const content = companyContent(
      company({ revenueType: 'net_sales', revenue: 1000, profit: -100 }),
      ctx(),
    )
    const marge = field(content, 'Marge auf Nettoumsatz')
    expect(marge).toBe('Verlust 10.00 %')
    expect(marge).not.toContain('-')
  })

  // Molecular Partners AG: recherchiert, aber ohne öffentlichen Umsatz —
  // `revenueChf: 0` ist hier die ETL-Invariante für «kein Wert»
  // (`placeholder: true`, dasselbe Muster wie `metricValue()` in
  // `domain/metric.ts`), nicht eine gemessene Null. Ohne den
  // `placeholder`-Schutz stünde «Umsatz je Mitarbeitenden: 0 CHF» direkt
  // unter dem Hinweis «Umsatz nicht öffentlich verfügbar.» — ein
  // erfundener Wert aus einer bereits als fehlend ausgewiesenen Zahl.
  it('rechnet keinen Umsatz je Mitarbeitenden für eine Platzhalterfirma mit revenueChf 0', () => {
    const content = companyContent(
      company({ placeholder: true, revenue: null, revenueChf: 0, employees: 134 }),
      ctx(),
    )
    expect(labels(content)).not.toContain('Umsatz je Mitarbeitenden')
    expect(content.notes).toContain('Umsatz nicht öffentlich verfügbar.')
  })

  it('rechnet keinen Umsatz je Mitarbeitenden bei 0 Mitarbeitenden', () => {
    const content = companyContent(company({ employees: 0 }), ctx())
    expect(labels(content)).not.toContain('Umsatz je Mitarbeitenden')
  })

  it('rechnet keinen Umsatz je Mitarbeitenden bei 0 Mitarbeitenden, selbst mit Umsatz in CHF', () => {
    // Sechs Beteiligungsgesellschaften ohne eigenes Personal melden 0 —
    // dieselbe Division-durch-0-Falle wie bei `aggregateCellContent` und der
    // Einwohnerzahl, hier absichtlich mit vorhandenem `revenueChf` geprüft,
    // damit der Test die Wächter-Bedingung tatsächlich auf die Probe stellt.
    const content = companyContent(
      company({ revenueChf: 500_000_000, employees: 0 }),
      ctx(),
    )
    expect(labels(content)).not.toContain('Umsatz je Mitarbeitenden')
  })

  it('zeigt Umsatz je Mitarbeitenden, wenn revenueChf und Mitarbeitende vorliegen', () => {
    const content = companyContent(
      company({ revenueChf: 500_000_000, employees: 1000 }),
      ctx(),
    )
    expect(field(content, 'Umsatz je Mitarbeitenden')).toBe("500'000 CHF")
  })

  it('rechnet keinen Umsatz je Mitarbeitenden ohne revenueChf', () => {
    const content = companyContent(company({ revenueChf: null, employees: 500 }), ctx())
    expect(labels(content)).not.toContain('Umsatz je Mitarbeitenden')
  })

  it('nennt den Anteil am Gesamtumsatz, wenn revenueChf vorliegt', () => {
    const content = companyContent(
      company({ revenueChf: 100_000_000 }),
      ctx({ revenueTotal: 1_000_000_000 }),
    )
    expect(field(content, 'Anteil am Gesamtumsatz')).toBe('10.00 %')
  })

  it('lässt den Anteil am Gesamtumsatz weg, wenn revenueChf fehlt', () => {
    const content = companyContent(company({ revenueChf: null }), ctx())
    expect(labels(content)).not.toContain('Anteil am Gesamtumsatz')
  })

  it('verlinkt das Kerngeschäft, wo eine Quelle vorliegt', () => {
    const content = companyContent(
      company({ productsUrl: 'https://example.test/produkte' }),
      ctx(),
    )
    expect(content.links?.map((l) => l.href)).toContain('https://example.test/produkte')
    const link = content.links?.find((l) => l.href === 'https://example.test/produkte')
    expect(link?.label).toBe('Kerngeschäft belegen')
  })

  it('verlinkt kein Kerngeschäft ohne productsUrl', () => {
    const content = companyContent(company({ productsUrl: null }), ctx())
    expect(content.links?.some((l) => l.label === 'Kerngeschäft belegen')).toBe(false)
  })

  it('zeigt das SIX-Symbol', () => {
    expect(field(companyContent(company({ sixSymbol: 'NESN' }), ctx()), 'SIX-Symbol')).toBe(
      'NESN',
    )
  })

  it('lässt das SIX-Symbol weg, wo keines gemeldet ist', () => {
    const content = companyContent(company({ sixSymbol: null }), ctx())
    expect(labels(content)).not.toContain('SIX-Symbol')
  })
})
