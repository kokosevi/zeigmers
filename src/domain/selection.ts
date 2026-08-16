import { metricValue, type Metric } from './metric'
import type { Company } from '../layers/visible'

/** Der Zustand der Firmenseite, in drei Dimensionen, die nichts voneinander
 *  wissen: eine Kennzahl auf der Höhenachse, eine Teilmenge Branchen, eine
 *  Teilmenge Organisationsformen. */
export interface Selection {
  metric: Metric
  branches: ReadonlySet<number>
  orgForms: ReadonlySet<string>
}

export interface SelectionResult {
  /** Gefiltert, aber noch nicht bewertet — auch Firmen ohne Wert in dieser
   *  Kennzahl stehen hier: sie bekommen eine Platzhaltersäule, keine keine. */
  visible: Company[]
  withValue: Company[]
  /** Maximum der BETRÄGE über `withValue`. 0, wenn nichts vorliegt. */
  vmax: number
  sum: number
  losses: number
  missing: number
  top: Company | null
}

export function applySelection(companies: Company[], selection: Selection): SelectionResult {
  const visible = companies.filter(
    (c) =>
      c.researched &&
      selection.branches.has(c.nogaGroupIndex) &&
      c.orgForm !== null &&
      selection.orgForms.has(c.orgForm),
  )

  const withValue: Company[] = []
  let vmax = 0
  let sum = 0
  let losses = 0
  let top: Company | null = null

  for (const company of visible) {
    const value = metricValue(company, selection.metric)
    if (value === null) continue
    withValue.push(company)
    sum += value
    if (value < 0) losses++
    if (Math.abs(value) > vmax) {
      vmax = Math.abs(value)
      top = company
    }
  }

  return { visible, withValue, vmax, sum, losses, missing: visible.length - withValue.length, top }
}

/** Anzahl und Summe je Branchengruppe — die Zahlen, die die Legende neben
 *  ihre Farbtupfer schreibt. Über `withValue`, nicht über `visible`: eine
 *  Firma ohne Wert zählt in der Anzahl der Auswahl mit, aber nicht in einer
 *  Summe, zu der sie nichts beiträgt. */
export function branchTotals(
  result: SelectionResult,
  metric: Metric,
): Map<number, { count: number; sum: number }> {
  const totals = new Map<number, { count: number; sum: number }>()
  for (const company of result.withValue) {
    const value = metricValue(company, metric)
    if (value === null) continue
    const entry = totals.get(company.nogaGroupIndex) ?? { count: 0, sum: 0 }
    entry.count++
    entry.sum += value
    totals.set(company.nogaGroupIndex, entry)
  }
  return totals
}
