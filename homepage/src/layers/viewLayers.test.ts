import type { FeatureCollection, Geometry } from 'geojson'
import { describe, expect, it } from 'vitest'
import type { BoundaryFeatureCollection } from '../data/boundaries'
import type { Level, LevelMeta } from '../data/loader'
import { applySelection } from '../domain/selection'
import { buildCantonBorderLayer } from './cantons'
import type { Company, CompanyData } from './visible'
import {
  buildViewLayers,
  companyHoverLines,
  KANTONE_BARS_LAYER_ID,
  type CantonEntry,
} from './viewLayers'

// Regressionstest für genau den Bug, den ein Nutzer im Browser fand: die
// Schweiz-Stufe von Ansicht «Beschäftigte» und die Kantonsflächen-Basiskarte
// (`layers/cantons.ts`) trugen beide die deck.gl-id `'kantone'`. deck.gl
// verlangt eindeutige ids je Layer-Array — bei einer Kollision gewinnt beim
// Prop-Dispatch nur eine Instanz (hier die nicht pickbare Basiskarte), die
// andere verschwindet effektiv, ohne Fehler, ohne Konsolen-Warnung, die ein
// Test bemerken würde. `autoHighlight` (Hover) blieb funktionsfähig, weil das
// ein Render-Effekt der tatsächlich gezeichneten Instanz ist — nur `onClick`
// lief ins Leere. Diese Suite prüft direkt, was ein Test hier prüfen kann und
// die App selbst nicht: dass `buildViewLayers()` für jede Kombination aus
// Ansicht und Stufe eine id-eindeutige Liste liefert, an der deck.gl nicht
// kollabieren kann.

const SWITZERLAND_POLYGON: Geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [6.0, 46.0],
      [10.0, 46.0],
      [10.0, 47.8],
      [6.0, 46.0],
    ],
  ],
}

const CANTONS_GEO: BoundaryFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { bfs_nr: 1, name: 'Zürich' }, geometry: SWITZERLAND_POLYGON },
    { type: 'Feature', properties: { bfs_nr: 19, name: 'Aargau' }, geometry: SWITZERLAND_POLYGON },
  ],
}

function kantoneLevel(): Level {
  const meta: LevelMeta = {
    level: 'kantone',
    year: 2023,
    canton: 'CH',
    count: 2,
    arrays: {},
    nogaGroups: [],
    unknownColor: '#BFBFBF',
    unknownIndex: 255,
    stats: { min: 0, max: 1000, sum: 1500, p99: 1000, ambiguousCells: 0, overstatementMax: 0 },
    kantone: [
      { bfsNr: 1, code: 'ZH', name: 'Zürich', ambiguousCells: 0 },
      { bfsNr: 19, code: 'AG', name: 'Aargau', ambiguousCells: 0 },
    ],
  }
  return {
    meta,
    arrays: {
      positions: new Float32Array(4),
      values: new Float32Array([1000, 500]),
      noga: new Uint8Array([0, 1]),
      flags: new Uint8Array([0, 0]),
      gemeindeIdx: new Uint16Array([0, 1]),
    },
  }
}

function gemeindeLevel(): Level {
  const meta: LevelMeta = {
    level: 'gemeinde',
    year: 2023,
    canton: 'AG',
    count: 1,
    arrays: {},
    nogaGroups: [],
    unknownColor: '#BFBFBF',
    unknownIndex: 255,
    stats: { min: 0, max: 100, sum: 100, p99: 100, ambiguousCells: 0, overstatementMax: 0 },
    gemeinden: [{ bfsNr: 4001, name: 'Aarau', ambiguousCells: 0 }],
  }
  return {
    meta,
    arrays: {
      positions: new Float32Array(2),
      values: new Float32Array([100]),
      noga: new Uint8Array([0]),
      flags: new Uint8Array([0]),
      gemeindeIdx: new Uint16Array([0]),
    },
  }
}

function cantonEntry(): CantonEntry {
  const gemeinde = gemeindeLevel()
  return {
    code: 'AG',
    name: 'Aargau',
    bfsNr: 19,
    gemeinde,
    geometries: [SWITZERLAND_POLYGON],
    vmax: 100,
    presentGroups: { indices: [0], hasUnknown: false },
    borderLayer: undefined as unknown as CantonEntry['borderLayer'],
  }
}

