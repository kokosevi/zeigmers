import { describe, expect, it, vi } from 'vitest'
import { applySelection } from '../domain/selection'
import type { Metric } from '../domain/metric'
import { CANTON_ELEVATION_M } from './cantons'
import {
  buildCompanyLayer,
  buildCompanyShadowLayer,
  buildUnresearchedCompanyLayer,
  COMPANY_HOVER_COLOR,
  companyElevations,
  COMPANY_RADIUS_MAX_PX,
  COMPANY_RADIUS_MIN_PX,
  LOSS_COLOR,
  MIN_REAL_BAR_M,
  MIN_VISIBLE_BAR_M,
  parseCompanyData,
  StaleCompanyDataError,
  UNRESEARCHED_MARKER_COLOR,
  zeroPlaneHeight,
  type Company,
  type CompanyData,
} from './visible'

function company(overrides: Partial<Company> = {}): Company {
  return {
    uid: 'CHE-1', name: 'Test AG', sixSymbol: null, lon: 8, lat: 47.4,
    nogaGroupIndex: 1, orgForm: 'boersenkotiert',
    revenue: 1e9, revenueChf: null, currency: 'CHF', revenueType: 'net_sales',
    profit: null, profitChf: null, profitCurrency: null, consolidationBasis: null,
    coreProducts: null, productsUrl: null,
    foundingYear: null,
    employees: null, fiscalYear: 2024, reportUrl: null, note: null,
    placeholder: false, researched: true, city: 'Aarau', positionAdjusted: null,
    ...overrides,
  }
}

function companiesOf(revenues: (number | null)[]): Company[] {
  return revenues.map((revenue, i) => ({
    uid: `CHE-${i}`, name: `F${i}`, sixSymbol: null, lon: 8, lat: 47.4,
    nogaGroupIndex: 1, orgForm: 'boersenkotiert',
    revenue, revenueChf: revenue, currency: 'CHF',
    revenueType: revenue === null ? null : 'net_sales',
    profit: null, profitChf: null, profitCurrency: null, consolidationBasis: null,
    coreProducts: null, productsUrl: null,
    foundingYear: null,
    employees: null,
    fiscalYear: 2024, reportUrl: null, note: null,
    placeholder: revenue === null, researched: true, city: 'Aarau', positionAdjusted: null,
  }))
}

// Dieselbe Auswahl wie in `domain/selection.test.ts`: alle elf Branchen plus
// «unbestimmt» (255), nur die Rechtsform, die der Datensatz heute kennt —
// damit lässt applySelection keine Firma aus, die diese Suite selbst anlegt.
const selectionFor = (metric: Metric) => ({
  metric, branches: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 255]),
  orgForms: new Set(['boersenkotiert']),
})

describe('companyElevations', () => {
  it('gibt dem grössten Umsatz die volle Höhe', () => {
    const c = companiesOf([1e9, 1e10])
    const h = companyElevations(c, 'umsatz', 1e10, 5000, 'logarithmisch')
    expect(h[1]).toBeCloseTo(5000, 3)
  })

  it('gibt einer Firma ohne Wert die Platzhalterhöhe MIN_VISIBLE_BAR_M', () => {
    const c = companiesOf([1e9, 1e10, null])
    const h = companyElevations(c, 'umsatz', 1e10, 5000, 'logarithmisch')
    expect(h[2]).toBe(MIN_VISIBLE_BAR_M)
  })

  it('gibt einem Platzhalter nie die Höhe null', () => {
    const c = companiesOf([null])
    const h = companyElevations(c, 'umsatz', 0, 5000, 'logarithmisch')
    expect(h[0]!).toBeGreaterThan(0)
  })

  it('hält Platzhalter unter jeder echten Säule', () => {
    const c = companiesOf([1e6, 1e12, null])
    const h = companyElevations(c, 'umsatz', 1e12, 5000, 'logarithmisch')
    expect(h[2]!).toBeLessThan(Math.min(h[0]!, h[1]!))
  })

  it('kommt mit einem Datensatz ohne jeden Umsatz zurecht', () => {
    const c = companiesOf([null, null])
    const h = companyElevations(c, 'umsatz', 0, 5000, 'logarithmisch')
    expect(h[0]!).toBeGreaterThan(0)
    expect(Number.isFinite(h[0]!)).toBe(true)
  })

  it('zeichnet die Höhe aus dem umgerechneten, nicht dem berichteten Betrag', () => {
    // Zwei Firmen mit gleichem berichtetem Betrag, aber verschiedener
    // Währung, dürfen NICHT gleich hoch werden — dieselbe Zusicherung wie in
    // `domain/metric.test.ts`, hier über die volle Höhenberechnung geprüft.
    const chf = company({ revenue: 1e9, revenueChf: 1e9 })
    const usd = company({ revenue: 1e9, revenueChf: 8.3e8 })
    const heights = companyElevations([chf, usd], 'umsatz', 1e9, 12000, 'linear')
    expect(heights[0]).toBeGreaterThan(heights[1]!)
  })
})

