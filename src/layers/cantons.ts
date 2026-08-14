import { GeoJsonLayer } from '@deck.gl/layers'
import type { Feature, Geometry } from 'geojson'
import type { BoundaryFeatureCollection, BoundaryProperties } from '../data/boundaries'

// Heller, halbtransparenter Flächenfüll und dünne Konturen: die Kantone sind
// reine Orientierung für eine ansonsten leere Basiskarte (Change 3, ersetzt
// die swisstopo-Vektorkacheln), kein Datenlayer — sie dürfen die Gemeinde-
// bzw. Firmenbalken optisch nicht konkurrenzieren.
const FILL_COLOR: [number, number, number, number] = [148, 163, 184, 60]
const LINE_COLOR: [number, number, number, number] = [148, 163, 184, 140]

// Der konfigurierte Kanton (aus meta.json, siehe main.ts) sticht sichtbar
// hervor — sonst ginge die Frage "welcher Kanton ist das eigentlich" in 26
// gleich eingefärbten Flächen unter.
const ACTIVE_FILL_COLOR: [number, number, number, number] = [96, 165, 250, 90]
const ACTIVE_LINE_COLOR: [number, number, number, number] = [37, 99, 235, 220]

export interface CantonsLayerOptions {
  data: BoundaryFeatureCollection
  /** `meta.canton.bfs_nr` aus `/data/meta.json` — nicht hartcodiert, damit ein
   *  Kantonswechsel (siehe README) automatisch den richtigen der 26 hervorhebt. */
  activeBfsNr: number
}

/** Selbstgezeichnete Basiskarte: alle 26 Kantone, flach (keine Extrusion,
 *  anders als die Gemeindeflächen in `many.ts`), nicht anklickbar. Ersetzt
 *  die früher zur Laufzeit von swisstopo geladenen Vektorkacheln — siehe
 *  README/Spec Abschnitt 9 und 10 (das dortige Ausfallrisiko "swisstopo-
 *  Vektorkacheln fallen aus" entfällt damit, es gibt keinen Laufzeit-Request
 *  an einen fremden Dienst mehr). Rein wie jeder Layer-Modul-Export hier:
 *  kein MapLibre, kein DOM. */
export function buildCantonsLayer({
  data,
  activeBfsNr,
}: CantonsLayerOptions): GeoJsonLayer<BoundaryProperties> {
  return new GeoJsonLayer<BoundaryProperties>({
    id: 'kantone',
    data,
    filled: true,
    stroked: true,
    extruded: false,
    pickable: false,
    getFillColor: (f: Feature<Geometry, BoundaryProperties>) =>
      f.properties.bfs_nr === activeBfsNr ? ACTIVE_FILL_COLOR : FILL_COLOR,
    getLineColor: (f: Feature<Geometry, BoundaryProperties>) =>
      f.properties.bfs_nr === activeBfsNr ? ACTIVE_LINE_COLOR : LINE_COLOR,
    getLineWidth: (f: Feature<Geometry, BoundaryProperties>) =>
      f.properties.bfs_nr === activeBfsNr ? 2 : 1,
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: 1,
    // Alle drei Accessoren lesen `activeBfsNr` und müssen deshalb alle drei
    // hier stehen — heute unschädlich, weil `main.ts` diesen Layer einmalig
    // ausserhalb von `render()` baut, aber genau die Art Lücke, die erst
    // auffällt, wenn ihn später jemand in den Render-Zyklus verschiebt
    // (Review-Finding, Abschlussrunde).
    updateTriggers: {
      getFillColor: [activeBfsNr],
      getLineColor: [activeBfsNr],
      getLineWidth: [activeBfsNr],
    },
  })
}
