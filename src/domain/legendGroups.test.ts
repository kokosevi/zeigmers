import { describe, expect, it } from 'vitest'
import { presentGroupsFromIndices } from './legendGroups'
import { NOGA_UNKNOWN_INDEX } from './noga.generated'

describe('presentGroupsFromIndices', () => {
  it('returns the distinct, sorted indices that actually occur', () => {
    const result = presentGroupsFromIndices(new Uint8Array([9, 1, 1, 0, 9, 3]))
    expect(result.indices).toEqual([0, 1, 3, 9])
    expect(result.hasUnknown).toBe(false)
  })

  it('flags hasUnknown without adding NOGA_UNKNOWN_INDEX to indices', () => {
    const result = presentGroupsFromIndices(new Uint8Array([1, NOGA_UNKNOWN_INDEX, 2]))
    expect(result.indices).toEqual([1, 2])
    expect(result.hasUnknown).toBe(true)
  })

  it('reports hasUnknown false when no unknown row occurs (Ansicht A, aktueller Datenstand)', () => {
    const result = presentGroupsFromIndices(new Uint8Array([0, 1, 2, 3, 4, 8, 9]))
    expect(result.hasUnknown).toBe(false)
  })

  it('works on a plain number array (effektive Company-Indizes)', () => {
    const result = presentGroupsFromIndices([1, 1, 1, 7])
    expect(result.indices).toEqual([1, 7])
    expect(result.hasUnknown).toBe(false)
  })

  it('returns an empty result for an empty input', () => {
    const result = presentGroupsFromIndices(new Uint8Array(0))
    expect(result.indices).toEqual([])
    expect(result.hasUnknown).toBe(false)
  })
})
