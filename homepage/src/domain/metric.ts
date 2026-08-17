import { formatNumber, formatProfit, formatRevenue } from '../ui/format'
import type { Company } from '../layers/visible'

/** Die drei Grössen, die die Säulenhöhe tragen kann. Eine Karte, drei
 *  Aussagen — dieselben Firmen, verschiedene Ordnung. */
export type Metric = 'umsatz' | 'mitarbeitende' | 'gewinn'

export const METRICS: readonly Metric[] = ['umsatz', 'mitarbeitende', 'gewinn']

const LABEL: Record<Metric, string> = {
  umsatz: 'Jahresumsatz',
  mitarbeitende: 'Mitarbeitende',
  gewinn: 'Reingewinn',
}

/** Der Wert, aus dem die Höhe entsteht — `null`, wenn die Karte für diese
 *  Firma in dieser Kennzahl nichts zu behaupten hat.
 *
 *  Für Geldgrössen ausschliesslich der in CHF umgerechnete Betrag. Kein
 *  Rückfall auf `revenue`/`profit` in Berichtswährung: `heightValue()` liess
 *  das zu, solange gar keine Kurse vorlagen — bei drei Währungen im Datensatz
 *  wäre derselbe Rückfall ein Höhenvergleich zwischen CHF, EUR und USD.
 *
 *  `placeholder` schlägt den Umsatzwert: eine Zeile mit ausgewiesenen 0 CHF
 *  trägt keine Höhenaussage (ETL-Invariante, siehe `companies.py`,
 *  `"placeholder"`). Bei den Mitarbeitenden gilt das Gegenteil — 0 ist dort
 *  eine gemeldete Zahl (sechs Beteiligungsgesellschaften ohne eigenes
 *  Personal), keine fehlende. */
export function metricValue(company: Company, metric: Metric): number | null {
  switch (metric) {
    case 'umsatz':
      return company.placeholder ? null : company.revenueChf
    case 'gewinn':
      return company.profitChf
    case 'mitarbeitende':
      return company.employees
  }
}

export function metricLabel(metric: Metric): string {
  return LABEL[metric]
}

/** Nur der Gewinn kann negativ sein — 41 der 201 Gesellschaften weisen einen
 *  Verlust aus. Höhe und Farbe müssen das wissen, bevor sie rechnen. */
export function metricAllowsNegative(metric: Metric): boolean {
  return metric === 'gewinn'
}

export function formatMetric(value: number, metric: Metric): string {
  if (metric === 'mitarbeitende') return formatNumber(value)
  if (metric === 'gewinn') return formatProfit(value, 'CHF')
  return formatRevenue(value, 'CHF')
}
