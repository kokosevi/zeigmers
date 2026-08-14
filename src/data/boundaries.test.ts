import { describe, expect, it } from 'vitest'
import type { Level, LevelMeta } from './loader'
import {
  joinCantonGeometry,
  joinMunicipalityGeometry,
  type BoundaryFeatureCollection,
} from './boundaries'

// `joinMunicipalityGeometry` ist reine In-Memory-Logik (kein `fetch`), deshalb
// ohne Netzwerk oder DOM testbar — genau die Art Join, deren stille Lücke
// (eine Gemeinde ohne Fläche, aber weiterhin in der Summe) dieses Projekt an
// anderer Stelle ausdrücklich vermeidet (README, „Fehlerbehandlung“).

const AARAU_POLYGON = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [8.0, 47.4],
      [8.1, 47.4],
      [8.1, 47.5],
      [8.0, 47.4],
    ],
  ],
}

const BADEN_POLYGON = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [8.2, 47.6],
      [8.3, 47.6],
      [8.3, 47.7],
      [8.2, 47.6],
    ],
  ],
}

function boundaries(features: BoundaryFeatureCollection['features']): BoundaryFeatureCollection {
  return { type: 'FeatureCollection', features }
}

function level(gemeindeIdx: number[], gemeinden: LevelMeta['gemeinden']): Level {
  const meta: LevelMeta = {
    level: 'gemeinde',
    year: 2023,
    canton: 'AG',
    count: gemeindeIdx.length,
    arrays: {},
    nogaGroups: [],
    unknownColor: '#BFBFBF',
    unknownIndex: 255,
    stats: { min: 0, max: 0, sum: 0, p99: 0, ambiguousCells: 0, overstatementMax: 0 },
    gemeinden,
  }
  return {
    meta,
    arrays: {
      positions: new Float32Array(gemeindeIdx.length * 2),
      values: new Float32Array(gemeindeIdx.length),
      noga: new Uint8Array(gemeindeIdx.length),
      flags: new Uint8Array(gemeindeIdx.length),
      gemeindeIdx: new Uint16Array(gemeindeIdx),
    },
  }
}

describe('joinMunicipalityGeometry', () => {
  it('matches each row to its polygon by bfs_nr, in row order', () => {
    const gemeinden: LevelMeta['gemeinden'] = [
      { bfsNr: 4001, name: 'Aarau', ambiguousCells: 0 },
      { bfsNr: 4002, name: 'Baden', ambiguousCells: 0 },
    ]
    // Zeilenreihenfolge (gemeindeIdx) ist absichtlich umgekehrt zur
    // Gemeindetabelle — der Join muss über bfs_nr matchen, nicht über die
    // zufällig gleiche Position in beiden Arrays.
    const lvl = level([1, 0], gemeinden)
    const fc = boundaries([
      { type: 'Feature', properties: { bfs_nr: 4001, name: 'Aarau' }, geometry: AARAU_POLYGON },
      { type: 'Feature', properties: { bfs_nr: 4002, name: 'Baden' }, geometry: BADEN_POLYGON },
    ])

    const geometries = joinMunicipalityGeometry(lvl, fc)

    expect(geometries[0]).toEqual(BADEN_POLYGON)
    expect(geometries[1]).toEqual(AARAU_POLYGON)
  })

  it('throws, naming the missing bfs_nr, when a municipality has no matching polygon', () => {
    const gemeinden: LevelMeta['gemeinden'] = [{ bfsNr: 4001, name: 'Aarau', ambiguousCells: 0 }]
    const lvl = level([0], gemeinden)
    const fc = boundaries([]) // Aarau fehlt komplett

    expect(() => joinMunicipalityGeometry(lvl, fc)).toThrow(/4001/)
  })

  it('throws when the level has no gemeindeIdx/gemeinden at all', () => {
    const lvl = level([], undefined)
    lvl.arrays.gemeindeIdx = undefined
    expect(() => joinMunicipalityGeometry(lvl, boundaries([]))).toThrow(/gemeindeIdx/)
  })
})

// `joinCantonGeometry` teilt ihre Implementierung mit `joinMunicipalityGeometry`
// (siehe `data/boundaries.ts`, `joinGeometry`) — diese Tests prüfen deshalb vor
// allem, dass sie tatsächlich `level.meta.kantone` liest (nicht `gemeinden`,
// die hier absichtlich fehlen) und dieselbe bfs_nr-Zuordnung/Fehlerbehandlung
// bekommt wie die Gemeindestufe.
function kantoneLevel(gemeindeIdx: number[], kantone: LevelMeta['kantone']): Level {
  const meta: LevelMeta = {
    level: 'kantone',
    year: 2023,
    canton: 'CH',
    count: gemeindeIdx.length,
    arrays: {},
    nogaGroups: [],
    unknownColor: '#BFBFBF',
    unknownIndex: 255,
    stats: { min: 0, max: 0, sum: 0, p99: 0, ambiguousCells: 0, overstatementMax: 0 },
    kantone,
  }
  return {
    meta,
    arrays: {
      positions: new Float32Array(gemeindeIdx.length * 2),
      values: new Float32Array(gemeindeIdx.length),
      noga: new Uint8Array(gemeindeIdx.length),
      flags: new Uint8Array(gemeindeIdx.length),
      gemeindeIdx: new Uint16Array(gemeindeIdx),
    },
  }
}

describe('joinCantonGeometry', () => {
  it('matches each row to its polygon by bfs_nr, reading meta.kantone (not gemeinden)', () => {
    const kantone: LevelMeta['kantone'] = [
      { bfsNr: 1, code: 'ZH', name: 'Zürich', ambiguousCells: 0 },
      { bfsNr: 19, code: 'AG', name: 'Aargau', ambiguousCells: 0 },
    ]
    // Zeilenreihenfolge absichtlich umgekehrt zur Kantonstabelle, wie im
    // Gemeinde-Pendant oben — der Join muss über bfs_nr matchen.
    const lvl = kantoneLevel([1, 0], kantone)
    const fc = boundaries([
      { type: 'Feature', properties: { bfs_nr: 1, name: 'Zürich' }, geometry: AARAU_POLYGON },
      { type: 'Feature', properties: { bfs_nr: 19, name: 'Aargau' }, geometry: BADEN_POLYGON },
    ])

    const geometries = joinCantonGeometry(lvl, fc)

    expect(geometries[0]).toEqual(BADEN_POLYGON)
    expect(geometries[1]).toEqual(AARAU_POLYGON)
  })

  it('throws, naming the missing bfs_nr, when a canton has no matching polygon', () => {
    const kantone: LevelMeta['kantone'] = [{ bfsNr: 1, code: 'ZH', name: 'Zürich', ambiguousCells: 0 }]
    const lvl = kantoneLevel([0], kantone)
    expect(() => joinCantonGeometry(lvl, boundaries([]))).toThrow(/1/)
  })

  it('throws when the level has no gemeindeIdx/kantone at all', () => {
    const lvl = kantoneLevel([], undefined)
    lvl.arrays.gemeindeIdx = undefined
    expect(() => joinCantonGeometry(lvl, boundaries([]))).toThrow(/gemeindeIdx/)
  })
})