const COMPANIES: CompanyData = {
  companies: [],
  stats: {
    count: 0, withRevenue: 0, max: 0, revenueInChf: false,
    profitInChf: false, orgForms: ['boersenkotiert'],
    researched: 0, totalListed: 0, sixRetrievedDate: null,
  },
}

const CANTON_BORDER_LAYER = buildCantonBorderLayer({ data: CANTONS_GEO })

// Fixture für den Seenlayer — Geometrie ist hier egal (kein Test prüft die
// tatsächliche Fläche), nur dass `buildViewLayers` sie in eine `'seen'`-Layer
// mit der richtigen Einreihung übersetzt.
const LAKES_GEO: FeatureCollection = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { name: 'Thunersee' }, geometry: SWITZERLAND_POLYGON }],
}

const BASIS = {
  mode: 'logarithmisch' as const,
  cantonsGeo: CANTONS_GEO,
  activeBfsNr: null,
  cantonBorderLayer: CANTON_BORDER_LAYER,
  lakes: null as FeatureCollection | null,
}

function beschaeftigteInput(
  overrides: { level?: 'schweiz' | 'kanton'; activeCanton?: CantonEntry | null } = {},
) {
  return {
    ...BASIS,
    view: 'beschaeftigte' as const,
    level: 'schweiz' as const,
    kantone: kantoneLevel(),
    cantonGeometries: [SWITZERLAND_POLYGON, SWITZERLAND_POLYGON],
    kantoneVmax: 1000,
    activeCanton: null as CantonEntry | null,
    onEnterCanton: () => {},
    onShowMunicipalityPanel: () => {},
    ...overrides,
  }
}

// Task 18: `buildViewLayers` filtert nicht mehr selbst (siehe Kommentar bei
// `ViewLayersInput`, `result`) — diese Fixtur reicht deshalb ein fertiges
// `SelectionResult` durch, wie es sonst `karte/firmen.ts`s `render()` aus
// `applySelection` baut. `COMPANIES.companies` ist in dieser Suite leer, die
// konkreten Mengen der Auswahl (`branches`/`orgForms`) sind deshalb ohne
// Wirkung auf das Ergebnis.
function firmenInput() {
  const selection = { metric: 'umsatz' as const, branches: new Set<number>(), orgForms: new Set<string>() }
  return {
    ...BASIS,
    view: 'sichtbare' as const,
    companies: COMPANIES,
    result: applySelection(COMPANIES.companies, selection),
    metric: selection.metric,
    onShowCompanyPanel: () => {},
  }
}

// Bewusst `readonly unknown[]` statt `ReturnType<typeof buildViewLayers>`
// (`LayersList`): dessen rekursiver Typ (`(Layer | ... | LayersList)[]`)
// bringt `Array#flat()`s Typinferenz bei `depth: Infinity` zum Überlaufen
// (TS2589). `buildViewLayers` liefert ohnehin nie verschachtelte Arrays,
// `.flat()` ist hier nur eine Vorsichtsmassnahme gegen den allgemeineren Typ.
function idsOf(layers: readonly unknown[]): string[] {
  return layers
    .flat(Infinity)
    .filter(
      (layer): layer is { id: string } =>
        typeof layer === 'object' && layer !== null && 'id' in layer,
    )
    .map((layer) => layer.id)
}