describe('buildCompanyLayer researched filter', () => {
  it('only includes researched companies as bars', () => {
    const companies = [
      company({ uid: 'A', researched: true }),
      company({ uid: 'B', researched: false, revenue: null, revenueType: null }),
    ]
    const layer = buildCompanyLayer({
      result: applySelection(companies, selectionFor('umsatz')),
      metric: 'umsatz', mode: 'logarithmisch', onClick: () => {}, onHover: () => {},
    })
    expect((layer.props.data as Company[]).map((c) => c.uid)).toEqual(['A'])
  })
})

describe('sichtbarer Hover (Auftrag 2026-08-17)', () => {
  // Die Textmarke neben dem Zeiger allein liess offen, welche der 201 Säulen
  // gemeint ist — bei 3 bis 14 Bildpunkten Breite steht die Nachbarin dicht
  // daneben. Die Einfärbung der getroffenen Säule beantwortet das auf der
  // Karte selbst. Geprüft wird hier, dass die Zusage am Layer hängt; dass
  // deck.gl daraus wirklich eine dunkle Säule macht, wurde im Browser
  // nachgemessen (nur die hervorgehobene Säule ändert Pixel).
  const layerFor = () =>
    buildCompanyLayer({
      result: applySelection([company({ uid: 'A', researched: true })], selectionFor('umsatz')),
      metric: 'umsatz', mode: 'logarithmisch', onClick: () => {}, onHover: () => {},
    })

  it('hebt die Säule unter dem Zeiger hervor', () => {
    expect(layerFor().props.autoHighlight).toBe(true)
    expect(layerFor().props.highlightColor).toEqual(COMPANY_HOVER_COLOR)
  })

  it('nimmt dafür Tinte, nicht eine Aufhellung', () => {
    // Auf der hellen Kantonsplatte (`--karte-platte`) würde eine Aufhellung
    // die Säule verschwinden lassen statt sie zu zeigen — der umgekehrte Fall
    // zu den grossen Kantonsflächen, die mit Weiss auf 70 arbeiten
    // (`layers/many.ts`, `HOVER_HIGHLIGHT_COLOR`).
    const [r, g, b, a] = COMPANY_HOVER_COLOR
    expect(Math.max(r, g, b)).toBeLessThan(60)
    expect(a).toBeGreaterThan(200)
  })

  it('gilt auch für die Marker der unrecherchierten Titel', () => {
    const d: CompanyData = {
      companies: [company({ uid: 'B', researched: false, revenue: null, revenueType: null })],
      stats: { count: 1, withRevenue: 0, max: 0, revenueInChf: false, profitInChf: false, orgForms: ['boersenkotiert'], researched: 0, totalListed: 1, sixRetrievedDate: null },
    }
    const layer = buildUnresearchedCompanyLayer(d, () => {}, () => {})
    expect(layer.props.autoHighlight).toBe(true)
    expect(layer.props.highlightColor).toEqual(COMPANY_HOVER_COLOR)
  })
})

