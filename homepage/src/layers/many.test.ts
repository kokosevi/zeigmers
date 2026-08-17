import type { Geometry } from 'geojson'
import { describe, expect, it } from 'vitest'
import type { Level, LevelMeta } from '../data/loader'
import { buildColors } from '../domain/colors'
import { computeElevations } from '../domain/scale'
import { buildMunicipalityLayer, MAX_BAR_HEIGHT_M } from './many'

// `buildMunicipalityLayer` ist der einzige Ort, der die Zeilenindizes von
// `level.arrays` (Werte, Farbe) mit der von aussen gejointen `geometries[]`
// (siehe `data/boundaries.ts`) über eine gemeinsame Feature-Property `index`
// zusammenführt und die (elevations, colors)-Arrays cached, damit ein
// Skalenwechsel nicht bei jedem Render neu rechnet. Bisher ungetestet — ein
// Off-by-one in der Index-Zuordnung würde nur im Bild auffallen.

const AARAU_POLYGON: Geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [8.0, 47.4],
      [8.1, 47.4],
      [8.1, 47.5],
      [8.0, 47.4],
    ],
  ],
}

const BADEN_POLYGON: Geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [8.2, 47.6],
      [8.3, 47.6],
      [8.3, 47.7],
      [8.2, 47.6],
    ],
  ],
}

const WOHLEN_POLYGON: Geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [8.4, 47.3],
      [8.5, 47.3],
      [8.5, 47.35],
      [8.4, 47.3],
    ],
  ],
}

// Drei Zeilen mit klar unterschiedlichen Werten (deckt einen Index-Fehler
// auf, den drei gleiche Werte verstecken würden) und, damit der Farb-Test
// auch den reservierten „nicht bestimmbar“-Fall trifft, eine Zeile mit
// `noga = 255` (NOGA_UNKNOWN_INDEX).
function level(values: number[], noga: number[], flags: number[]): Level {
  const meta: LevelMeta = {
    level: 'gemeinde',
    year: 2023,
    canton: 'AG',
    count: values.length,
    arrays: {},
    nogaGroups: [],
    unknownColor: '#BFBFBF',
    unknownIndex: 255,
    stats: { min: 0, max: Math.max(...values), sum: 0, p99: 0, ambiguousCells: 0, overstatementMax: 0 },
  }
  return {
    meta,
    arrays: {
      positions: new Float32Array(values.length * 2),
      values: new Float32Array(values),
      noga: new Uint8Array(noga),
      flags: new Uint8Array(flags),
    },
  }
}

const VALUES = [100, 900, 9000]
const NOGA = [0, 1, 255] // letzte Zeile: dominante Gruppe nicht bestimmbar
const FLAGS = [0, 0, 0]
const GEOMETRIES = [AARAU_POLYGON, BADEN_POLYGON, WOHLEN_POLYGON]
const VMAX = 9000

describe('buildMunicipalityLayer', () => {
  it('assigns each feature the elevation of its own row, not a neighbour’s', () => {
    const lvl = level(VALUES, NOGA, FLAGS)
    const layer = buildMunicipalityLayer('test-elevation', {
      level: lvl,
      geometries: GEOMETRIES,
      vmax: VMAX,
      mode: 'logarithmisch',
      opacity: 1,
      visible: true,
    })

    const expected = computeElevations(lvl.arrays.values, VMAX, MAX_BAR_HEIGHT_M, 'logarithmisch')
    const getElevation = layer.props.getElevation as (f: { properties: { index: number } }) => number

    for (let i = 0; i < VALUES.length; i++) {
      expect(getElevation({ properties: { index: i } })).toBeCloseTo(expected[i]!, 6)
    }
    // Die drei Werte sind absichtlich unterschiedlich groß — eine falsch
    // verschobene Indexzuordnung würde hier auf gleiche statt aufsteigende
    // Höhen führen.
    expect(expected[0]!).toBeLessThan(expected[1]!)
    expect(expected[1]!).toBeLessThan(expected[2]!)
  })

  it('assigns each feature the branch-group colour of its own row, including the unknown fallback', () => {
    const lvl = level(VALUES, NOGA, FLAGS)
    const layer = buildMunicipalityLayer('test-color', {
      level: lvl,
      geometries: GEOMETRIES,
      vmax: VMAX,
      mode: 'logarithmisch',
      opacity: 1,
      visible: true,
    })

    const expectedColors = buildColors(lvl.arrays.noga, lvl.arrays.flags)
    const getFillColor = layer.props.getFillColor as (f: {
      properties: { index: number }
    }) => [number, number, number, number]

    for (let i = 0; i < VALUES.length; i++) {
      const offset = i * 4
      expect(getFillColor({ properties: { index: i } })).toEqual([
        expectedColors[offset],
        expectedColors[offset + 1],
        expectedColors[offset + 2],
        expectedColors[offset + 3],
      ])
    }
    // Zeile 2 hat noga = 255 (NOGA_UNKNOWN_INDEX) — muss auf das reservierte
    // Grau fallen, nicht auf irgendeine Branchenfarbe.
    expect(getFillColor({ properties: { index: 2 } })).toEqual([191, 191, 191, 255])
  })

  it('reuses the cached FeatureCollection when nothing changed, and rebuilds when the geometries reference changes', () => {
    const lvl = level(VALUES, NOGA, FLAGS)
    const options = {
      level: lvl,
      geometries: GEOMETRIES,
      vmax: VMAX,
      mode: 'logarithmisch' as const,
      opacity: 1,
      visible: true,
    }

    const first = buildMunicipalityLayer('test-cache', options)
    const second = buildMunicipalityLayer('test-cache', options)
    // Gleiche (values, noga, flags, geometries-Referenz, vmax, mode) — der
    // Cache in many.ts muss dasselbe `data`-Objekt zurückgeben, sonst würde
    // jeder Render (z. B. bei unverändertem Skalenwechsel-Klick) unnötig neue
    // Arrays UND ein neues FeatureCollection-Objekt anlegen.
    expect(second.props.data).toBe(first.props.data)

    // Eine neue geometries-Instanz mit identischem Inhalt (wie sie ein neuer
    // `joinMunicipalityGeometry()`-Aufruf liefern würde) muss den Cache dagegen
    // invalidieren — sonst zeigte ein neu geladener Datensatz die alten
    // Geometrien weiter an.
    const rejoined = [...GEOMETRIES]
    const third = buildMunicipalityLayer('test-cache', { ...options, geometries: rejoined })
    expect(third.props.data).not.toBe(first.props.data)
  })
})
