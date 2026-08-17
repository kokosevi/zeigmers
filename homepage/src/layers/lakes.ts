import { GeoJsonLayer } from '@deck.gl/layers'
import type { FeatureCollection } from 'geojson'
import { CANTON_ELEVATION_M } from './cantons'
import { withBaseElevation } from './elevation'

/** Seeflächen auf Plattenhöhe. Sie tragen keine Zahl — sie sind der Grund,
 *  aus dem eine Silhouette der Schweiz als Schweiz erkennbar ist. Quelle ist
 *  eine Kombination aus Natural Earth und swissBOUNDARIES3D (siehe
 *  `etl/…/lakes.py`, Moduldocstring) — Natural Earth liefert vier Seen
 *  (u. a. Genfersee), swissBOUNDARIES3D die restlichen sechs; nur Natural
 *  Earth ist dabei die einzige nicht-amtliche Quelle dieser Karte (Abschluss-
 *  Review, Finding C3 — die Eckbox, `ui/notices.ts`, nennt beide). Literal
 *  statt eines CSS-Tokens wie `LAND_FILL` in `layers/cantons.ts`: die
 *  Seenfarbe ist keine Design-Entscheidung dieser Aufgabe, nur ein ruhiger,
 *  klar von der Kantonsplatte unterscheidbarer Blauton. */
const LAKE_FILL: [number, number, number, number] = [176, 198, 219, 255]

/** Vier Feature-Eigenschaften eines Sees fehlen absichtlich in diesem
 *  Artefakt: Vierwaldstättersee, Zugersee, Walensee und Lago di Lugano
 *  stecken sowohl bei swisstopo (Gemeindeflächen) als auch bei Natural Earth
 *  in den umliegenden Gemeindeflächen statt als eigene Seefläche — die
 *  Eckbox schreibt diese Lücke auf, statt sie zu beschweigen. Ein Feature
 *  ohne Namen (der Untersee-Teil des Bodensees, `properties.name === null`)
 *  ist dagegen gültig: der Name wird hier nirgends gelesen, nur die
 *  Geometrie zählt. */
export function buildLakesLayer(data: FeatureCollection): GeoJsonLayer {
  return new GeoJsonLayer({
    id: 'seen',
    // Auf Kantonsplattenhöhe gehoben (siehe `withBaseElevation`), sonst läge
    // die Fläche bei z=0 IN der Kantonsplatte statt sichtbar AUF ihr — genau
    // dasselbe Muster wie `buildCantonBorderLayer` in `layers/cantons.ts`.
    data: {
      ...data,
      features: data.features.flatMap((f) =>
        f.geometry ? [{ ...f, geometry: withBaseElevation(f.geometry, CANTON_ELEVATION_M) }] : [],
      ),
    },
    filled: true,
    stroked: false,
    extruded: false,
    pickable: false,
    getFillColor: LAKE_FILL,
  })
}
