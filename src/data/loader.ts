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
  gemeinden?: { bfsNr: number; name: string }[]
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
    if (spec) decoded[name] = view(buffer, name, spec)
  }
  return { meta, arrays: decoded as unknown as LevelArrays }
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
