import type { FeatureCollection, Geometry } from 'geojson'
import type { Level } from './loader'

/** Properties, die `boundaries.py` je Feature schreibt (`write_geojson`) —
 *  Gemeinde- wie Kantonsgrenzen tragen dieselben zwei Felder, das reicht, um
 *  ein Feature einer Zeile im Binärformat bzw. dem konfigurierten Kanton
 *  zuzuordnen. Absichtlich knapp: die Fläche ist reine Geometrie, alle
 *  Kennzahlen (Beschäftigte, Branchenmischung, …) kommen weiterhin aus
 *  `ag_gemeinde.{bin,json}`, nicht aus dieser Datei. */
export interface BoundaryProperties {
  bfs_nr: number
  name: string
}

export type BoundaryFeatureCollection = FeatureCollection<Geometry, BoundaryProperties>

async function loadGeojson(path: string): Promise<BoundaryFeatureCollection> {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return (await response.json()) as BoundaryFeatureCollection
}

/** Gemeindegrenzen des konfigurierten Kantons (`<prefix>_boundaries.geojson`).
 *  Das ETL schreibt diese Datei seit dem allerersten Lauf — bis Change 2
 *  (extrudierte Gemeindeflächen statt Säulen an einem Referenzpunkt) lud sie
 *  im Frontend niemand (siehe README, Repo-Struktur). */
export function loadMunicipalityBoundaries(
  prefix: string,
  base = '/data',
): Promise<BoundaryFeatureCollection> {
  return loadGeojson(`${base}/${prefix}_boundaries.geojson`)
}

/** Alle 26 Kantone der Schweiz (`ch_kantone.geojson`), kantonsunabhängig
 *  benannt: die selbstgezeichnete Basiskarte (Change 3, ersetzt die
 *  bisherigen swisstopo-Vektorkacheln) zeigt immer alle 26, nicht nur den
 *  konfigurierten — siehe `etl/src/draufsicht_etl/boundaries.py`,
 *  `cantons_geojson_path()`. */
export function loadCantons(base = '/data'): Promise<BoundaryFeatureCollection> {
  return loadGeojson(`${base}/ch_kantone.geojson`)
}

/** Ordnet jeder Zeile der Gemeindestufe (indiziert wie `level.arrays.values`)
 *  ihre Polygongeometrie zu, per `bfs_nr` aus `level.meta.gemeinden` —
 *  reines In-Memory-Matching zweier bereits geladener Objekte, kein weiterer
 *  Netzwerkzugriff. Der Join passiert bewusst einmal beim Laden (siehe
 *  `main.ts`), nicht bei jedem Render: `many.ts` bekommt das Ergebnis fertig
 *  und bleibt dadurch weiterhin eine reine `(daten, uiState) → Layer`-Funktion
 *  ohne eigene Join-Logik über zwei Artefakte hinweg.
 *
 *  Bricht hart ab, wenn einer Gemeinde keine Geometrie zugeordnet werden
 *  kann: eine Gemeinde ohne Fläche wäre eine unsichtbare Zeile, die trotzdem
 *  in jeder Summe steckt — genau die Art stiller Fehler, die dieses Projekt
 *  an anderer Stelle ausdrücklich vermeidet (README, „Fehlerbehandlung“). */
export function joinMunicipalityGeometry(
  level: Level,
  boundaries: BoundaryFeatureCollection,
): Geometry[] {
  const { gemeindeIdx } = level.arrays
  const gemeinden = level.meta.gemeinden
  if (!gemeindeIdx || !gemeinden) {
    throw new Error('Gemeindestufe ohne gemeindeIdx/gemeinden — Geometrie-Join nicht möglich.')
  }

  const byBfsNr = new Map<number, Geometry>()
  for (const feature of boundaries.features) {
    const bfsNr = feature.properties.bfs_nr
    if (feature.geometry) byBfsNr.set(bfsNr, feature.geometry)
  }

  const missing: number[] = []
  const geometries: Geometry[] = new Array(level.meta.count)
  for (let i = 0; i < level.meta.count; i++) {
    const gemeindeNr = gemeindeIdx[i] ?? -1
    const gemeinde = gemeinden[gemeindeNr]
    const geometry = gemeinde ? byBfsNr.get(gemeinde.bfsNr) : undefined
    if (!geometry) {
      missing.push(gemeinde?.bfsNr ?? -1)
      continue
    }
    geometries[i] = geometry
  }
  if (missing.length > 0) {
    throw new Error(
      `${missing.length} Gemeinde(n) ohne Polygongeometrie in den Grenzen ` +
        `(bfs_nr: ${missing.join(', ')}).`,
    )
  }
  return geometries
}
