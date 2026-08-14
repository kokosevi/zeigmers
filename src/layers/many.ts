import { GeoJsonLayer } from '@deck.gl/layers'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { Level } from '../data/loader'
import { buildColors } from '../domain/colors'
import { computeElevations, type ScaleMode } from '../domain/scale'

export const MAX_BAR_HEIGHT_M = 12000

/** Jedes Feature trägt nur den Zeilenindex — Höhe und Farbe werden per
 *  Accessor aus den (gecachten) Level-Arrays gelesen, nicht in die Properties
 *  kopiert. Das hält die FeatureCollection unabhängig von Skala/Modus; nur
 *  die Accessor-Funktionen selbst wechseln (siehe `updateTriggers` unten). */
interface MunicipalityFeatureProperties {
  index: number
}

type MunicipalityFeature = Feature<Geometry, MunicipalityFeatureProperties>
type MunicipalityFeatureCollection = FeatureCollection<Geometry, MunicipalityFeatureProperties>

export interface LayerOptions {
  level: Level
  /** Eine Polygongeometrie je Zeile von `level`, aus `data/boundaries.ts`,
   *  `joinMunicipalityGeometry()` — bereits beim Laden gegen `ag_boundaries.geojson`
   *  gejoint (Change 2), nicht mehr ein einzelner Referenzpunkt je Gemeinde. */
  geometries: Geometry[]
  vmax: number
  mode: ScaleMode
  opacity: number
  visible: boolean
  onClick?: (index: number) => void
}

interface CacheEntry {
  values: Float32Array
  noga: Uint8Array
  flags: Uint8Array
  geometries: Geometry[]
  vmax: number
  mode: ScaleMode
  elevations: Float32Array
  colors: Uint8Array
  data: MunicipalityFeatureCollection
}

/** Hält die zuletzt berechneten Höhen/Farben und die daraus gebaute
 *  FeatureCollection fest — dieselbe Motivation wie beim früheren
 *  `ColumnLayer`-Cache (siehe Git-Historie): `computeElevations`/`buildColors`
 *  hängen nur von (values, vmax, maxHeight, mode) bzw. (noga, flags) ab, ohne
 *  Cache würde jeder Skalenwechsel (linear ↔ logarithmisch) unnötig neue
 *  Arrays UND ein neues `data`-Objekt anlegen. Bei 196 Gemeinden ist das für
 *  sich genommen unkritisch (anders als bei den früheren bis zu 17'940
 *  Hektarzeilen) — der Cache bleibt trotzdem, weil `getFillColor`/
 *  `getElevation` unten über Referenzen auf `elevations`/`colors` schliessen:
 *  ohne stabile Referenz zwischen Renders bräuchte jeder Aufruf einen neuen
 *  Accessor, den deck.gl dann als "geändert" behandeln müsste. */
const cache = new Map<string, CacheEntry>()

function getCacheEntry(
  id: string,
  level: Level,
  geometries: Geometry[],
  vmax: number,
  mode: ScaleMode,
): CacheEntry {
  const { arrays, meta } = level
  const cached = cache.get(id)
  if (
    cached &&
    cached.values === arrays.values &&
    cached.noga === arrays.noga &&
    cached.flags === arrays.flags &&
    cached.geometries === geometries &&
    cached.vmax === vmax &&
    cached.mode === mode
  ) {
    return cached
  }

  const elevations = computeElevations(arrays.values, vmax, MAX_BAR_HEIGHT_M, mode)
  const colors = buildColors(arrays.noga, arrays.flags)

  // Jede Gemeindezeile wird zu einem Feature mit ihrer eigenen Polygon- (oder
  // bei Exklaven MultiPolygon-)Geometrie aus `ag_boundaries.geojson` — anstatt,
  // wie vor Change 2, einer `ColumnLayer`-Säule an einem einzelnen
  // Referenzpunkt. `GeoJsonLayer` extrudiert Polygon/MultiPolygon gleichermassen.
  const features: MunicipalityFeature[] = []
  for (let i = 0; i < meta.count; i++) {
    const geometry = geometries[i]
    if (!geometry) continue // join() wirft bereits hart bei fehlender Geometrie; das ist nur die Typ-Absicherung
    features.push({ type: 'Feature', geometry, properties: { index: i } })
  }

  const entry: CacheEntry = {
    values: arrays.values,
    noga: arrays.noga,
    flags: arrays.flags,
    geometries,
    vmax,
    mode,
    elevations,
    colors,
    data: { type: 'FeatureCollection', features },
  }
  cache.set(id, entry)
  return entry
}

export function buildMunicipalityLayer(
  id: string,
  options: LayerOptions,
): GeoJsonLayer<MunicipalityFeatureProperties> {
  const { level, geometries, vmax, mode, opacity, visible, onClick } = options
  const { meta } = level

  const entry = getCacheEntry(id, level, geometries, vmax, mode)
  const { elevations, colors } = entry

  return new GeoJsonLayer<MunicipalityFeatureProperties>({
    id,
    data: entry.data,
    filled: true,
    stroked: false,
    extruded: true,
    wireframe: false,
    material: false, // flaches Shading, wie zuvor beim ColumnLayer — spürbar günstiger
    pickable: true,
    visible: visible && opacity > 0.01,
    opacity,
    getElevation: (f) => elevations[f.properties.index] ?? 0,
    getFillColor: (f) => {
      const offset = f.properties.index * 4
      return [
        colors[offset] ?? 0,
        colors[offset + 1] ?? 0,
        colors[offset + 2] ?? 0,
        colors[offset + 3] ?? 255,
      ]
    },
    updateTriggers: { getElevation: [mode, meta.level, vmax], getFillColor: [] },
    onClick: onClick
      ? (info) => {
          if (info.object) onClick((info.object as MunicipalityFeature).properties.index)
        }
      : undefined,
  })
}
