import { ColumnLayer, ScatterplotLayer } from '@deck.gl/layers'
import { metricValue, type Metric } from '../domain/metric'
import { NOGA_GROUPS, UNKNOWN_COLOR } from '../domain/noga.generated'
import { computeElevations, type ScaleMode } from '../domain/scale'
import type { SelectionResult } from '../domain/selection'
import { CANTON_ELEVATION_M } from './cantons'
import { MAP_MATERIAL } from './material'

// Exportiert, damit die Legende (`ui/legend.ts`) denselben Wert für ihren
// Muster-Swatch verwendet statt eine zweite, potenziell abweichende Zahl zu
// pflegen (siehe Abschluss-Review, Finding I2).
export const OUTLINE_COLOR: readonly [number, number, number, number] = [30, 30, 30, 220]

export type RevenueType = 'net_sales' | 'operating_income'

// Geschlossenes Set wie `RevenueType`, siehe `etl/src/zeigmers_etl/companies.py`,
// `CONSOLIDATION_BASES`: hält fest, ob Umsatz und Reingewinn derselben Zeile den
// Gesamtkonzern (inkl. zur Veräusserung klassierter/verkaufter Sparten) oder nur die
// fortgeführten Geschäfte abbilden. `validate()` erzwingt das Feld dort, sobald `profit`
// gesetzt ist — anders als `revenueType` betrifft das potenziell jede Firma, nicht nur
// Banken, deshalb kein eigener "unbekannt"-Fall hier nötig.
export type ConsolidationBasis = 'total_group' | 'continuing_operations'

