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
 *  konfigurierten — siehe `etl/src/zeigmers_etl/boundaries.py`,
 *  `cantons_geojson_path()`. */
export function loadCantons(base = '/data'): Promise<BoundaryFeatureCollection> {
  return loadGeojson(`${base}/ch_kantone.geojson`)
}

/** Seeflächen (`lakes.geojson`, aus Natural Earth UND swissBOUNDARIES3D
 *  kombiniert — siehe `etl/…/lakes.py`, Moduldocstring), rein zur
 *  Orientierung: erst mit ihnen ist die Silhouette der Schweiz als Schweiz
 *  erkennbar, sie tragen aber keine Zahl und keine Auswahl. Anders
 *  als `loadCantons`/`loadGeojson` oben deshalb bewusst NICHT dasselbe
 *  Wurf-Muster: ein fehlendes oder kaputtes Artefakt (HTTP-Fehler oder
 *  ungültiges JSON) fällt still auf `null` zurück statt die Karte zum
 *  Abbruch zu bringen — `createBasis()` zeichnet ohne Seen weiter, ohne
 *  Fehlermeldung, weil ihr Fehlen kein Fehler ist.
 *
 *  Fix (Review, 2026-08-16): `response.json()` liefert bei gültigem, aber
 *  strukturell falschem JSON (`{}`, `[]`, ein Objekt ohne `features`) einen
 *  truthy Wert zurück, der kein `FeatureCollection` ist — ein `as` allein
 *  hätte das ungeprüft durchgereicht, `buildLakesLayer`s `data.features.
 *  flatMap(...)` (`layers/lakes.ts`) wäre dann mit einem `TypeError`
 *  abgestürzt, ungefangen bis in `showError`: genau der Karten-Abbruch, den
 *  diese Funktion verhindern soll. Eine Feature-Sammlung ist deshalb erst
 *  eine, wenn `features` tatsächlich ein Array ist — alles andere wird
 *  genau wie ein HTTP-Fehler zu `null`. */
export async function loadLakes(base = '/data'): Promise<FeatureCollection | null> {
  try {
    const response = await fetch(`${base}/lakes.geojson`)
    if (!response.ok) return null
    const parsed: unknown = await response.json()
    if (!isFeatureCollection(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

/** Struktur-Wächter für `loadLakes` oben: prüft nur, was `buildLakesLayer`
 *  (`layers/lakes.ts`) tatsächlich anfasst — ein Objekt mit einem
 *  `features`-Array. Kein vollständiger GeoJSON-Validator (der wäre für ein
 *  reines Schmuckartefakt Overkill), aber genug, um den `TypeError` aus dem
 *  Review-Fund oben strukturell auszuschliessen. */
function isFeatureCollection(value: unknown): value is FeatureCollection {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { features?: unknown }).features)
  )
}

/** Gemeinsame Join-Logik hinter `joinMunicipalityGeometry` und
 *  `joinCantonGeometry` unten: beide ordnen jeder Zeile eines Levels
 *  (indiziert wie `level.arrays.values`) über `gemeindeIdx` und eine Liste von
 *  `{ bfsNr }`-Einträgen ihre Polygongeometrie zu, per `bfs_nr` aus der
 *  jeweiligen Grenzdatei — reines In-Memory-Matching zweier bereits geladener
 *  Objekte, kein weiterer Netzwerkzugriff. Beide Level-Artefakte
 *  (`<code>_gemeinde.json` und `ch_kantone.json`) werden vom selben
 *  ETL-Schreiber erzeugt und tragen das Feld nur unter verschiedenem Namen
 *  (`gemeinden` bzw. `kantone`, siehe `LevelMeta`) — deshalb ein gemeinsamer
 *  Kern statt zweier Kopien derselben Schleife.
 *
 *  Bricht hart ab, wenn einer Zeile keine Geometrie zugeordnet werden kann:
 *  eine Fläche ohne Geometrie wäre eine unsichtbare Zeile, die trotzdem in
 *  jeder Summe steckt — genau die Art stiller Fehler, die dieses Projekt an
 *  anderer Stelle ausdrücklich vermeidet (README, „Fehlerbehandlung“). */
function joinGeometry(
  count: number,
  gemeindeIdx: Uint16Array | undefined,
  entries: readonly { bfsNr: number }[] | undefined,
  boundaries: BoundaryFeatureCollection,
  missingFieldLabel: string,
  rowLabel: string,
): Geometry[] {
  if (!gemeindeIdx || !entries) {
    throw new Error(`${missingFieldLabel} — Geometrie-Join nicht möglich.`)
  }

  const byBfsNr = new Map<number, Geometry>()
  for (const feature of boundaries.features) {
    const bfsNr = feature.properties.bfs_nr
    if (feature.geometry) byBfsNr.set(bfsNr, feature.geometry)
  }

  const missing: number[] = []
  const geometries: Geometry[] = new Array(count)
  for (let i = 0; i < count; i++) {
    const rowNr = gemeindeIdx[i] ?? -1
    const entry = entries[rowNr]
    const geometry = entry ? byBfsNr.get(entry.bfsNr) : undefined
    if (!geometry) {
      missing.push(entry?.bfsNr ?? -1)
      continue
    }
    geometries[i] = geometry
  }
  if (missing.length > 0) {
    throw new Error(
      `${missing.length} ${rowLabel}(n) ohne Polygongeometrie in den Grenzen ` +
        `(bfs_nr: ${missing.join(', ')}).`,
    )
  }
  return geometries
}

/** Ordnet jeder Zeile der Gemeindestufe ihre Polygongeometrie zu, per
 *  `bfs_nr` aus `level.meta.gemeinden`. Der Join passiert bewusst einmal beim
 *  Laden (siehe `karte/beschaeftigte.ts`, `loadCantonEntry`), nicht bei
 *  jedem Render: `many.ts` bekommt das Ergebnis fertig und bleibt dadurch
 *  weiterhin eine reine
 *  `(daten, uiState) → Layer`-Funktion ohne eigene Join-Logik über zwei
 *  Artefakte hinweg. */
export function joinMunicipalityGeometry(
  level: Level,
  boundaries: BoundaryFeatureCollection,
): Geometry[] {
  return joinGeometry(
    level.meta.count,
    level.arrays.gemeindeIdx,
    level.meta.gemeinden,
    boundaries,
    'Gemeindestufe ohne gemeindeIdx/gemeinden',
    'Gemeinde',
  )
}

/** Dieselbe Zuordnung wie `joinMunicipalityGeometry`, aber für die
 *  Kantonsstufe (`ch_kantone.json`/`.bin`, `ch_kantone.geojson`) — 26 Zeilen,
 *  je eine pro Kanton, aus `level.meta.kantone` statt `gemeinden` (Phase 2,
 *  «Schweiz»-Ebene von Ansicht «Beschäftigte»). Dieselbe Fehlerbehandlung:
 *  ein Kanton ohne Fläche bricht hart ab statt still zu fehlen. */
export function joinCantonGeometry(
  level: Level,
  boundaries: BoundaryFeatureCollection,
): Geometry[] {
  return joinGeometry(
    level.meta.count,
    level.arrays.gemeindeIdx,
    level.meta.kantone,
    boundaries,
    'Kantonsstufe ohne gemeindeIdx/kantone',
    'Kanton',
  )
}
