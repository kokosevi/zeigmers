import type { FeatureCollection, Geometry } from 'geojson'
import {
  loadCantons,
  loadLakes,
  joinCantonGeometry,
  type BoundaryFeatureCollection,
} from '../data/boundaries'
import { loadLevel, loadMeta, type Level, type Meta } from '../data/loader'
import { boundsOfGeometries, type LngLatBounds } from '../domain/bounds'
import type { ScaleMode } from '../domain/scale'
import { buildCantonBorderLayer } from '../layers/cantons'
import { createMap, type MapHandle } from '../map'
import { showError } from '../ui/error'
import { createNav, type ViewName } from '../ui/nav'

/** Alles, was beide Kartenseiten gemeinsam brauchen — einmal geladen und
 *  hergeleitet. Bewusst ein einfacher Datenhalter ohne Methoden: was damit
 *  geschieht, entscheidet die jeweilige Seite (`karte/firmen.ts`,
 *  `karte/beschaeftigte.ts`), nicht dieser gemeinsame Aufbau. */
export interface Basis {
  handle: MapHandle
  meta: Meta
  cantonsGeo: BoundaryFeatureCollection
  cantonBorderLayer: ReturnType<typeof buildCantonBorderLayer>
  kantone: Level
  cantonGeometries: Geometry[]
  nationalBounds: LngLatBounds
  /** `null`, wenn `loadLakes()` das Artefakt nicht laden konnte — die Seen
   *  sind Orientierung, kein Inhalt, ihr Fehlen darf die Karte nicht
   *  verhindern (siehe `data/boundaries.ts`, `loadLakes`). */
  lakesGeo: FeatureCollection | null
}

/** Legt die Karte an und lädt, was beide Seiten brauchen.
 *
 *  `ch_kantone.{json,bin}` (zusammen 5.6 KB) lädt bewusst auf **beiden**
 *  Seiten, obwohl die Firmen-Ansicht die Kantons-Aggregatwerte selbst nicht
 *  zeichnet: daraus leitet sich über `joinCantonGeometry` die Schweiz-Rahmung
 *  der Kamera ab. Die Rahmung aus `cantonsGeo` allein zu bilden wäre möglich,
 *  ergäbe aber bei einem unvollständigen Join eine andere Rahmung als auf der
 *  Beschäftigten-Seite — zwei Seiten, die die Schweiz verschieden rahmen, für
 *  5.6 KB. `companies.json` (320 KB) lädt dagegen nur die Firmen-Seite.
 *
 *  Wirft statt selbst zu melden: die Seiten-Einstiege (`src/firmen.ts`,
 *  `src/beschaeftigte.ts`) haben den einen Fehlerweg nach `showError`. Eine
 *  Ausnahme darin ist `loadLakes()` (19.6 KB): sie liefert bei einem Fehler
 *  `null` statt zu werfen (siehe dort) und läuft trotzdem in **diesem**
 *  `Promise.all` mit, nicht in einem zweiten, seriellen Ladeschritt danach —
 *  ein fehlendes Seenartefakt darf die Karte verzögern und nicht, ein
 *  vorhandenes soll die Seite nicht langsamer starten lassen als nötig. */
export async function createBasis(): Promise<Basis> {
  const container = document.getElementById('map')
  if (!container) throw new Error('Kartencontainer #map fehlt im HTML.')

  const handle = createMap(container)
  handle.onError((message) => showError(`Basiskarte: ${message}`))

  const [meta, kantone, cantonsGeo, lakesGeo] = await Promise.all([
    loadMeta(),
    loadLevel('ch_kantone'),
    loadCantons(),
    loadLakes(),
  ])

  const cantonGeometries = joinCantonGeometry(kantone, cantonsGeo)
  // Schweiz-Rahmung aus der tatsächlichen Geometrie hergeleitet (Auftrag:
  // „Derive the canton framing from the geometry rather than hardcoding 26
  // camera positions") — kein von Hand gewählter Zentrum/Zoom-Wert.
  // `instant: true`: die erste Rahmung beim Laden ist keine Reaktion auf eine
  // Nutzerinteraktion, die eine Kameraanimation ankündigen müsste — sie stellt
  // nur den Platzhalter aus `map.ts` (`INITIAL_VIEW`) richtig, bevor
  // irgendetwas gezeichnet ist.
  const nationalBounds = boundsOfGeometries(cantonGeometries)
  handle.frameBounds(nationalBounds, { instant: true })

  return {
    handle,
    meta,
    cantonsGeo,
    cantonBorderLayer: buildCantonBorderLayer({ data: cantonsGeo }),
    kantone,
    cantonGeometries,
    nationalBounds,
    lakesGeo,
  }
}

/** Hängt die Steuerung in `#ui` ein. `createNav` ruft `onModeChange` schon bei
 *  der Konstruktion einmal auf — das übernimmt den ersten Render. */
export function mountNav(
  view: ViewName,
  onModeChange: (mode: ScaleMode) => void,
): void {
  document.getElementById('ui')?.appendChild(createNav(view, onModeChange))
}
