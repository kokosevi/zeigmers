import { GeoJsonLayer } from '@deck.gl/layers'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { Level } from '../data/loader'
import { buildColors } from '../domain/colors'
import { computeElevations, type ScaleMode } from '../domain/scale'
import { CANTON_ELEVATION_M } from './cantons'
import { withBaseElevation } from './elevation'
import { MAP_MATERIAL } from './material'

// Redesign-Vorgabe (2026-08-14): 12'000 → 3'000. Der höchste Balken (Aarau)
// lag bei 21 % der Kantonsbreite, die Referenz liegt eher bei 5 % — ein
// Machbarkeitsnachweis, keine Skyline. `vmax` (Gemeindemaximum, aus
// `main.ts`) und die aktive Höhenskala (`domain/scale.ts`) sind unverändert,
// nur die Decke zieht sich zusammen; relative Höhen zwischen Gemeinden
// bleiben exakt erhalten (siehe `domain/scale.ts`, `computeElevations`).
export const MAX_BAR_HEIGHT_M = 3000

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
  /** Change 4 (Hover): feuert bei jedem `onHover`-Event mit dem Zeilenindex
   *  (oder `null`, wenn die Maus keine Fläche mehr trifft) plus Bildschirm-
   *  koordinaten. Bleibt bewusst ohne Namensauflösung — welcher Index zu
   *  welchem Gemeindenamen gehört, weiss `main.ts`/`ui/panel.ts`
   *  (`municipalityName`), nicht dieser reine Layer-Baustein. Die Farb-
   *  änderung selbst läuft über `autoHighlight`/`highlightColor` unten,
   *  ohne dass dieser Callback je einen Layer- oder Datenrebuild auslöst. */
  onHover?: (index: number | null, x: number, y: number) => void
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
    features.push({
      type: 'Feature',
      geometry: withBaseElevation(geometry, CANTON_ELEVATION_M),
      properties: { index: i },
    })
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

// Change 4 (Hover): leichte, halbtransparente Aufhellung der getroffenen
// Fläche. deck.gl blendet das intern über die getroffene Fläche, ohne Daten
// oder Layer neu zu bauen — bewusst ein neutrales Weiss statt einer der elf
// Branchenfarben, damit die Hervorhebung unabhängig von der jeweiligen
// Gruppe funktioniert und die gemessenen Farben selbst unangetastet bleiben.
const HOVER_HIGHLIGHT_COLOR: [number, number, number, number] = [255, 255, 255, 70]

export function buildMunicipalityLayer(
  id: string,
  options: LayerOptions,
): GeoJsonLayer<MunicipalityFeatureProperties> {
  const { level, geometries, vmax, mode, opacity, visible, onClick, onHover } = options
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
    // Redesign (2026-08-14): Material aktiv statt `false`. `material: false`
    // war eine Performance-Entscheidung für bis zu 17'940 Hektarbalken; bei
    // 196 Gemeindeflächen ist der Mehraufwand irrelevant, und ohne Material
    // gäbe es kein Licht/Schatten-Spiel zwischen Deckfläche und Seitenwand
    // (siehe `layers/material.ts`, `layers/lighting.ts`).
    material: MAP_MATERIAL,
    pickable: true,
    autoHighlight: true,
    highlightColor: HOVER_HIGHLIGHT_COLOR,
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
    onHover: onHover
      ? (info) => {
          const feature = info.object as MunicipalityFeature | undefined
          onHover(feature ? feature.properties.index : null, info.x, info.y)
        }
      : undefined,
  })
}

// Change 7 («Börsennotierte Firmen» bekommt eine sichtbare Gemeindegliederung):
// dieselben `ag_boundaries.geojson`-Polygone wie `buildMunicipalityLayer`
// oben (`geometries`, bereits beim Laden gejoint, kein zweiter Fetch), aber
// als reine, ungefüllte Linienlage ohne Extrusion — die Firmensäulen sind der
// Inhalt dieser Ansicht, die Gemeindegrenze nur die Fläche, auf der sie
// stehen. Farbe/Breite bewusst unter denen der Kantonsgrenze
// (`layers/cantons.ts`, `buildCantonBorderLayer`): dünner und blasser, damit
// die Hierarchie Kanton > Gemeinde auch optisch stimmt. Auf die Plattenhöhe
// gehoben (siehe `withBaseElevation`), sonst läge die Linie bei z=0 unter der
// Kantonsplatte statt sichtbar auf ihr.
const MUNICIPALITY_BORDER_COLOR: [number, number, number, number] = [168, 182, 198, 130] // --land-kante, reduzierte Deckkraft
const MUNICIPALITY_BORDER_WIDTH_PX = 0.6

/** Nur für Ansicht B («Börsennotierte Firmen») gebaut, einmalig in `main.ts` —
 *  die Geometrie hängt weder von `vmax` noch von `mode` ab, ein Cache wie bei
 *  `buildMunicipalityLayer` ist hier unnötig. */
export function buildMunicipalityBorderLayer(
  geometries: Geometry[],
): GeoJsonLayer<Record<string, never>> {
  const features: Feature<Geometry, Record<string, never>>[] = geometries.map((geometry) => ({
    type: 'Feature',
    geometry: withBaseElevation(geometry, CANTON_ELEVATION_M),
    properties: {},
  }))

  return new GeoJsonLayer<Record<string, never>>({
    id: 'gemeinde-grenzen',
    data: { type: 'FeatureCollection', features },
    filled: false,
    stroked: true,
    extruded: false,
    pickable: false,
    getLineColor: MUNICIPALITY_BORDER_COLOR,
    getLineWidth: MUNICIPALITY_BORDER_WIDTH_PX,
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: MUNICIPALITY_BORDER_WIDTH_PX,
  })
}