describe('buildUnresearchedCompanyLayer', () => {
  it('only includes unresearched companies as markers, with the documented neutral color', () => {
    const d: CompanyData = {
      companies: [
        company({ uid: 'A', researched: true }),
        company({ uid: 'B', researched: false, revenue: null, revenueType: null }),
      ],
      stats: { count: 2, withRevenue: 1, max: 1e9, revenueInChf: false, profitInChf: false, orgForms: ['boersenkotiert'], researched: 1, totalListed: 2, sixRetrievedDate: null },
    }
    const layer = buildUnresearchedCompanyLayer(d, () => {}, () => {})
    expect((layer.props.data as Company[]).map((c) => c.uid)).toEqual(['B'])
    expect(layer.props.getFillColor).toEqual(UNRESEARCHED_MARKER_COLOR)
  })

  it('reports hover by name, not just index', () => {
    const d: CompanyData = {
      companies: [company({ uid: 'B', researched: false, revenue: null, revenueType: null })],
      stats: { count: 1, withRevenue: 0, max: 0, revenueInChf: false, profitInChf: false, orgForms: ['boersenkotiert'], researched: 0, totalListed: 1, sixRetrievedDate: null },
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
    const layer = buildCompanyLayer({
      result: applySelection([company({ revenueType })], selectionFor('umsatz')),
      metric: 'umsatz', mode: 'logarithmisch', onClick: () => {}, onHover: () => {},
    })
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

describe('Marker der unrecherchierten Firmen', () => {
  const data: CompanyData = {
    companies: [company({ researched: false })],
    stats: {
      count: 1, withRevenue: 0, max: 0, revenueInChf: false, profitInChf: false, orgForms: ['boersenkotiert'],
      researched: 0, totalListed: 1, sixRetrievedDate: null,
    },
  }

  it('hat eine Mindestgrösse in Pixeln', () => {
    // Ohne sie sind die Marker in Metern angegeben und schrumpfen beim
    // Herauszoomen mit: auf der Schweiz-Ansicht wurden aus 350 m Radius
    // rund zwei Bildpunkte, und der Nutzer sah nur noch die acht Aargauer
    // Säulen. Die Marker waren da — sichtbar waren sie nicht.
    const layer = buildUnresearchedCompanyLayer(data, () => {}, () => {})
    expect(layer.props.radiusMinPixels).toBeGreaterThanOrEqual(3)
  })

  it('begrenzt die Grösse nach oben, damit sie beim Hineinzoomen nicht zu Flecken werden', () => {
    const layer = buildUnresearchedCompanyLayer(data, () => {}, () => {})
    expect(layer.props.radiusMaxPixels).toBeGreaterThan(layer.props.radiusMinPixels)
    expect(layer.props.radiusMaxPixels).toBeLessThanOrEqual(12)
  })
})

describe('Höhenlage der Marker über der Kantonsplatte', () => {
  const data: CompanyData = {
    companies: [company({ researched: false, lon: 8, lat: 47.4 })],
    stats: {
      count: 1, withRevenue: 0, max: 0, revenueInChf: false, profitInChf: false, orgForms: ['boersenkotiert'],
      researched: 0, totalListed: 1, sixRetrievedDate: null,
    },
  }

  it('setzt die Marker auf die Oberseite der Platte, nicht auf Höhe null', () => {
    // Die Kantonsplatte ist auf CANTON_ELEVATION_M extrudiert. Ein flacher
    // Marker auf Höhe 0 liegt damit UNTER ihr und ist unsichtbar — die
    // Säulen ragen hindurch, die Punkte nicht. Genau so sah die Karte aus,
    // als wären nur die acht Aargauer Firmen vorhanden.
    const layer = buildUnresearchedCompanyLayer(data, () => {}, () => {})
    const getPosition = layer.props.getPosition as unknown as (c: Company) => number[]
    const position = getPosition(data.companies[0]!)
    expect(position[2]).toBe(CANTON_ELEVATION_M)
  })
})

describe('Bodenschatten der Firmensäule', () => {
  it('legt den Bodenschatten auf Plattenhöhe, nicht auf z = 0', () => {
    const c = company()
    const layer = buildCompanyShadowLayer(applySelection([c], selectionFor('umsatz')))
    const [, , z] = (layer.props.getPosition as Function)(c)
    expect(z).toBe(CANTON_ELEVATION_M)
  })

  it('ist nicht anklickbar — die Säule darüber nimmt den Klick', () => {
    const c = company()
    const layer = buildCompanyShadowLayer(applySelection([c], selectionFor('umsatz')))
    expect(layer.props.pickable).toBe(false)
  })

  it('begrenzt den Schatten zoomunabhängig in Bildpunkten', () => {
    // `ScatterplotLayer` (anders als die `ColumnLayer`-Säule darüber, siehe
    // Kommentar bei `buildCompanyLayer`) kennt `radiusMinPixels`/
    // `radiusMaxPixels` tatsächlich — hier trägt die Pixelgrenze also
    // spürbar zur Behebung des Zürich/Jura-Problems bei.
    const layer = buildCompanyShadowLayer(applySelection([company()], selectionFor('umsatz')))
    expect(layer.props.radiusMinPixels).toBe(COMPANY_RADIUS_MIN_PX + 2)
    expect(layer.props.radiusMaxPixels).toBe(COMPANY_RADIUS_MAX_PX + 4)
  })
})

describe('Sichtbarkeitsschwelle der Säulen', () => {
  it('hebt Säulen, die sonst in der Kantonsplatte verschwänden', () => {
    // Mit 187 echten Umsätzen spannt die Karte einen Faktor von 325'000
    // (Nestlé 89.5 Mrd. gegen Xlife Sciences 0.28 Mio.). Am unteren Ende
    // ergibt die Skala Höhen von 75 und 105 m — unter der 300 m hohen
    // Kantonsplatte. Diese Firmen wären auf der Karte nicht vorhanden,
    // obwohl sie recherchiert sind und einen belegten Umsatz tragen.
    const winzig = company({ revenue: 2.8e5, revenueChf: 2.8e5 })
    const gross = company({ revenue: 8.9e10, revenueChf: 8.9e10 })
    const heights = companyElevations([gross, winzig], 'umsatz', 8.9e10, 12000, 'logarithmisch')

    expect(heights[1]).toBeGreaterThan(CANTON_ELEVATION_M)
    expect(heights[1]).toBe(MIN_REAL_BAR_M)
    expect(heights[0]).toBe(12000)
  })

  it('lässt Säulen oberhalb der Schwelle unverändert', () => {
    const mittel = company({ revenue: 1e9, revenueChf: 1e9 })
    const heights = companyElevations([mittel], 'umsatz', 8.9e10, 12000, 'logarithmisch')
    expect(heights[0]).toBeGreaterThan(MIN_REAL_BAR_M)
  })
})

// Aufgabe 18, Browser-Fund: die erste Wahl (eine bei Verlusten angehobene
// Nulllinie, von der eine Verlustsäule nach unten hängt) liess sich im
// Screenshot nicht nachweisen — keine der 41 Verlustsäulen (Kennzahl Gewinn)
// zeigte ein einziges Pixel in `LOSS_COLOR`, weil die angehobene Nulllinie
// bei einem grossen Ausreisser (Nationalbank) selbst nahe der Höhendecke
// landete und jede davon hängende Säule zwischen den hohen Gewinnsäulen
// verschwand. `zeroPlaneHeight` liefert seither immer die Plattenoberkante,
// unabhängig von den Höhen — siehe `layers/visible.ts` für die vollständige
// Begründung und die zweite, jetzt aktive Wahl (Betrag als Höhe,
// Verlustfarbe als Vorzeichen).
describe('Nulllinie', () => {
  it('ist immer die Plattenoberkante, unabhängig von der Kennzahl', () => {
    expect(zeroPlaneHeight()).toBe(CANTON_ELEVATION_M)
  })
})

describe('buildCompanyLayer mit Kennzahl', () => {
  it('zeichnet einen Verlust mit derselben (positiven) Höhe wie einen gleich grossen Gewinn', () => {
    const gewinner = company({ name: 'Plus', profitChf: 1000 })
    const verlierer = company({ name: 'Minus', profitChf: -1000 })
    const layer = buildCompanyLayer({
      result: applySelection([gewinner, verlierer], selectionFor('gewinn')),
      metric: 'gewinn', mode: 'linear', onClick: () => {}, onHover: () => {},
    })
    const elevation = (c: Company, i: number) =>
      (layer.props.getElevation as Function)(c, { index: i })
    expect(elevation(gewinner, 0)).toBeGreaterThan(0)
    // Betrag entscheidet, nicht Vorzeichen (siehe Kommentar oben) — bei
    // gleichem Betrag (hier je 1000) steht ein Verlust exakt so hoch wie der
    // Gewinn, nicht darunter oder gar negativ.
    expect(elevation(verlierer, 1)).toBe(elevation(gewinner, 0))
  })

  it('färbt Verluste in einem eigenen Ton, nicht in der Branchenfarbe', () => {
    const verlierer = company({ name: 'Minus', profitChf: -1000, nogaGroupIndex: 1 })
    const layer = buildCompanyLayer({
      result: applySelection([verlierer], selectionFor('gewinn')),
      metric: 'gewinn', mode: 'linear', onClick: () => {}, onHover: () => {},
    })
    const color = (layer.props.getFillColor as Function)(verlierer)
    expect(color.slice(0, 3)).toEqual([...LOSS_COLOR])
  })

  it('gibt einer Firma ohne Wert die Platzhalterhöhe, nicht null', () => {
    const ohne = company({ name: 'Ohne', employees: null })
    const layer = buildCompanyLayer({
      result: applySelection([ohne], selectionFor('mitarbeitende')),
      metric: 'mitarbeitende', mode: 'linear', onClick: () => {}, onHover: () => {},
    })
    const h = (layer.props.getElevation as Function)(ohne, { index: 0 })
    expect(h).toBe(MIN_VISIBLE_BAR_M)
  })

  it('steht in der Gewinn-Ansicht auf derselben Plattenoberkante wie jede andere Kennzahl', () => {
    const verlierer = company({ profitChf: -1000 })
    const layer = buildCompanyLayer({
      result: applySelection([verlierer], selectionFor('gewinn')),
      metric: 'gewinn', mode: 'linear', onClick: () => {}, onHover: () => {},
    })
    const [, , z] = (layer.props.getPosition as Function)(verlierer)
    expect(z).toBe(CANTON_ELEVATION_M)
  })
})

describe('parseCompanyData', () => {
  const currentStats: CompanyData['stats'] = {
    count: 1, withRevenue: 1, max: 1e9, revenueInChf: true, profitInChf: true,
    orgForms: ['boersenkotiert'], researched: 1, totalListed: 1, sixRetrievedDate: null,
  }

  it('lässt ein Artefakt mit allen vier Feldern des Organisationsform-/Reingewinn-Umbaus unverändert durch', () => {
    const data = { companies: [company()], stats: currentStats }
    expect(parseCompanyData(data)).toBe(data)
  })

  // Der Fehler, live beobachtet (siehe `netlify.toml`-Kommentar bei
  // `/data/*`): `netlify.toml` lieferte das HTML sofort im neuen Deploy-
  // Stand aus, `/data/*` dagegen bis zu eine Stunde lang aus dem Cache. Ein
  // wiederkehrender Besuch bekam so den NEUEN Code gegen ein ALTES
  // `companies.json` — dessen Schema kennt `stats.orgForms` noch nicht,
  // `ui/nav.ts`s `createNav` rief darauf `available.map(...)` auf, und die
  // Seite zeigte «Daten konnten nicht geladen werden: TypeError: Cannot
  // read properties of undefined (reading 'map')», obwohl die Daten sehr
  // wohl geladen waren. Dieses Fixture bildet genau das Schema von VOR dem
  // Umbau nach (kein `orgForm`/`profitChf` je Zeile, kein
  // `stats.orgForms`/`stats.profitInChf`) und schickt es durch denselben
  // Ladepfad wie ein echter Fetch (`loadCompanies`) — der Absturz gehört
  // hier bewacht, nicht erst dort, wo er zufällig zuerst auffällt.
  it('wirft StaleCompanyDataError statt eines TypeError, wenn ein Artefakt aus der Zeit vor dem Umbau kommt', () => {
    const staleCompany = {
      uid: 'CHE-1', name: 'Test AG', sixSymbol: null, lon: 8, lat: 47.4,
      nogaGroupIndex: 1,
      revenue: 1e9, revenueChf: null, currency: 'CHF', revenueType: 'net_sales',
      profit: null, profitCurrency: null, consolidationBasis: null,
      coreProducts: null, productsUrl: null, foundingYear: null,
      employees: null, fiscalYear: 2024, reportUrl: null, note: null,
      placeholder: false, researched: true, city: 'Aarau', positionAdjusted: null,
      // `orgForm`/`profitChf` fehlen absichtlich — Schema von vor dem Umbau.
    }
    const staleStats = {
      count: 1, withRevenue: 1, max: 1e9, revenueInChf: true,
      researched: 1, totalListed: 1, sixRetrievedDate: null,
      // `orgForms`/`profitInChf` fehlen absichtlich — Schema von vor dem Umbau.
    }
    const stale = { companies: [staleCompany], stats: staleStats }

    // `console.error` trägt die Diagnose (siehe `parseCompanyData`) — in
    // diesem Test bewusst stummgeschaltet, sonst würde jeder Testlauf die
    // erwartete Konsolenausgabe als Rauschen mitloggen.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => parseCompanyData(stale)).toThrow(StaleCompanyDataError)

    let error: StaleCompanyDataError | undefined
    try {
      parseCompanyData(stale)
    } catch (caught) {
      error = caught as StaleCompanyDataError
    }

    // Die sichtbare Meldung richtet sich an die Besucherin: knapp, ohne
    // Feldnamen oder Dateiverweis (Re-Review 2026-08-17 — die erste Fassung
    // hatte genau das in der Fehlerbox stehen, unbrauchbar für alle ohne
    // Zugriff auf den Code).
    expect(error?.message).toBe(
      'Die geladenen Daten sind älter als diese Version der Anwendung — ein Neuladen der Seite behebt das.',
    )
    expect(error?.message).not.toContain('orgForm')
    expect(error?.message).not.toContain('netlify.toml')

    // Alle vier Felder desselben Umbaus bleiben auffindbar — nicht nur
    // `stats.orgForms`, das im Produktionsvorfall zufällig zuerst geknallt
    // hat —, nur eben als Diagnose statt als sichtbarer Text: einmal
    // programmatisch an der Fehlerinstanz (`missingFields`, unten geprüft)
    // und einmal in der Entwicklerkonsole (`console.error`, hier geprüft).
    expect(error?.missingFields).toEqual([
      'stats.orgForms', 'stats.profitInChf', 'companies[].orgForm', 'companies[].profitChf',
    ])
    expect(consoleError).toHaveBeenCalledTimes(2) // je ein Aufruf pro obigem parseCompanyData()
    const logged = String(consoleError.mock.calls[0]?.[0])
    expect(logged).toContain('stats.orgForms')
    expect(logged).toContain('stats.profitInChf')
    expect(logged).toContain('companies[].orgForm')
    expect(logged).toContain('companies[].profitChf')
    expect(logged).toContain('netlify.toml')

    consoleError.mockRestore()
  })

  it('nennt in missingFields nur das tatsächlich fehlende Feld, wenn ausschliesslich stats.profitInChf fehlt', () => {
    const { profitInChf: _profitInChf, ...statsOhneProfitInChf } = currentStats
    const data = { companies: [company()], stats: statsOhneProfitInChf }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    let error: StaleCompanyDataError | undefined
    try {
      parseCompanyData(data)
    } catch (caught) {
      error = caught as StaleCompanyDataError
    }
    expect(error?.missingFields).toEqual(['stats.profitInChf'])

    consoleError.mockRestore()
  })
})