describe('buildViewLayers', () => {
  // Review-Fund (2026-08-16): lief vorher mit `lakes: null` (aus `BASIS`) —
  // der neue `'seen'`-Layer kam in dieser Prüfung nie vor, eine künftige
  // id-Kollision mit ihm wäre hier unbemerkt geblieben, obwohl genau dieser
  // Test (siehe Kommentar oben) dafür da ist. Jetzt mit geladenen Seen in
  // allen drei Kombinationen, plus der expliziten Prüfung, dass `'seen'`
  // tatsächlich in der Liste steht — sonst wäre „eindeutig" auch bei einem
  // versehentlich wieder verschwundenen Seenlayer trivial erfüllt.
  it.each([
    ['Beschäftigte · Schweiz', { ...beschaeftigteInput(), lakes: LAKES_GEO }],
    [
      'Beschäftigte · Kanton',
      { ...beschaeftigteInput({ level: 'kanton', activeCanton: cantonEntry() }), lakes: LAKES_GEO },
    ],
    ['Börsennotierte Firmen', { ...firmenInput(), lakes: LAKES_GEO }],
  ] as const)('assigns unique deck.gl layer ids — %s', (_label, input) => {
    const ids = idsOf(buildViewLayers(input))
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('seen')
  })

  it('falls back to the Switzerland level when level is "kanton" but no canton is loaded', () => {
    const ids = idsOf(buildViewLayers(beschaeftigteInput({ level: 'kanton', activeCanton: null })))
    expect(new Set(ids).size).toBe(ids.length)
  })

  // Neu: die Union ist der Grund für diesen Umbau — sie muss die
  // Beschäftigten-Variante ohne `companies` tatsächlich akzeptieren, sonst
  // könnte die Beschäftigten-Seite die 320 KB nicht einsparen.
  it('builds the Beschäftigte view without any company data', () => {
    const input = beschaeftigteInput()
    expect('companies' in input).toBe(false)
    expect(idsOf(buildViewLayers(input)).length).toBeGreaterThan(0)
  })

  it('reiht die Seen in Ansicht Firmen zwischen Kantonsfläche und Säulen ein', () => {
    const ids = idsOf(buildViewLayers({ ...firmenInput(), lakes: LAKES_GEO }))
    expect(ids.indexOf('seen')).toBeGreaterThan(ids.indexOf('kantone'))
    expect(ids.indexOf('seen')).toBeLessThan(ids.indexOf('firmen'))
  })

  // Review-Fund (2026-08-16): die Einreihung war nur für Ansicht «Firmen»
  // bewiesen, obwohl derselbe Seenlayer in allen drei Zweigen von
  // `buildViewLayers` eingereiht wird (Schweiz- UND Kantonsstufe von
  // «Beschäftigte») — laut Code-Inspektion korrekt, aber unbewiesen.
  it('reiht die Seen in Ansicht Beschäftigte · Schweiz zwischen Kantonsfläche und Kantonsbalken ein', () => {
    const ids = idsOf(buildViewLayers({ ...beschaeftigteInput(), lakes: LAKES_GEO }))
    expect(ids.indexOf('seen')).toBeGreaterThan(ids.indexOf('kantone'))
    expect(ids.indexOf('seen')).toBeLessThan(ids.indexOf(KANTONE_BARS_LAYER_ID))
  })

  it('reiht die Seen in Ansicht Beschäftigte · Kanton zwischen Kantonsfläche und Gemeindebalken ein', () => {
    const ids = idsOf(
      buildViewLayers({
        ...beschaeftigteInput({ level: 'kanton', activeCanton: cantonEntry() }),
        lakes: LAKES_GEO,
      }),
    )
    expect(ids.indexOf('seen')).toBeGreaterThan(ids.indexOf('kantone'))
    expect(ids.indexOf('seen')).toBeLessThan(ids.indexOf('gemeinde'))
  })

  it('zeichnet ohne Seen weiter, wenn das Artefakt fehlt', () => {
    // Die Seen sind Orientierung, kein Inhalt — ihr Fehlen ist kein Fehler.
    const ids = idsOf(buildViewLayers({ ...firmenInput(), lakes: null }))
    expect(ids).not.toContain('seen')
  })
})

// Dieselbe minimale Firmen-Fabrik wie `ui/legend.test.ts` — auch hier
// entstehen die geprüften Werte aus einer echten `Company`, statt Text von
// Hand in die Testfixtur zu schreiben.
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

