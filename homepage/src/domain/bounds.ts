import type { Geometry, Position } from 'geojson'

/** `[[minLng, minLat], [maxLng, maxLat]]` — dieselbe Form, die
 *  `maplibregl.Map#fitBounds` als `LngLatBoundsLike` akzeptiert. */
export type LngLatBounds = [[number, number], [number, number]]

function extend(box: [number, number, number, number], pos: Position): void {
  const lng = pos[0]
  const lat = pos[1]
  if (lng === undefined || lat === undefined) return
  if (lng < box[0]) box[0] = lng
  if (lat < box[1]) box[1] = lat
  if (lng > box[2]) box[2] = lng
  if (lat > box[3]) box[3] = lat
}

function extendGeometry(box: [number, number, number, number], geometry: Geometry): void {
  switch (geometry.type) {
    case 'Polygon':
      for (const ring of geometry.coordinates) for (const pos of ring) extend(box, pos)
      return
    case 'MultiPolygon':
      for (const polygon of geometry.coordinates) {
        for (const ring of polygon) for (const pos of ring) extend(box, pos)
      }
      return
    case 'GeometryCollection':
      for (const inner of geometry.geometries) extendGeometry(box, inner)
      return
    case 'Point':
      extend(box, geometry.coordinates)
      return
    case 'MultiPoint':
    case 'LineString':
      for (const pos of geometry.coordinates) extend(box, pos)
      return
    case 'MultiLineString':
      for (const line of geometry.coordinates) for (const pos of line) extend(box, pos)
      return
  }
}

/** Bounding-Box (Lng/Lat) über eine oder mehrere Geometrien — die Grundlage,
 *  aus der `map.ts` (`frameBounds`, via `maplibregl.Map#fitBounds`) die Kamera
 *  für einen Kanton oder für die ganze Schweiz herleitet, statt 26 feste
 *  Kamerapositionen von Hand zu pflegen (Auftrag: „Derive the canton framing
 *  from the geometry rather than hardcoding 26 camera positions"). Reine
 *  Geometrie-Arithmetik, kein DOM, keine Karte — deshalb hier statt in
 *  `map.ts` und ohne Browser testbar. */
export function boundsOfGeometries(geometries: readonly Geometry[]): LngLatBounds {
  const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const geometry of geometries) extendGeometry(box, geometry)
  if (!Number.isFinite(box[0]) || !Number.isFinite(box[1])) {
    throw new Error('boundsOfGeometries: keine Koordinaten in den übergebenen Geometrien gefunden.')
  }
  return [
    [box[0], box[1]],
    [box[2], box[3]],
  ]
}
