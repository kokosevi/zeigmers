import { GeoJsonLayer } from '@deck.gl/layers'
import type { Feature, Geometry } from 'geojson'
import type { BoundaryFeatureCollection, BoundaryProperties } from '../data/boundaries'
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
// weit darüber. Exportiert, weil `layers/many.ts` dieselbe Zahl braucht: die
// Gemeindepolygone bekommen sie als Basis-Höhe aufgeprägt
// (`withBaseElevation`), sonst stünden sie ab z=0 IN der Kantonsplatte statt
// sichtbar AUF ihr (siehe Kommentar dort).
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
 *  hier: kein MapLibre, kein DOM. */
export function buildCantonsLayer({
  data,
  activeBfsNr,
}: CantonsLayerOptions): GeoJsonLayer<BoundaryProperties> {
  return new GeoJsonLayer<BoundaryProperties>({
    id: 'kantone',
    data,
    filled: true,
    stroked: true,
    extruded: true,
    material: MAP_MATERIAL,
    getElevation: CANTON_ELEVATION_M,
    pickable: false,
    getFillColor: (f: Feature<Geometry, BoundaryProperties>) =>
      f.properties.bfs_nr === activeBfsNr ? AARGAU_FILL : LAND_FILL,
    getLineColor: LAND_LINE,
    getLineWidth: 1,
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: 1,
    updateTriggers: { getFillColor: [activeBfsNr] },
  })
}
