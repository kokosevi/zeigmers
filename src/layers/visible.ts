import { ColumnLayer, ScatterplotLayer } from '@deck.gl/layers'
import { NOGA_GROUPS, UNKNOWN_COLOR } from '../domain/noga.generated'
import { computeElevations, type ScaleMode } from '../domain/scale'
import { CANTON_ELEVATION_M } from './cantons'
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
  // `null`: der Titel liess sich keiner eindeutigen Zefix-Rechtseinheit
  // zuordnen (siehe `etl/src/draufsicht_etl/companies.py`,
  // `match_company_seat`) — Name, ISIN und SIX-Symbol kommen trotzdem direkt
  // von SIX, nur die Zefix-UID fehlt.
  uid: string | null
  name: string
  sixSymbol: string | null
  lon: number
  lat: number
  nogaGroupIndex: number
  revenue: number | null
  /** Derselbe Umsatz zum SNB-Jahresmittelkurs des Geschäftsjahres in CHF —
   *  die Grösse, aus der die Säulenhöhe entsteht. `revenue`/`currency`
   *  bleiben daneben die berichteten Werte fürs Panel: umgerechnet lässt
   *  sich vergleichen, im Original lässt sich nachprüfen. `null`, solange
   *  keine Kurse vorliegen (siehe `etl/src/draufsicht_etl/fx.py`). */
  revenueChf: number | null
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
  // Phase 3: unterscheidet "recherchiert, aber keine Zahl öffentlich"
  // (`placeholder=true`, `researched=true` — bekommt weiterhin eine Säule
  // auf Mindesthöhe) von "noch nicht recherchiert" (`researched=false` —
  // bekommt gar keine Säule, sondern einen flachen, neutralen Marker, siehe
  // `buildUnresearchedCompanyLayer`). Dieselbe Unterscheidung wie in
  // `etl/src/draufsicht_etl/companies.py`s Moduldokumentation.
  researched: boolean
  city: string | null
}

export interface CompanyData {
  companies: Company[]
  stats: {
    count: number
    withRevenue: number
    /** Höchster Wert derselben Grösse, aus der die Höhen entstehen — in CHF,
     *  sobald `revenueInChf` gilt, sonst in Berichtswährung. Maximum und
     *  Einzelhöhen müssen aus derselben Grösse stammen, sonst normiert die
     *  Ansicht gegen einen Massstab, der nicht zu ihr gehört. */
    max: number
    /** `true`, sobald JEDE Säule aus einem umgerechneten Betrag entsteht.
     *  Bleibt eine einzige Umrechnung offen, fällt die ganze Ansicht auf die
     *  Berichtswährungen zurück — halb umgerechnet stünden zwei Massstäbe
     *  nebeneinander, ohne dass man es sieht. */
    revenueInChf: boolean
    /** Anzahl Zeilen mit `researched=yes` — der Zähler der Abdeckungsangabe
     *  ("8 von 224 kotierten Gesellschaften recherchiert"). */
    researched: number
    /** Nenner derselben Angabe: live von SIX abgefragte Gesamtzahl kotierter
     *  Titel (`companies.fetch_six_titles()`), nicht die Zeilenzahl der CSV —
     *  siehe `companies.py`-Moduldokumentation. */
    totalListed: number
    /** Abrufdatum der SIX-Titelliste (ISO, z.B. "2026-08-14") — `null` nur
     *  in Tests/Fixtures ohne `six_meta`. */
    sixRetrievedDate: string | null
  }
}

/** Nur die recherchierten Firmen tragen eine Säule — `researched=false`
 *  bekommt einen flachen Marker (`buildUnresearchedCompanyLayer`), keine
 *  Höhenaussage, die es nicht einlösen könnte. */
function researchedCompanies(data: CompanyData): Company[] {
  return data.companies.filter((c) => c.researched)
}

/** Die Grösse, aus der die Höhe entsteht: der in CHF umgerechnete Umsatz,
 *  wo er vorliegt, sonst der berichtete. Nestlé berichtet in CHF, Novartis in
 *  USD, Richemont in EUR — ohne Umrechnung vergliche die Höhe Beträge, die
 *  nicht dasselbe messen (ein USD-Betrag als CHF gezeichnet überzeichnet die
 *  Firma 2025 um rund ein Fünftel). Der Rückfall auf `revenue` gilt nur,
 *  solange gar keine Kurse vorliegen; das ETL sorgt dafür, dass nie ein Teil
 *  der Firmen umgerechnet ist und ein anderer nicht (`stats.revenueInChf`). */
export function heightValue(company: Company): number | null {
  return company.revenueChf ?? company.revenue
}

