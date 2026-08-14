import type { Geometry, Position } from 'geojson'

/** Hebt eine Polygon-/MultiPolygon-Geometrie auf eine feste Höhe `z` an.
 *  `SolidPolygonLayer` extrudiert relativ zur eigenen Vertex-Höhe
 *  (`pos.z += elevations * elevationScale`, siehe
 *  `@deck.gl/layers/solid-polygon-layer`) und auch unextrudierte Linien/
 *  Punkte übernehmen die Vertex-Höhe direkt als Weltposition — ohne diesen
 *  Offset läge jede auf die Kantonsplatte bezogene Fläche oder Linie bei z=0,
 *  also IN der Platte (`layers/cantons.ts`, `CANTON_ELEVATION_M`) statt
 *  sichtbar AUF ihr. Nur x/y aus den ursprünglichen Koordinaten bleiben
 *  erhalten.
 *
 *  Gemeinsam genutzt von `layers/many.ts` (Gemeindeflächen und -grenzen) und
 *  `layers/cantons.ts` (Kantonsgrenzen) — vor Change 6/7 stand diese Funktion
 *  nur lokal in `many.ts`; die Kantonsgrenzen brauchen jetzt denselben Lift,
 *  siehe `buildCantonBorderLayer`. */
export function withBaseElevation(geometry: Geometry, z: number): Geometry {
  const lift = (ring: Position[]): Position[] => ring.map((pos) => [pos[0] ?? 0, pos[1] ?? 0, z])
  if (geometry.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geometry.coordinates.map(lift) }
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((polygon) => polygon.map(lift)),
    }
  }
  return geometry
}
