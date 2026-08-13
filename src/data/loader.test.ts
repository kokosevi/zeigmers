import { describe, expect, it } from 'vitest'
import { decodeLevel, type LevelMeta } from './loader'

function fixture() {
  // 2 Zeilen: positions (4 f32) | values (2 f32) | gemeindeIdx (2 u16) | noga (2 u8) | flags (2 u8)
  const buffer = new ArrayBuffer(16 + 8 + 4 + 2 + 2)
  new Float32Array(buffer, 0, 4).set([8.0, 47.4, 8.1, 47.5])
  new Float32Array(buffer, 16, 2).set([4, 250])
  new Uint16Array(buffer, 24, 2).set([0, 1])
  new Uint8Array(buffer, 28, 2).set([1, 255])
  new Uint8Array(buffer, 30, 2).set([1, 0])

  const meta: LevelMeta = {
    level: 'hektar', year: 2023, canton: 'AG', count: 2,
    arrays: {
      positions: { byteOffset: 0, length: 4, type: 'Float32' },
      values: { byteOffset: 16, length: 2, type: 'Float32' },
      gemeindeIdx: { byteOffset: 24, length: 2, type: 'Uint16' },
      noga: { byteOffset: 28, length: 2, type: 'Uint8' },
      flags: { byteOffset: 30, length: 2, type: 'Uint8' },
    },
    nogaGroups: [{ key: 'a', label: 'A', color: '#000000' }],
    unknownColor: '#BFBFBF', unknownIndex: 255,
    stats: { min: 4, max: 250, sum: 254, p99: 250, ambiguousCells: 1, overstatementMax: 3 },
    gemeinden: [{ bfsNr: 4001, name: 'Aarau' }, { bfsNr: 4002, name: 'Baden' }],
  }
  return { buffer, meta }
}

describe('decodeLevel', () => {
  it('decodes every declared array with the right type', () => {
    // Ein einziger Fixture-Aufruf: buffer und meta müssen zusammengehören, sonst
    // testet man zwei unabhängige (nur zufällig gleich aufgebaute) Instanzen.
    const { buffer, meta } = fixture()
    const { arrays } = decodeLevel(buffer, meta)
    expect(arrays.positions).toBeInstanceOf(Float32Array)
    expect(arrays.values).toBeInstanceOf(Float32Array)
    expect(arrays.gemeindeIdx).toBeInstanceOf(Uint16Array)
    expect(arrays.noga).toBeInstanceOf(Uint8Array)
    expect([...arrays.values]).toEqual([4, 250])
  })

  it('keeps positions interleaved as lon,lat pairs', () => {
    const { buffer, meta } = fixture()
    const { arrays } = decodeLevel(buffer, meta)
    expect(arrays.positions[0]).toBeCloseTo(8.0, 5)
    expect(arrays.positions[1]).toBeCloseTo(47.4, 5)
    expect(arrays.positions.length).toBe(2 * meta.count)
  })

  it('does not copy the underlying buffer', () => {
    const { buffer, meta } = fixture()
    const { arrays } = decodeLevel(buffer, meta)
    expect(arrays.values.buffer).toBe(buffer)
  })

  it('throws a named error when a required array is missing', () => {
    const { buffer, meta } = fixture()
    delete (meta.arrays as Record<string, unknown>).values
    expect(() => decodeLevel(buffer, meta)).toThrow(/values/)
  })

  it('throws when an array runs past the end of the buffer', () => {
    const { buffer, meta } = fixture()
    meta.arrays.values!.length = 99
    expect(() => decodeLevel(buffer, meta)).toThrow(/values/)
  })
})
