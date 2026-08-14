import type { Geometry } from 'geojson'
import { describe, expect, it } from 'vitest'
import { boundsOfGeometries } from './bounds'

// `boundsOfGeometries` ist reine Arithmetik (kein `fetch`, kein DOM) — die
// Grundlage für die per Klick hergeleitete Kantons- bzw. Schweiz-Kamera in
// `map.ts` (`frameBounds`). Ein Vorzeichen- oder Achsenfehler hier würde sich
// nur als falsch gerahmte Karte zeigen, deshalb hier isoliert geprüft.

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

const GRAUBUENDEN_MULTI: Geometry = {
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [9.0, 46.6],
        [9.5, 46.6],
        [9.5, 46.9],
        [9.0, 46.6],
      ],
    ],
    [
      // Exklave, weiter östlich/nördlich als der Hauptkörper
      [
        [10.2, 46.9],
        [10.4, 46.9],
        [10.4, 47.0],
        [10.2, 46.9],
      ],
    ],
  ],
}

describe('boundsOfGeometries', () => {
  it('computes the min/max lng/lat envelope of a single polygon', () => {
    expect(boundsOfGeometries([AARAU_POLYGON])).toEqual([
      [8.0, 47.4],
      [8.1, 47.5],
    ])
  })

  it('includes every part of a MultiPolygon, including exclaves', () => {
    const bounds = boundsOfGeometries([GRAUBUENDEN_MULTI])
    expect(bounds).toEqual([
      [9.0, 46.6],
      [10.4, 47.0],
    ])
  })

  it('unions across several geometries, as needed for a Switzerland-wide frame', () => {
    const bounds = boundsOfGeometries([AARAU_POLYGON, GRAUBUENDEN_MULTI])
    expect(bounds).toEqual([
      [8.0, 46.6],
      [10.4, 47.5],
    ])
  })

  it('throws instead of returning an infinite/NaN box when given no geometries', () => {
    expect(() => boundsOfGeometries([])).toThrow(/keine Koordinaten/)
  })
})