// Regressionsschutz für den Re-Review-Fund: `onHoverResearchedCompany` in
// `buildViewLayers` delegiert die eigentliche fachliche Entscheidung (welche
// Kennzahl, welcher Fallback-Text) an `companyHoverLines` — hier direkt
// geprüft, ohne DOM oder deck.gl-Layer. Ein Rückfall auf ein fest verdrahtetes
// `'umsatz'` statt der aktiven Kennzahl fiele hier auf, weil die erste
// Zusicherung dann `formatMetric(revenueChf, 'umsatz')` statt der
// Mitarbeitendenzahl erwartete.
describe('Kanton-zu-Kanton-Klick (Auftrag 2026-08-17)', () => {
  // Innerhalb eines Kantons soll ein Klick auf einen ANDEREN Kanton direkt
  // dorthin wechseln — ohne Umweg über «Schweiz». Die Platte meldet `bfs_nr`
  // (`layers/cantons.ts`), der Kantonszweig übersetzt sie in den Zeilenindex,
  // den `onEnterCanton` auch von der Schweiz-Stufe her bekommt: eine
  // Übersetzung, kein zweiter Navigationspfad.
  type Platte = { props: { pickable?: boolean; onClick?: (info: unknown) => void } }
  function platte(input: Parameters<typeof buildViewLayers>[0]): Platte {
    const layer = (buildViewLayers(input) as { id: string }[]).find((l) => l?.id === 'kantone')
    return layer as unknown as Platte
  }
  const klick = (bfsNr: number) => ({ object: { properties: { bfs_nr: bfsNr } } })

  it('macht die Platte nur auf der Kantonsstufe anklickbar', () => {
    expect(platte(beschaeftigteInput()).props.pickable).toBe(false)
    expect(
      platte(beschaeftigteInput({ level: 'kanton', activeCanton: cantonEntry() })).props.pickable,
    ).toBe(true)
  })

  it('meldet den Klick auf einen anderen Kanton als Zeilenindex der Kantonsstufe', () => {
    const gewaehlt: number[] = []
    const layer = platte({
      ...beschaeftigteInput({ level: 'kanton', activeCanton: cantonEntry() }),
      onEnterCanton: (index) => gewaehlt.push(index),
    })
    layer.props.onClick!(klick(1)) // Zürich, bfs_nr 1 → Zeile 0
    expect(gewaehlt).toEqual([0])
  })

  it('ignoriert den Klick auf den aktiven Kanton', () => {
    // Seine Fläche ist von den Gemeinden überdeckt; trifft der Klick doch die
    // Platte (Seefläche, Randpixel), wäre «denselben Kanton erneut betreten»
    // keine Navigation, nur ein Neuaufbau.
    const gewaehlt: number[] = []
    const layer = platte({
      ...beschaeftigteInput({ level: 'kanton', activeCanton: cantonEntry() }),
      onEnterCanton: (index) => gewaehlt.push(index),
    })
    layer.props.onClick!(klick(19)) // Aargau ist der aktive Kanton
    expect(gewaehlt).toEqual([])
  })
})

describe('companyHoverLines', () => {
  it('zeigt den Wert der aktiven Kennzahl, nicht fest den Umsatz', () => {
    const c = company({ name: 'Beispiel AG', employees: 42, revenueChf: 999_000_000 })
    const [, zweiteZeile] = companyHoverLines(c, 'mitarbeitende')
    expect(zweiteZeile).toContain('42')
    expect(zweiteZeile).not.toContain('999')
  })

  it('nennt die Branche neben dem Wert', () => {
    // nogaGroupIndex 1 = "Industrie und Energie", siehe `NOGA_GROUPS`.
    const c = company({ nogaGroupIndex: 1, revenueChf: 89_500_000_000 })
    const [, zweiteZeile] = companyHoverLines(c, 'umsatz')
    expect(zweiteZeile).toContain('Industrie und Energie')
  })

  it('sagt es ehrlich, wenn die Firma in der aktiven Kennzahl keinen Wert hat', () => {
    // `placeholder: true` lässt `metricValue` bei Umsatz `null` liefern
    // (siehe `domain/metric.ts`) — dieselbe Firma bekommt die Platzhaltersäule.
    const c = company({ placeholder: true, revenueChf: null })
    const [, zweiteZeile] = companyHoverLines(c, 'umsatz')
    expect(zweiteZeile).toContain('Keine Zahl für diese Kennzahl')
    expect(zweiteZeile).not.toContain('undefined')
    expect(zweiteZeile).not.toContain('null')
  })
})
