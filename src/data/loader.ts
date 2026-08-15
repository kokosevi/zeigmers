export type ArrayType = 'Float32' | 'Uint16' | 'Uint8'

export interface ArraySpec {
  byteOffset: number
  length: number
  type: ArrayType
}

export interface LevelStats {
  min: number
  max: number
  sum: number
  p99: number
  ambiguousCells: number
  overstatementMax: number
  /** Summe `einwohnerzahl` über alle Gemeinden (Change 2, 2026-08-14) —
   *  Bevölkerungsstand 31.12.2024 (swissBOUNDARIES3D, siehe
   *  `ui/panel.ts`), nicht dasselbe Jahr wie die STATENT-Beschäftigten
   *  (2023). Optional statt Pflichtfeld: ältere Artefakte/Test-Fixtures ohne
   *  dieses Feld sollen nicht am Typ scheitern, `ui/panel.ts` behandelt ein
   *  fehlendes Feld wie eine unbekannte Bevölkerung, nicht wie 0-durch-0. */
  population?: number
}

export interface LevelMeta {
  level: string
  year: number
  canton: string
  count: number
  arrays: Record<string, ArraySpec | undefined>
  nogaGroups: { key: string; label: string; color: string }[]
  unknownColor: string
  unknownIndex: number
  stats: LevelStats
  gemeinden?: {
    bfsNr: number
    name: string
    ambiguousCells: number
    /** Einwohnerzahl, Stand 31.12.2024 (swissBOUNDARIES3D-Objektkatalog,
     *  Attribut `EINWOHNERZAHL`; siehe `etl/src/zeigmers_etl/boundaries.py`).
     *  Optional: das Feld fehlt in älteren Artefakten/Test-Fixtures, und der
     *  swisstopo-Objektkatalog garantiert ohnehin keinen Wert für jede Zeile
     *  (Exklaven-Teilpolygone führen keinen) — `ui/panel.ts` behandelt beides
     *  gleich, nie als Grundlage einer Division durch 0. */
    einwohnerzahl?: number
  }[]
  /** Analog zu `gemeinden` oben, aber für die Kantonsstufe (`ch_kantone.json`,
   *  Phase 2): 26 Einträge, dieselben Felder plus `code` (das ETL schreibt
   *  „die Zeilen-Metadaten" jedes Level-Artefakts unter dem Namen der
   *  jeweiligen Ebene — `gemeinden` bei `level: 'gemeinde'`, `kantone` bei
   *  `level: 'kantone'`). `data/boundaries.ts` (`joinCantonGeometry`) und
   *  `main.ts` lesen daraus Kantonsname und -kürzel für Hover, Titel und den
   *  Artefakt-Dateipräfix eines betretenen Kantons. */
  kantone?: {
    bfsNr: number
    code: string
    name: string
    ambiguousCells: number
    einwohnerzahl?: number
  }[]
}

export interface LevelArrays {
  positions: Float32Array
  values: Float32Array
  noga: Uint8Array
  flags: Uint8Array
  dist?: Float32Array
  mixGroup?: Uint8Array
  mixValue?: Uint16Array
  gemeindeIdx?: Uint16Array
}

export interface Level {
  meta: LevelMeta
  arrays: LevelArrays
}

const CONSTRUCTORS = {
  Float32: Float32Array,
  Uint16: Uint16Array,
  Uint8: Uint8Array,
} as const

const REQUIRED = ['positions', 'values', 'noga', 'flags'] as const

// Erwartete Länge je Array als Vielfaches von `meta.count` (und bei `dist`
// zusätzlich der Anzahl Branchengruppen). Ohne diese Prüfung würde ein zu
// kurzes `values`-Array (z. B. durch einen Schreibfehler in `binpack.py`)
// deck.gl klaglos ein Buffer übergeben, das `many.ts` über sein Ende hinaus
// liest — siehe Abschluss-Review, Finding I8.
const EXPECTED_LENGTH: Record<string, (meta: LevelMeta) => number> = {
  positions: (meta) => meta.count * 2,
  values: (meta) => meta.count,
  noga: (meta) => meta.count,
  flags: (meta) => meta.count,
  gemeindeIdx: (meta) => meta.count,
  mixGroup: (meta) => meta.count * 3,
  mixValue: (meta) => meta.count * 3,
  dist: (meta) => meta.count * meta.nogaGroups.length,
}

function view(buffer: ArrayBuffer, name: string, spec: ArraySpec) {
  const Ctor = CONSTRUCTORS[spec.type]
  const end = spec.byteOffset + spec.length * Ctor.BYTES_PER_ELEMENT
  if (end > buffer.byteLength) {
    throw new Error(
      `Array "${name}" reicht bis Byte ${end}, die Datei hat nur ${buffer.byteLength}.`,
    )
  }
  return new Ctor(buffer, spec.byteOffset, spec.length)
}

/** Liest die deklarierten Arrays als Views direkt in `buffer` — ohne Kopie, das
 *  hält eine 17'940-Zellen-Ebene günstig. */
export function decodeLevel(buffer: ArrayBuffer, meta: LevelMeta): Level {
  for (const name of REQUIRED) {
    if (!meta.arrays[name]) {
      throw new Error(`Pflichtarray "${name}" fehlt in den Metadaten von ${meta.level}.`)
    }
  }

  const decoded: Record<string, unknown> = {}
  for (const [name, spec] of Object.entries(meta.arrays)) {
    if (!spec) continue
    const array = view(buffer, name, spec)
    const expected = EXPECTED_LENGTH[name]?.(meta)
    if (expected !== undefined && array.length !== expected) {
      throw new Error(
        `Array "${name}" hat ${array.length} Elemente, erwartet ${expected} ` +
          `(aus count=${meta.count} von ${meta.level}).`,
      )
    }
    decoded[name] = array
  }
  return { meta, arrays: decoded as unknown as LevelArrays }
}

export interface Meta {
  canton: { code: string; bfs_nr: number; name: string }
  year: number
  levels: string[]
}

/** Wird von jedem Kantonswechsel automatisch mitgeschrieben (siehe
 *  `zeigmers-etl statent`/`all`) und hier als erstes gelesen: der
 *  Artefakt-Dateipräfix (`meta.canton.code`) und der Kantonsname für Titel
 *  und Panel kommen ausschliesslich von hier, nicht aus einer hartcodierten
 *  Konstante im Frontend. */
export async function loadMeta(base = '/data'): Promise<Meta> {
  const response = await fetch(`${base}/meta.json`)
  if (!response.ok) throw new Error(`meta.json: HTTP ${response.status}`)
  return (await response.json()) as Meta
}

export async function loadLevel(name: string, base = '/data'): Promise<Level> {
  const [metaResponse, binResponse] = await Promise.all([
    fetch(`${base}/${name}.json`),
    fetch(`${base}/${name}.bin`),
  ])
  if (!metaResponse.ok) throw new Error(`${name}.json: HTTP ${metaResponse.status}`)
  if (!binResponse.ok) throw new Error(`${name}.bin: HTTP ${binResponse.status}`)

  const meta = (await metaResponse.json()) as LevelMeta
  return decodeLevel(await binResponse.arrayBuffer(), meta)
}
