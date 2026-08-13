const NUMBER = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 })
const COMPACT = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 })

export function formatNumber(value: number): string {
  return NUMBER.format(Math.round(value))
}

export function formatRevenue(value: number, currency: string | null): string {
  const unit = currency ?? ''
  if (value >= 1e9) return `${COMPACT.format(value / 1e9)} Mrd. ${unit}`.trim()
  if (value >= 1e6) return `${COMPACT.format(value / 1e6)} Mio. ${unit}`.trim()
  return `${NUMBER.format(value)} ${unit}`.trim()
}