export interface Company {
  // `null`: der Titel liess sich keiner eindeutigen Zefix-Rechtseinheit
  // zuordnen (siehe `etl/src/zeigmers_etl/companies.py`,
  // `match_company_seat`) — Name, ISIN und SIX-Symbol kommen trotzdem direkt
  // von SIX, nur die Zefix-UID fehlt.
  uid: string | null
  name: string
  sixSymbol: string | null
  lon: number
  lat: number
  nogaGroupIndex: number
  /** Rechtsform-Dimension der Karte, heute für alle Zeilen
   *  `'boersenkotiert'`. Die Karte filtert danach; Genossenschaften und
   *  grosse nicht kotierte Firmen kommen später als weitere Werte hinzu. */
  orgForm: string | null
  revenue: number | null
  /** Derselbe Umsatz zum SNB-Jahresmittelkurs des Geschäftsjahres in CHF —
   *  die Grösse, aus der die Säulenhöhe entsteht. `revenue`/`currency`
   *  bleiben daneben die berichteten Werte fürs Panel: umgerechnet lässt
   *  sich vergleichen, im Original lässt sich nachprüfen. `null`, solange
   *  keine Kurse vorliegen (siehe `etl/src/zeigmers_etl/fx.py`). */
  revenueChf: number | null
  currency: string | null
  revenueType: RevenueType | null
  profit: number | null
  /** Reingewinn zum SNB-Jahresmittelkurs in CHF — dieselbe Rolle wie
   *  `revenueChf` beim Umsatz, siehe `etl/…/companies.py`. `null`, solange
   *  keine Kurse vorliegen. */
  profitChf: number | null
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
  // `etl/src/zeigmers_etl/companies.py`s Moduldokumentation.
  researched: boolean
  city: string | null
  /** Versatz in Metern, wenn sich mehrere kotierte Gesellschaften eine
   *  Adresse teilen (`null` sonst). Am identischen Punkt gezeichnet
   *  verdeckt die höhere Säule die niedrigere vollständig — die kleinere
   *  Firma wäre weder zu sehen noch anzuklicken. Das Panel nennt den
   *  Versatz, damit die Position verschoben, aber nicht verschwiegen ist
   *  (siehe `etl/src/zeigmers_etl/companies.py`,
   *  `_spread_shared_positions`). */
  positionAdjusted: number | null
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
    /** `true`, sobald JEDE Säule aus einem umgerechneten Betrag entsteht,
     *  `false`, wenn mindestens eine Firma ohne Kurs blieb
     *  (`etl/src/zeigmers_etl/companies.py`, `build_artifact`).
     *
     *  Re-Review (2026-08-15): das ist ein **Meldewert**, keine Garantie —
     *  er hält fest, DASS ein Teilausfall vorliegt. Anders als die frühere
     *  `heightValue()` fällt `metricValue()` (`domain/metric.ts`) bei
     *  fehlendem Kurs NICHT auf die Berichtswährung zurück, sondern liefert
     *  `null` — eine Firma ohne Kurs bekommt eine Platzhaltersäule statt
     *  einer Höhe in falscher Währung. Kein Rückfallmechanismus mehr, den
     *  ein Teilausfall unterschiedlich behandeln könnte. */
    revenueInChf: boolean
    /** Dieselbe Meldung wie `revenueInChf`, für den Reingewinn: `true`,
     *  sobald jede Gewinnzahl umgerechnet ist. */
    profitInChf: boolean
    /** Rechtsformen, die im Datensatz tatsächlich vorkommen — heute nur
     *  `['boersenkotiert']`. Grundlage für die Filterauswahl, damit die
     *  Karte keine Rechtsform anbietet, die keine Firma trägt. */
    orgForms: string[]
    /** Anzahl Zeilen mit `researched=yes` — der Zähler in der
     *  Abdeckungsangabe (Beispiel: „201 Gesellschaften von 224 kotierten
     *  SIX-Titeln auf der Karte gezeigt, davon 201 recherchiert", siehe
     *  `karte/firmen.ts`, `coverageLabel`). */
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

/** Ein Verlust bekommt einen Ton, der weder eine Branchenfarbe ist noch der
 *  Platzhalter-Grauton («keine Zahl gefunden»). Die Branche einer
 *  Verlustfirma ist in der Gewinn-Ansicht damit nicht ablesbar — beabsichtigt:
 *  Vorzeichen schlägt Branche, wenn beide um dieselbe Fläche konkurrieren. */
export const LOSS_COLOR: readonly [number, number, number] = [176, 76, 76]

/** Höhe, auf der die Säulen ansetzen — bei jeder Kennzahl die
 *  Plattenoberkante.
 *
 *  Erste Wahl (Task 8) war eine bei Verlusten angehobene Nulllinie, von der
 *  ein Verlust nach unten hängt, mit einer eigenen Referenzfläche
 *  (`buildZeroPlaneLayer`, seither entfernt). Aufgabe 18 hat das erstmals im
 *  Browser geprüft (Kennzahl Gewinn, Screenshot, `pitch: 50`): keiner der 41
 *  Verlustsäulen war zu erkennen — eine pixelgenaue Farbsuche über den
 *  ganzen Screenshot fand nicht ein einziges Pixel in `LOSS_COLOR`. Grund:
 *  die Nulllinie hebt sich um den BETRAG des tiefsten Verlusts über die
 *  Platte, bei einem grossen Ausreisser (die Nationalbank trägt hier den
 *  grössten Ausschlag) landet sie damit selbst nahe der Höhendecke
 *  (`MAX_BAR_HEIGHT_M`) — jede von dort hängende Verlustsäule verschwindet
 *  optisch zwischen den hohen Gewinnsäulen, statt sichtbar «unten» zu hängen.
 *
 *  Zweite, im Auftrag ausdrücklich vorgesehene Wahl, jetzt aktiv: die Höhe
 *  folgt dem BETRAG der Kennzahl (`companyElevations` unten, über
 *  `Math.abs`), das Vorzeichen trägt ausschliesslich `LOSS_COLOR`
 *  (`buildCompanyLayer`, `getFillColor`) — ein Verlust steht so hoch wie ein
 *  gleich grosser Gewinn, aber in der eigenen Verlustfarbe. Eine erhöhte
 *  Nulllinie braucht es damit nicht mehr; die Funktion bleibt als benannte
 *  Basis stehen, liefert aber für jede Kennzahl dieselbe Antwort. */
export function zeroPlaneHeight(): number {
  return CANTON_ELEVATION_M
}

/** Höhendecke der Firmenkarte — eigene Konstante statt eines Literals, damit
 *  `companyElevations` (`buildCompanyLayer`) dieselbe Decke verwendet.
 *  Ansicht «Beschäftigte» hat mit `MAX_BAR_HEIGHT_M` (`layers/many.ts`, 3000)
 *  eine eigene, niedrigere Decke — beide Ansichten teilen den Namen nicht,
 *  weil sie unterschiedliche Werte brauchen. */
export const MAX_BAR_HEIGHT_M = 12000

/** Höhe je Firma, in Metern — immer positiv, auch bei einem Verlust (siehe
 *  `zeroPlaneHeight` oben: der Betrag trägt die Höhe, `LOSS_COLOR` trägt das
 *  Vorzeichen). Deshalb rechnet `computeElevations` hier über den BETRAG der
 *  Kennzahl (`Math.abs`) statt über den vorzeichenbehafteten Wert — für
 *  Umsatz/Mitarbeitende (nie negativ) ändert das nichts, für Gewinn ist es
 *  der Kern der Aufgabe-18-Korrektur. */
export function companyElevations(
  companies: Company[],
  metric: Metric,
  vmax: number,
  maxHeight: number,
  mode: ScaleMode,
): Float32Array {
  const magnitudes = new Float32Array(
    companies.map((c) => Math.abs(metricValue(c, metric) ?? 0)),
  )
  const heights = computeElevations(magnitudes, vmax, maxHeight, mode)

  for (let i = 0; i < heights.length; i++) {
    const value = metricValue(companies[i]!, metric)
    if (value === null) {
      // Kein Wert in dieser Kennzahl — Platzhalterhöhe, unverwechselbar
      // niedriger als jede echte Säule (siehe MIN_VISIBLE_BAR_M).
      heights[i] = MIN_VISIBLE_BAR_M
      continue
    }
    if (heights[i]! < MIN_REAL_BAR_M) heights[i] = MIN_REAL_BAR_M
  }
  return heights
}

// Sichtbarkeitsschranken der Säule in Bildpunkten, unabhängig vom Zoom —
// dasselbe Muster wie `UNRESEARCHED_MARKER_MIN_PX`/`_MAX_PX` unten, hier für
// die Säule selbst statt für den Marker der unrecherchierten Firmen.
export const COMPANY_RADIUS_MIN_PX = 3
export const COMPANY_RADIUS_MAX_PX = 14

export function buildCompanyLayer(options: {
  result: SelectionResult
  metric: Metric
  mode: ScaleMode
  onClick: (company: Company) => void
  onHover: (company: Company | null, x: number, y: number) => void
}): ColumnLayer<Company> {
  const { result, metric, mode, onClick, onHover } = options
  const heights = companyElevations(result.visible, metric, result.vmax, MAX_BAR_HEIGHT_M, mode)
  const zeroPlane = zeroPlaneHeight()

  return new ColumnLayer<Company>({
    id: 'firmen',
    data: result.visible,
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
    // `radius: 900` bleibt Grundmass in Metern. `ColumnLayer` kennt anders
    // als `ScatterplotLayer` kein `radiusMinPixels`/`radiusMaxPixels` (siehe
    // `node_modules/@deck.gl/layers` v9.3.10, `_ColumnLayerProps` — die
    // Felder fehlen im Typ, und der Column-Vertexshader liest sie nicht):
    // eine zoomunabhängige Pixelgrenze der Säule selbst lässt sich mit dieser
    // Bibliotheksversion auf diesem Layertyp nicht abbilden. Der
    // Bodenschatten (`buildCompanyShadowLayer`, `ScatterplotLayer`) trägt die
    // Pixelgrenze stattdessen — er markiert denselben Ort und bleibt beim
    // Herauszoomen sichtbar, auch wenn die Säule darüber in Metern schrumpft.
    radius: 900,
    radiusUnits: 'meters',
    extruded: true,
    // Redesign (2026-08-14): dasselbe Material wie die Kantons-/Gemeinde-
    // flächen (`layers/material.ts`), damit beide Ansichten unter demselben
    // Licht (`layers/lighting.ts`) konsistent wirken, statt Ansicht A flach
    // schattiert gegen ein beleuchtetes Ansicht B zu stellen. Rund 200
    // Säulen (seit Phase 3, national) — der Mehraufwand bleibt irrelevant.
    material: MAP_MATERIAL,
    pickable: true,
    // Basis auf der Plattenoberkante (`zeroPlaneHeight`, siehe dort) — jede
    // Säule steht, keine hängt mehr; Betrag trägt die Höhe, `LOSS_COLOR`
    // (unten) trägt das Vorzeichen (Aufgabe 18, Browser-Fund).
    getPosition: (c) => [c.lon, c.lat, zeroPlane],
    getElevation: (_c, { index }) => heights[index]!,
    getFillColor: (c) => {
      const value = metricValue(c, metric)
      if (value === null) return [...UNKNOWN_COLOR, 180]
      if (value < 0) return [...LOSS_COLOR, 235]
      return [...(NOGA_GROUPS[c.nogaGroupIndex]?.color ?? UNKNOWN_COLOR), 235]
    },
    updateTriggers: { getElevation: [metric, mode, result.vmax], getFillColor: [metric] },
    onClick: (info) => {
      if (info.object) onClick(info.object)
    },
    onHover: (info) => onHover(info.object ?? null, info.x, info.y),
  })
}

/** Eine dunkle, halbtransparente Scheibe unter jeder Säule, auf
 *  Plattenhöhe (`CANTON_ELEVATION_M`) — derselben Höhe, auf der auch die
 *  Säule selbst ansetzt (`zeroPlaneHeight`, seit Aufgabe 18 immer die
 *  Plattenoberkante, siehe dort). Auf einer so hellen Kantonsplatte steht
 *  eine dünne Säule sonst ohne Kontakt zum Boden — der Schatten verankert sie
 *  an ihrem Ort, statt sie schweben zu lassen. Trägt keine eigene Aussage und
 *  ist nicht anklickbar; die Säule darüber nimmt den Klick. */
export function buildCompanyShadowLayer(result: SelectionResult): ScatterplotLayer<Company> {
  return new ScatterplotLayer<Company>({
    id: 'firmen-schatten',
    data: result.visible,
    pickable: false,
    stroked: false,
    getPosition: (c) => [c.lon, c.lat, CANTON_ELEVATION_M],
    getRadius: 1400,
    radiusUnits: 'meters',
    radiusMinPixels: COMPANY_RADIUS_MIN_PX + 2,
    radiusMaxPixels: COMPANY_RADIUS_MAX_PX + 4,
    getFillColor: [27, 39, 51, 38],
  })
}

// Klein, neutral, flach — bewusst kein Bezug zu irgendeiner Höhe oder
// Branchenfarbe: eine unrecherchierte Firma zeigt nur, DASS sie kotiert ist
// und WO ihr Sitz liegt, nicht WIE gross sie ist (das wüssten wir nicht,
// ohne es zu behaupten). Ein einzelner grauer Ton für platzierte, aber
// unrecherchierte Titel (`researched=false`) — klar unterscheidbar von den
// Branchenfarben der recherchierten Balken. Re-Review (2026-08-15): heute
// (`stats.count === stats.researched === 201`) zeichnet dieser Layer keinen
// einzigen Marker; er greift automatisch, sobald ein künftiger SIX-Sync
// platzierte, aber noch unrecherchierte Titel hinzufügt (siehe
// `companies.json`, `stats`).
/** Untergrenze für die Höhe einer Firmensäule ohne Wert in der aktiven
 *  Kennzahl (`companyElevations` setzt sie, sobald `metricValue` `null`
 *  liefert) — bei Umsatz eine Platzhalterzeile (`placeholder=true`), bei
 *  Mitarbeitende/Reingewinn eine fehlende Zahl. Der Mechanismus gilt für
 *  alle drei Kennzahlen gleich; vermessen wurde die konkrete Schwelle nur
 *  einmal, für Umsatz — die Kennzahl mit den meisten recherchierten Firmen
 *  und der grössten Wertspanne (Task 18, Browser-Fund):
 *
 *  Mit 187 echten Umsätzen (`stats.withRevenue`, Abschluss-Review Finding
 *  I7: schliesst eine ausgewiesene Null wie bei Molecular Partners AG aus —
 *  sie ist recherchiert, trägt aber keine Höhenaussage, siehe `metricValue`)
 *  spannt Ansicht «Börsennotierte Firmen» einen Faktor von rund 325'000 —
 *  Nestlé mit 89.5 Mrd. CHF gegen Xlife Sciences mit 0.28 Mio. Am unteren
 *  Ende ergibt die Skala Höhen von 75 und 105 m, also WENIGER als die 300 m
 *  hohe Kantonsplatte: diese Firmen wären auf der Karte nicht vorhanden,
 *  obwohl sie recherchiert sind und einen belegten Umsatz tragen — derselbe
 *  Fehler, der die flachen Marker unsichtbar machte.
 *
 *  Elf Umsatz-Säulen (alle unter rund 19 Mio. CHF) sitzen deshalb auf dieser
 *  Schwelle. Ihre Höhe bildet den jeweiligen Wert dort nicht mehr ab,
 *  sondern nur noch, DASS es die Firma gibt — bei diesen Grössen
 *  unterscheidet das Auge 75 von 105 Metern ohnehin nicht. Die Legende sagt
 *  es (`FLOOR_LEGEND_TEXT`, `ui/legend.ts`, seit Kennzahl-Wahl je Kennzahl
 *  formuliert), und das Panel nennt die echte Zahl. */
export const MIN_VISIBLE_BAR_M = 400

/** Untergrenze für Säulen MIT Wert in der aktiven Kennzahl — bewusst höher
 *  als `MIN_VISIBLE_BAR_M`. Vermessen wurde auch diese Schwelle nur für
 *  Umsatz (siehe Kommentar dort); dieselben 400/550 m gelten mechanisch für
 *  Mitarbeitende und Reingewinn.
 *
 *  Zwei Zusicherungen stossen hier aneinander: jede Säule muss die
 *  Kantonsplatte überragen, UND ein Platzhalter ("keine Zahl gefunden") muss
 *  niedriger bleiben als jede echte Säule — sonst sieht "keine Zahl" aus wie
 *  "kleine Zahl". Mit einer einzigen Schwelle liesse sich nur eines von
 *  beiden halten. Also zwei: Platzhalter sitzen auf 400 m, die kleinsten
 *  echten Säulen auf 550 m. Der Abstand ist klein, aber er ist da, und die
 *  Reihenfolge stimmt. */
export const MIN_REAL_BAR_M = 550

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
    // sie ragen mit tausenden Metern hindurch —, die unrecherchierten Marker
    // dagegen waren vollständig begraben, und die Karte sah aus, als gäbe es
    // nur die acht Aargauer Firmen (Re-Review 2026-08-15: die genaue Anzahl
    // der damals betroffenen Marker liess sich nicht mehr verlässlich
    // belegen, deshalb hier ohne Zahl statt falsch-präzise).
    getPosition: (c) => [c.lon, c.lat, CANTON_ELEVATION_M],
    getRadius: UNRESEARCHED_MARKER_RADIUS_M,
    radiusUnits: 'meters',
    // Ohne diese Schranken schrumpft ein in Metern angegebener Marker beim
    // Herauszoomen mit der Karte: auf der Schweiz-Ansicht wurden aus 350 m
    // Radius rund zwei Bildpunkte — die unrecherchierten Marker waren
    // gezeichnet, aber nicht zu sehen, und die Karte wirkte, als gäbe es nur
    // die acht Aargauer Säulen. Die Obergrenze verhindert das Gegenteil: beim
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
