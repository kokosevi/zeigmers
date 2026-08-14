import { ColumnLayer } from '@deck.gl/layers'
import { NOGA_GROUPS, UNKNOWN_COLOR } from '../domain/noga.generated'
import { computeElevations, type ScaleMode } from '../domain/scale'
import { MAP_MATERIAL } from './material'

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

// Geschlossenes Set wie `RevenueType`, siehe `etl/src/draufsicht_etl/companies.py`,
// `CONSOLIDATION_BASES`: hält fest, ob Umsatz und Reingewinn derselben Zeile den
// Gesamtkonzern (inkl. zur Veräusserung klassierter/verkaufter Sparten) oder nur die
// fortgeführten Geschäfte abbilden. `validate()` erzwingt das Feld dort, sobald `profit`
// gesetzt ist — anders als `revenueType` betrifft das potenziell jede Firma, nicht nur
// Banken, deshalb kein eigener "unbekannt"-Fall hier nötig.
export type ConsolidationBasis = 'total_group' | 'continuing_operations'

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
  profit: number | null
  profitCurrency: string | null
  consolidationBasis: ConsolidationBasis | null
  coreProducts: string | null
  productsUrl: string | null
  foundingYear: number | null
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
    //
    // `consolidationBasis` (Gesamtkonzern vs. fortgeführte Geschäfte, siehe
    // `ConsolidationBasis` oben) bekommt bewusst KEINEN eigenen Balkenrand,
    // obwohl DSM-Firmenich als einzige der acht Firmen `continuing_operations`
    // trägt und mit Abstand den höchsten Balken stellt. Grund: die Karte hat
    // hier schon eine Randmarkierung mit einer anderen Bedeutung
    // (`revenueType`); ein zweiter Rand für eine zweite Unterscheidung liesse
    // sich auf demselben Balken nicht mehr eindeutig lesen (welcher Rand
    // meint was?), und würde den bestehenden entweder verdecken oder
    // verwässern — genau das Risiko, vor dem die Aufgabenstellung warnt.
    // Anders als `revenueType` (Messgrösse: Umsatz vs. Geschäftsertrag) ändert
    // `consolidationBasis` nicht, WAS gemessen wird, sondern nur den
    // Unternehmensumfang (inkl./exkl. einer zur Veräusserung klassierten
    // Sparte) — dieselbe Art Unterscheidung wie die Währungsvermischung
    // (CHF/EUR/USD), die diese App ebenfalls nicht über einen Balken-Marker,
    // sondern über Text löst (Pflichthinweis + Legende, `ui/notices.ts`). Mit
    // nur einer betroffenen Firma von acht ist ein dritter visueller Kanal
    // hier eher Rauschen als Signal; das Klick-Panel (`ui/panel.ts`,
    // `companyContent`) benennt die Basis stattdessen in Klartext.
    stroked: true,
    getLineColor: (c) => (c.revenueType === 'net_sales' ? [0, 0, 0, 0] : OUTLINE_COLOR),
    getLineWidth: (c) => (c.revenueType === 'net_sales' ? 0 : 60),
    lineWidthUnits: 'meters',
    diskResolution: 16,
    radius: 900,
    radiusUnits: 'meters',
    extruded: true,
    // Redesign (2026-08-14): dasselbe Material wie die Kantons-/Gemeinde-
    // flächen (`layers/material.ts`), damit beide Ansichten unter demselben
    // Licht (`layers/lighting.ts`) konsistent wirken, statt Ansicht A flach
    // schattiert gegen ein beleuchtetes Ansicht B zu stellen. Nur acht Säulen
    // — der Mehraufwand ist irrelevant.
    material: MAP_MATERIAL,
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
