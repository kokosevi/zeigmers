import { describe, expect, it } from 'vitest'
import { buildColors } from './colors'
import { NOGA_GROUPS, NOGA_UNKNOWN_INDEX, UNKNOWN_COLOR } from './noga.generated'

describe('buildColors', () => {
  it('produces four bytes per row', () => {
    const colors = buildColors(new Uint8Array([0, 1, 2]), new Uint8Array([0, 0, 0]))
    expect(colors).toHaveLength(12)
  })

  it('uses the group colour for a known index', () => {
    const colors = buildColors(new Uint8Array([1]), new Uint8Array([0]))
    expect([...colors.slice(0, 3)]).toEqual([...NOGA_GROUPS[1]!.color])
  })

  it('uses the reserved grey for the unknown index', () => {
    const colors = buildColors(new Uint8Array([NOGA_UNKNOWN_INDEX]), new Uint8Array([0]))
    expect([...colors.slice(0, 3)]).toEqual([...UNKNOWN_COLOR])
  })

  it('keeps the group colour for ambiguous rows but lowers the alpha', () => {
    const plain = buildColors(new Uint8Array([1]), new Uint8Array([0]))
    const ambiguous = buildColors(new Uint8Array([1]), new Uint8Array([1]))
    expect([...ambiguous.slice(0, 3)]).toEqual([...plain.slice(0, 3)])
    expect(ambiguous[3]!).toBeLessThan(plain[3]!)
  })

  it('falls back to grey for an out-of-range index instead of throwing', () => {
    const colors = buildColors(new Uint8Array([200]), new Uint8Array([0]))
    expect([...colors.slice(0, 3)]).toEqual([...UNKNOWN_COLOR])
  })
})
