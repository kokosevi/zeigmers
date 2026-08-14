import { GeoJsonLayer } from '@deck.gl/layers'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { BoundaryFeatureCollection, BoundaryProperties } from '../data/boundaries'
import { withBaseElevation } from './elevation'
import { MAP_MATERIAL } from './material'

// Design-Tokens aus style.css (`--land`, `--land-kante`, `--aargau`), hier als
// RGBA-Literale dupliziert — CSS-Variablen erreichen WebGL-Farb-Accessor
// nicht. Bei einer Token-Änderung müssen diese drei Werte von Hand mitziehen.
// Redesign (2026-08-14): volle Deckkraft statt der früheren halbtransparenten
// Overlay-Füllung — die Kantone sind jetzt echte, wenn auch flache
// Extrusionskörper („eine Platte, aus der die Gemeinden wachsen"), keine
// durchscheinende Orientierungsebene mehr über einer fremden Basiskarte.
const LAND_FILL: [number, number, number, number] = [207, 216, 227, 255] // --land
const LAND_LINE: [number, number, number, number] = [168, 182, 198, 220] // --land-kante

// Der konfigurierte Kanton (aus meta.json, siehe main.ts) sticht durch eine
// hellere Füllfarbe hervor — „ein Schatten heller, damit er sich hebt"
// (Auftrag) — nicht mehr durch einen zusätzlichen Rand oder eine zweite
// Farbfamilie: die Differenzierung bleibt innerhalb derselben kühlen Palette.
const AARGAU_FILL: [number, number, number, number] = [221, 229, 238, 255] // --aargau

// Leichte Extrusion aller 26 Kantone (Redesign-Vorgabe: „Switzerland reads as
// a plate the municipalities rise from"). Niedrig gehalten, damit sie nicht
// mit den Gemeindebalken konkurriert — die kleinste Gemeinde in Ansicht B
// liegt nach der neuen Höhendecke (`MAX_BAR_HEIGHT_M` = 3000, `layers/many.ts`)
// weit darüber. Exportiert, weil `layers/many.ts` dieselbe Zahl braucht:
// Gemeindeflächen, Gemeindegrenzen und die Kantonsgrenzen unten bekommen sie
// als Basis-Höhe aufgeprägt (`withBaseElevation`), sonst lägen sie bei z=0 IN
// der Kantonsplatte statt sichtbar AUF ihr.
export const CANTON_ELEVATION_M = 300

export interface CantonsLayerOptions {
  data: BoundaryFeatureCollection
  /** `meta.canton.bfs_nr` aus `/data/meta.json` — nicht hartcodiert, damit ein
   *  Kantonswechsel (siehe README) automatisch den richtigen der 26 hervorhebt. */
  activeBfsNr: number
}

/** Selbstgezeichnete Basiskarte: alle 26 Kantone, jetzt mit einer flachen,
 *  gemeinsamen Extrusion (siehe `CANTON_ELEVATION_M`), nicht anklickbar.
 *  Ersetzt die früher zur Laufzeit von swisstopo geladenen Vektorkacheln —
 *  siehe README/Spec Abschnitt 9 und 10. Rein wie jeder Layer-Modul-Export
 *  hier: kein MapLibre, kein DOM.
 *
 *  Ohne Umriss (Regression-Fix, Change 6): `GeoJsonLayer` zeichnet den
 *  Polygon-Umriss nur, wenn `extruded: false` ist — bei `extruded: true`
 *  überspringt die Sublayer-Auswahl (`@deck.gl/layers/geojson-layer`,
 *  `_renderLineLayers`: `!extruded && stroked && …`) den Stroke-Sublayer
 *  komplett, unabhängig von `stroked`/`getLineColor`/`getLineWidth`. Diese
 *  Fläche trug also `stroked: true` mit Farbe/Breite, ohne je einen Rand zu
 *  zeichnen — nicht unsichtbar durch schwachen Kontrast, sondern schlicht nie
 *  gebaut. Siehe `buildCantonBorderLayer` unten für den tatsächlich
 *  sichtbaren Rand. */
export function buildCantonsLayer({
  data,
  activeBfsNr,
}: CantonsLayerOptions): GeoJsonLayer<BoundaryProperties> {
  return new GeoJsonLayer<BoundaryProperties>({
    id: 'kantone',
    data,
    filled: true,
    stroked: false,
    extruded: true,
    material: MAP_MATERIAL,
    getElevation: CANTON_ELEVATION_M,
    pickable: false,
    getFillColor: (f: Feature<Geometry, BoundaryProperties>) =>
      f.properties.bfs_nr === activeBfsNr ? AARGAU_FILL : LAND_FILL,
    updateTriggers: { getFillColor: [activeBfsNr] },
  })
}

/** Der tatsächlich sichtbare Kantonsrand (Regression-Fix, Change 6): eine
 *  zweite, ungefüllte, unextrudierte `GeoJsonLayer` auf denselben Daten, nur
 *  für den Umriss — siehe Kommentar an `buildCantonsLayer` oben, warum
 *  `stroked` auf der extrudierten Fläche wirkungslos war. Auf Plattenhöhe
 *  gehoben (`withBaseElevation`), damit der Rand am oberen, sichtbaren Rand
 *  der Platte liegt statt an ihrer Grundfläche bei z=0. Muss in **beiden**
 *  Ansichten gezeichnet werden (Auftrag) — `main.ts` baut sie deshalb einmal
 *  und reiht sie in beide `setLayers()`-Aufrufe ein, wie `buildCantonsLayer`
 *  selbst. Farbe/Breite unverändert gegenüber dem früheren (nie gezeichneten)
 *  Versuch: `--land-kante` bei praktisch voller Deckkraft, 1.2px — deutlich
 *  kräftiger als die Gemeindegrenzen in `layers/many.ts`
 *  (`buildMunicipalityBorderLayer`), die dieser Linie optisch untergeordnet
 *  bleiben sollen. */
export function buildCantonBorderLayer({
  data,
}: {
  data: BoundaryFeatureCollection
}): GeoJsonLayer<BoundaryProperties> {
  const lifted: FeatureCollection<Geometry, BoundaryProperties> = {
    type: 'FeatureCollection',
    features: data.features.flatMap((f) =>
      f.geometry ? [{ ...f, geometry: withBaseElevation(f.geometry, CANTON_ELEVATION_M) }] : [],
    ),
  }

  return new GeoJsonLayer<BoundaryProperties>({
    id: 'kantone-grenzen',
    data: lifted,
    filled: false,
    stroked: true,
    extruded: false,
    pickable: false,
    getLineColor: LAND_LINE,
    getLineWidth: 1.2,
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: 1.2,
  })
}
