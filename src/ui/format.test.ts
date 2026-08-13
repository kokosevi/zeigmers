import { describe, expect, it } from 'vitest'
import { formatNumber, formatRevenue } from './format'

describe('formatNumber', () => {
  it('uses a thousands separator', () => {
    expect(formatNumber(371002)).toMatch(/371.001?002|371’002|371'002/)
  })

  it('rounds to whole numbers', () => {
    expect(formatNumber(4.6)).not.toContain('.')
  })

  it('handles zero', () => {
    expect(formatNumber(0)).toBe('0')
  })
})

describe('formatRevenue', () => {
  it('renders billions compactly', () => {
    expect(formatRevenue(1_250_000_000, 'CHF')).toMatch(/1[.,]25\s*Mrd/)
    expect(formatRevenue(1_250_000_000, 'CHF')).toContain('CHF')
  })

  it('renders millions compactly', () => {
    expect(formatRevenue(4_300_000, 'EUR')).toMatch(/4[.,]3\s*Mio/)
  })

  it('falls back to a plain number below a million', () => {
    expect(formatRevenue(820_000, 'CHF')).toMatch(/820/)
  })
})