export function companyElevations(
  companies: Company[],
  vmax: number,
  maxHeight: number,
  mode: ScaleMode,
): Float32Array {
  const values = new Float32Array(companies.map((c) => heightValue(c) ?? 0))
  const heights = computeElevations(values, vmax, maxHeight, mode)

  let smallest = Infinity
  for (let i = 0; i < heights.length; i++) {
    if (heightValue(companies[i]!) !== null) smallest = Math.min(smallest, heights[i]!)
  }
  const placeholder = Number.isFinite(smallest)
    ? smallest * UNKNOWN_BAR_FRACTION
    : PLACEHOLDER_BASE_HEIGHT

  for (let i = 0; i < heights.length; i++) {
    if (heightValue(companies[i]!) === null) heights[i] = placeholder
  }
  return heights
}

export function buildCompanyLayer(
  data: CompanyData,
  mode: ScaleMode,
  onClick: (company: Company) => void,
): ColumnLayer<Company> {
  const bars = researchedCompanies(data)
  const heights = companyElevations(bars, data.stats.max, 12000, mode)

  return new ColumnLayer<Company>({
    id: 'firmen',
    data: bars,
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

// Klein, neutral, flach — bewusst kein Bezug zu irgendeiner Höhe oder
// Branchenfarbe: eine unrecherchierte Firma zeigt nur, DASS sie kotiert ist
// und WO ihr Sitz liegt, nicht WIE gross sie ist (das wüssten wir nicht,
// ohne es zu behaupten). Ein einzelner grauer Ton für alle ~216 Titel, klar
// unterscheidbar von den Branchenfarben der acht recherchierten Balken.
export const UNRESEARCHED_MARKER_RADIUS_M = 350

// Sichtbarkeitsschranken in Bildpunkten, unabhängig vom Zoom — siehe
// `buildUnresearchedCompanyLayer`.
export const UNRESEARCHED_MARKER_MIN_PX = 4
export const UNRESEARCHED_MARKER_MAX_PX = 10
export const UNRESEARCHED_MARKER_COLOR: readonly [number, number, number, number] =
  [130, 130, 130, 190]

/** Zweite, unabhängige Layer für Firmen ohne Recherche (`researched=false`)
 *  — ein `ScatterplotLayer` statt der `ColumnLayer` von `buildCompanyLayer`,
 *  weil hier keine Höhe zu zeichnen ist. Getrennte Layer statt eines Sonder-
 *  falls in `buildCompanyLayer`: unterschiedliche deck.gl-Layertypen lassen
 *  sich nicht in einer Instanz mischen, und die visuelle Trennung (Balken =
 *  Inhalt, Marker = Kontext) ist genau die Aussage, die dieser zweite Layer
 *  treffen soll. */
export function buildUnresearchedCompanyLayer(
  data: CompanyData,
  onClick: (company: Company) => void,
  onHover: (company: Company | null, x: number, y: number) => void,
): ScatterplotLayer<Company> {
  const markers = data.companies.filter((c) => !c.researched)
  return new ScatterplotLayer<Company>({
    id: 'firmen-unerforscht',
    data: markers,
    pickable: true,
    stroked: false,
    // Auf der OBERSEITE der Kantonsplatte, nicht auf Höhe null. Die Platte
    // ist auf `CANTON_ELEVATION_M` extrudiert; ein flacher Marker bei z=0
    // liegt darunter und ist unsichtbar. Die Säulen fiel das nicht auf —
    // sie ragen mit tausenden Metern hindurch —, die 189 Marker dagegen
    // waren vollständig begraben, und die Karte sah aus, als gäbe es nur
    // die acht Aargauer Firmen.
    getPosition: (c) => [c.lon, c.lat, CANTON_ELEVATION_M],
    getRadius: UNRESEARCHED_MARKER_RADIUS_M,
    radiusUnits: 'meters',
    // Ohne diese Schranken schrumpft ein in Metern angegebener Marker beim
    // Herauszoomen mit der Karte: auf der Schweiz-Ansicht wurden aus 350 m
    // Radius rund zwei Bildpunkte — die 189 Marker waren gezeichnet, aber
    // nicht zu sehen, und die Karte wirkte, als gäbe es nur die acht
    // Aargauer Säulen. Die Obergrenze verhindert das Gegenteil: beim
    // Hineinzoomen auf eine Stadt sollen die Punkte nicht zu Flecken
    // wachsen, die die Säulen daneben verdecken.
    radiusMinPixels: UNRESEARCHED_MARKER_MIN_PX,
    radiusMaxPixels: UNRESEARCHED_MARKER_MAX_PX,
    getFillColor: UNRESEARCHED_MARKER_COLOR,
    onClick: (info) => {
      if (info.object) onClick(info.object)
    },
    onHover: (info) => onHover(info.object ?? null, info.x, info.y),
  })
}

export async function loadCompanies(base = '/data'): Promise<CompanyData> {
  const response = await fetch(`${base}/companies.json`)
  if (!response.ok) throw new Error(`companies.json: HTTP ${response.status}`)
  return (await response.json()) as CompanyData
}
