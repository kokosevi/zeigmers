import { ColumnLayer } from '@deck.gl/layers'
import { NOGA_GROUPS, UNKNOWN_COLOR } from '../domain/noga.generated'
import { computeElevations, type ScaleMode } from '../domain/scale'

/** Firmen ohne auffindbaren Umsatz erscheinen als Hinweis-Balken auf 40 % der
 *  Höhe des kleinsten echten Balkens — sichtbar, aber unverwechselbar klein. */
export const UNKNOWN_BAR_FRACTION = 0.4

// Absoluter Fallback für den Fall, dass keine Firma im Datensatz einen Umsatz
// hat — dann gibt es keinen "kleinsten echten Balken", von dem sich ein Anteil
// ableiten liesse. Anders als UNKNOWN_BAR_FRACTION ist dies bewusst kein
// Bruchteil, sondern eine feste Höhe in Metern.
const PLACEHOLDER_BASE_HEIGHT = 200

// Exportiert, damit die Legende (`ui/legend.ts`) denselben Wert für ihren
// Muster-Swatch verwendet statt eine zweite, potenziell abweichende Zahl zu
// pflegen (siehe Abschluss-Review, Finding I2).
export const OUTLINE_COLOR: readonly [number, number, number, number] = [30, 30, 30, 220]

export type RevenueType = 'net_sales' | 'operating_income'

export interface Company {
  uid: string
  name: string
  sixSymbol: string | null
  lon: number
  lat: number
  nogaGroupIndex: number
  revenue: number | null
  currency: string | null
  revenueType: RevenueType | null
  employees: number | null
  fiscalYear: number | null
  reportUrl: string | null
  note: string | null
  placeholder: boolean
  city: string | null
}

export interface CompanyData {
  canton: string
  companies: Company[]
  stats: { count: number; withRevenue: number; max: number }
}

export function companyElevations(
  data: CompanyData,
  maxHeight: number,
  mode: ScaleMode,
): Float32Array {
  const values = new Float32Array(data.companies.map((c) => c.revenue ?? 0))
  const heights = computeElevations(values, data.stats.max, maxHeight, mode)

  let smallest = Infinity
  for (let i = 0; i < heights.length; i++) {
    if (data.companies[i]!.revenue !== null) smallest = Math.min(smallest, heights[i]!)
  }
  const placeholder = Number.isFinite(smallest)
    ? smallest * UNKNOWN_BAR_FRACTION
    : PLACEHOLDER_BASE_HEIGHT

  for (let i = 0; i < heights.length; i++) {
    if (data.companies[i]!.revenue === null) heights[i] = placeholder
  }
  return heights
}

export function buildCompanyLayer(
  data: CompanyData,
  mode: ScaleMode,
  onClick: (company: Company) => void,
): ColumnLayer<Company> {
  const heights = companyElevations(data, 12000, mode)

  return new ColumnLayer<Company>({
    id: 'firmen',
    data: data.companies,
    // Firmen mit abweichender Kennzahl (Banken weisen Geschaeftsertrag statt
    // Nettoumsatz aus) bekommen einen sichtbaren Rand. Ohne diese Markierung
    // vergleicht der Betrachter Balkenhoehen, die Verschiedenes messen.
    stroked: true,
    getLineColor: (c) => (c.revenueType === 'net_sales' ? [0, 0, 0, 0] : OUTLINE_COLOR),
    getLineWidth: (c) => (c.revenueType === 'net_sales' ? 0 : 60),
    lineWidthUnits: 'meters',
    diskResolution: 16,
    radius: 900,
    radiusUnits: 'meters',
    extruded: true,
    material: false,
    pickable: true,
    getPosition: (c) => [c.lon, c.lat],
    getElevation: (_c, { index }) => heights[index]!,
    getFillColor: (c) =>
      c.placeholder
        ? [...UNKNOWN_COLOR, 180]
        : [...(NOGA_GROUPS[c.nogaGroupIndex]?.color ?? UNKNOWN_COLOR), 235],
    updateTriggers: { getElevation: [mode], getFillColor: [] },
    onClick: (info) => {
      if (info.object) onClick(info.object)
    },
  })
}

export async function loadCompanies(base = '/data'): Promise<CompanyData> {
  const response = await fetch(`${base}/companies.json`)
  if (!response.ok) throw new Error(`companies.json: HTTP ${response.status}`)
  return (await response.json()) as CompanyData
}
