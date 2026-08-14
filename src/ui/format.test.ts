import { describe, expect, it } from 'vitest'
import { formatNumber, formatRatio, formatRevenue } from './format'

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

describe('formatRatio', () => {
  it('always shows exactly two decimal digits', () => {
    expect(formatRatio(0.1431)).toMatch(/^0[.,]14$/)
    expect(formatRatio(1.6150)).toMatch(/^1[.,]6[12]$/) // 1.615 rounds to 1.61 or 1.62 depending on banker's rounding
  })

  it('pads a whole number with trailing zeros', () => {
    expect(formatRatio(2)).toMatch(/^2[.,]00$/)
  })

  it('handles zero', () => {
    expect(formatRatio(0)).toMatch(/^0[.,]00$/)
  })
})
