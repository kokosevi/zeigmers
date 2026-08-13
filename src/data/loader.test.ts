import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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
    gemeinden: [
      { bfsNr: 4001, name: 'Aarau', ambiguousCells: 1 },
      { bfsNr: 4002, name: 'Baden', ambiguousCells: 0 },
    ],
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

  it('throws when a decoded array length disagrees with meta.count, even inside the buffer', () => {
    // Ein zu kurzes Array kann innerhalb der Pufferbytes liegen (der Puffer
    // hat schlicht noch andere Arrays danach) — die reine Bytegrenzen-Prüfung
    // in `view()` würde das nicht bemerken. Das ist genau der Fall, den ein
    // Schreibfehler in binpack.py erzeugen würde: `count` stimmt, aber ein
    // einzelnes Array ist zu kurz.
    const { buffer, meta } = fixture()
    meta.count = 3 // positions bleibt bei deklarierter Länge 4 -> erwartet wären 6
    expect(() => decodeLevel(buffer, meta)).toThrow(/positions/)
  })
})

// Testet den Schreiber (binpack.py, Python) gegen den Leser (decodeLevel,
// TypeScript) am tatsächlich committeten Artefakt — nicht nur den Leser gegen
// eine handkodierte Fixture. Eine Änderung an `_ORDER`, einem dtype oder der
// Padding-Regel in binpack.py, die still ein falsches Array produziert, fiele
// hier auf (siehe Abschluss-Review, Finding I8).
//
// Zeigt seit 2026-08-13 auf `ag_gemeinde` statt `ag_hektar`: die Hektarstufe
// wird nicht mehr ausgeliefert (siehe README), `ag_gemeinde` ist jetzt das
// einzige committete Ansicht-B-Artefakt und übernimmt denselben Vertragstest.
// Die Prüfung bleibt inhaltlich dieselbe (Array-Längen aus `count` und
// `nogaGroups` hergeleitet, Min/Max/Summe gegen `meta.stats`); nur `dist`
// (volle Verteilung, nur Gemeinde-/Kantonsstufe) ersetzt die hektarspezifischen
// `mixGroup`/`mixValue` (Top-3, nur Hektarstufe).
describe('decodeLevel against the real ag_gemeinde artifact', () => {
  const dataDir = fileURLToPath(new URL('../../public/data/', import.meta.url))

  it('round-trips the on-disk artifact with lengths and stats matching meta', () => {
    const meta = JSON.parse(
      readFileSync(`${dataDir}ag_gemeinde.json`, 'utf-8'),
    ) as LevelMeta
    const buffer = readFileSync(`${dataDir}ag_gemeinde.bin`).buffer as ArrayBuffer

    const { arrays } = decodeLevel(buffer, meta)

    expect(arrays.values.length).toBe(meta.count)
    expect(arrays.positions.length).toBe(2 * meta.count)
    expect(arrays.gemeindeIdx?.length).toBe(meta.count)
    expect(arrays.dist?.length).toBe(meta.count * meta.nogaGroups.length)

    let min = Infinity
    let max = -Infinity
    let sum = 0
    for (const v of arrays.values) {
      min = Math.min(min, v)
      max = Math.max(max, v)
      sum += v
    }
    expect(min).toBe(meta.stats.min)
    expect(max).toBe(meta.stats.max)
    expect(sum).toBeCloseTo(meta.stats.sum, 3)
  })
})
