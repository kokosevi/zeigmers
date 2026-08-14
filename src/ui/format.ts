const NUMBER = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 })
const COMPACT = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 })
// Zwei Nachkommastellen fix (nicht "maximum"): die Beschäftigte-je-Einwohner-
// Kennzahl bewegt sich zwischen 0,14 und 1,62 (siehe `ui/panel.ts`) — bei
// variabler Nachkommastellenzahl läse sich "0,1" neben "1,62" wie eine
// andere Genauigkeit, obwohl beide aus derselben Rechnung kommen.
const RATIO = new Intl.NumberFormat('de-CH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatNumber(value: number): string {
  return NUMBER.format(Math.round(value))
}

export function formatRevenue(value: number, currency: string | null): string {
  const unit = currency ?? ''
  if (value >= 1e9) return `${COMPACT.format(value / 1e9)} Mrd. ${unit}`.trim()
  if (value >= 1e6) return `${COMPACT.format(value / 1e6)} Mio. ${unit}`.trim()
  return `${NUMBER.format(value)} ${unit}`.trim()
}

export function formatRatio(value: number): string {
  return RATIO.format(value)
}

// Ein Verlust ist ein legitimer Wert (siehe `ui/panel.ts`, `companyContent`),
// aber ein Minuszeichen vor einer grossen Zahl übersieht man leicht — «Verlust»
// als Wort davor lässt sich nicht überlesen.
export function formatProfit(value: number, currency: string | null): string {
  return value < 0 ? `Verlust ${formatRevenue(-value, currency)}` : formatRevenue(value, currency)
}
