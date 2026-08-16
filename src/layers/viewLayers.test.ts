import type { FeatureCollection, Geometry } from 'geojson'
import { describe, expect, it } from 'vitest'
import type { BoundaryFeatureCollection } from '../data/boundaries'
import type { Level, LevelMeta } from '../data/loader'
import { buildCantonBorderLayer } from './cantons'
import type { CompanyData } from './visible'
import { buildViewLayers, KANTONE_BARS_LAYER_ID, type CantonEntry } from './viewLayers'

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

function firmenInput() {
  return {
    ...BASIS,
    view: 'sichtbare' as const,
    companies: COMPANIES,
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
