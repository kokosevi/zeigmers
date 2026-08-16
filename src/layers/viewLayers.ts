import type { LayersList } from '@deck.gl/core'
import type { FeatureCollection, Geometry } from 'geojson'
import type { BoundaryFeatureCollection } from '../data/boundaries'
import type { Level } from '../data/loader'
import type { PresentGroups } from '../domain/legendGroups'
import { formatMetric, metricValue, type Metric } from '../domain/metric'
import { NOGA_GROUPS } from '../domain/noga.generated'
import type { ScaleMode } from '../domain/scale'
import type { SelectionResult } from '../domain/selection'
import type { NoticeLevel } from '../ui/notices'
import { formatNumber } from '../ui/format'
import { hideHoverLabel, showHoverLabel } from '../ui/hoverLabel'
import { municipalityName } from '../ui/panel'
import { buildCantonBorderLayer, buildCantonsLayer } from './cantons'
import { buildLakesLayer } from './lakes'
import { buildMunicipalityBorderLayer, buildMunicipalityLayer } from './many'
import { buildLabelLayer, topByMetric, TOP_LABEL_COUNT } from './labels'
import {
  buildCompanyLayer,
  buildCompanyShadowLayer,
  buildUnresearchedCompanyLayer,
  companyElevations,
  MAX_BAR_HEIGHT_M,
  zeroPlaneHeight,
  type Company,
  type CompanyData,
} from './visible'

// Regressionsgrund (2026-08-14, Nachtrag zu Phase 2): die Schweiz-Stufe von
// Ansicht «Beschäftigte» und die Kantonsflächen-Basiskarte
// (`layers/cantons.ts`, `buildCantonsLayer`) bekamen beide die id `'kantone'`
// — deck.gl verlangt eindeutige ids je Layer-Array; bei einer Kollision
// gewinnt beim Prop-Dispatch nur eine der beiden Instanzen, hier die nicht
// pickbare Basiskarten-Platte (`pickable: false`, kein `onClick`). Ein Klick
// auf einen Kantonsbalken lief deshalb ins Leere, ohne Fehler, ohne
// Kamerabewegung — Hover funktionierte weiter, weil `autoHighlight` ein
// Render-Effekt der tatsächlich gezeichneten Instanz ist, keine
// id-Auflösung. Umbenannt statt die Basiskarte umzubenennen: `layers/many.ts`
// cached nach id, und die Basiskarten-id `'kantone'` ist an mehreren Stellen
// (Kommentare, `layers/cantons.ts`) bereits als „die Platte" etabliert — die
// neue, spezifischere id hier vermeidet Verwechslung eher als eine
// Umbenennung der älteren, stabilen Basiskarten-id. `viewLayers.test.ts`
// (`no duplicate layer ids`) ist der Regressionstest dafür, über alle
// Kombinationen aus Ansicht und Stufe, nicht nur diesen einen Fall.
export const KANTONE_BARS_LAYER_ID = 'kantone-saeulen'

/** Alles, was ein betretener Kanton für Ansicht «Beschäftigte» braucht, einmal
 *  geladen und aus den beiden Rohdateien (`<code>_gemeinde.{json,bin}`,
 *  `<code>_boundaries.geojson`) abgeleitet — siehe `karte/beschaeftigte.ts`,
 *  `cantonCache`. */
export interface CantonEntry {
  code: string
  name: string
  bfsNr: number
  gemeinde: Level
  geometries: Geometry[]
  vmax: number
  presentGroups: PresentGroups
  borderLayer: ReturnType<typeof buildMunicipalityBorderLayer>
}

/** Löst eine Zeile der Kantonsstufe (`kantone.arrays.*[index]`) zu Name/Code/
 *  bfs_nr auf — dieselbe `gemeindeIdx` → Metadaten-Indirektion wie
 *  `ui/panel.ts`s `municipalityName`, nur über `meta.kantone` statt
 *  `meta.gemeinden` (siehe `data/loader.ts`, `LevelMeta.kantone`). Exportiert:
 *  `karte/beschaeftigte.ts` braucht dieselbe Auflösung in `enterCanton`, um
 *  Code/bfs_nr der angeklickten Zeile zu bestimmen, nicht nur beim Bauen des
 *  Hover-Labels hier. */
export function kantonRowInfo(
  kantone: Level,
  index: number,
): { bfsNr: number; code: string; name: string } | undefined {
  const { gemeindeIdx } = kantone.arrays
  const entries = kantone.meta.kantone
  if (!gemeindeIdx || !entries) return undefined
  return entries[gemeindeIdx[index] ?? -1]
}

/** Die beiden Zeilen des Hover-Labels für eine recherchierte Firmensäule
 *  (`buildCompanyLayer`, Ansicht «Börsennotierte Firmen»): Name, dann Wert
 *  der AKTIVEN Kennzahl (nicht fest `'umsatz'`, siehe `metric`-Parameter)
 *  und Branche. Eigene, exportierte Funktion statt eines Einzeilers in der
 *  Hover-Closure — hier fällt die fachliche Entscheidung (welche Kennzahl,
 *  welcher Fallback-Text bei fehlendem Wert), die deshalb ohne DOM prüfbar
 *  sein muss (`viewLayers.test.ts`).
 *
 *  Fehlt der Wert (`metricValue` liefert `null` — dieselbe Firma bekommt
 *  dann die Platzhaltersäule, siehe `companyElevations` in `layers/visible.ts`),
 *  sagt die zweite Zeile das explizit statt einer Lücke oder eines
 *  «undefined»: ein Label, das nur den Namen zeigt, wäre nicht ehrlicher,
 *  nur unauffälliger, und liesse offen, ob der Wert vergessen ging oder
 *  tatsächlich nicht bekannt ist. */
export function companyHoverLines(company: Company, metric: Metric): [string, string] {
  const value = metricValue(company, metric)
  const valueText =
    value === null ? 'Keine Zahl für diese Kennzahl' : formatMetric(value, metric)
  const branch = NOGA_GROUPS[company.nogaGroupIndex]?.label ?? 'unbekannt'
  return [company.name, `${valueText} · ${branch}`]
}

/** In beiden Ansichten gebraucht: die Basiskarte und die Höhenskala.
 *
 *  `lakes` ist `null`, wenn `loadLakes()` (`data/boundaries.ts`) das Artefakt
 *  nicht laden konnte — die Seen sind Orientierung, kein Inhalt, ihr Fehlen
 *  ist deshalb kein Fehlerfall dieser Funktion, sondern eine dritte,
 *  legitime Eingabe neben einer geladenen `FeatureCollection`. */
interface ViewLayersBasis {
  mode: ScaleMode
  cantonsGeo: BoundaryFeatureCollection
  activeBfsNr: number | null
  cantonBorderLayer: ReturnType<typeof buildCantonBorderLayer>
  lakes: FeatureCollection | null
}

/** Seit der Aufteilung in zwei Seiten (2026-08-15) ist `view` keine
 *  umschaltbare Zustandsvariable mehr, sondern eine Eigenschaft der Seite —
 *  jede Seite ruft `buildViewLayers` mit genau einer der beiden Varianten auf.
 *  Als Union statt als ein Interface mit optionalen Feldern, weil die
 *  Beschäftigten-Seite `companies.json` (320 KB) gar nicht mehr lädt: mit
 *  `companies?: CompanyData` bräuchte der Firmen-Zweig unten einen Guard, den
 *  kein Aufrufer je auslösen kann — toter Code, der behauptet, ein Zustand sei
 *  möglich, den der Bau der Seiten ausschliesst. Über `view` unterschieden
 *  verengt TypeScript stattdessen von selbst, und der Compiler erzwingt, dass
 *  jede Seite genau das übergibt, was ihre Ansicht braucht. */
export type ViewLayersInput =
  | (ViewLayersBasis & {
      view: 'sichtbare'
      companies: CompanyData
      /** Gefilterte und bewertete Auswahl (`applySelection`, `domain/selection.ts`)
       *  — Task 18 verdrahtet Kennzahl und Filter über `karte/firmen.ts`s
       *  `render()`; diese Funktion filtert selbst nicht mehr (kein zweiter
       *  Ort, siehe dort). `companies` bleibt daneben nötig für
       *  `buildUnresearchedCompanyLayer` unten, der immer alle platzierten,
       *  aber unrecherchierten Marker zeigt — ungefiltert, weil sie gar nicht
       *  Teil von `applySelection`s `visible` sind (siehe dort, `researched`-
       *  Bedingung). */
      result: SelectionResult
      /** Die an der Steuerung aktive Kennzahl — bestimmt Säulenhöhe, Hover-
       *  Zweitzeile und Beschriftung der grössten Gesellschaften. */
      metric: Metric
      onShowCompanyPanel: (company: Company) => void
    })
  | (ViewLayersBasis & {
      view: 'beschaeftigte'
      level: NoticeLevel
      kantone: Level
      cantonGeometries: Geometry[]
      kantoneVmax: number
      activeCanton: CantonEntry | null
      onEnterCanton: (index: number) => void
      onShowMunicipalityPanel: (level: Level, index: number) => void
    })

/** Baut genau die Layer-Liste, die die Seiten (`karte/firmen.ts`,
 *  `karte/beschaeftigte.ts`) an `handle.setLayers()` übergeben — als
 *  eigenständige, DOM-freie Funktion (kein `fetch`, kein `document`), damit
 *  sich die id-Eindeutigkeit über alle Kombinationen aus `view`/`level` ohne
 *  Browser prüfen lässt (`viewLayers.test.ts`). Enthält dieselbe
 *  Verteidigung wie in `karte/beschaeftigte.ts`s `render()`: Kantonsstufe
 *  ohne geladenen Kanton (sollte nicht vorkommen, siehe dort) fällt auf die
 *  Schweiz-Stufe zurück statt eine leere oder falsche Liste zu bauen. */
export function buildViewLayers(input: ViewLayersInput): LayersList {
  const { mode, cantonsGeo, activeBfsNr, cantonBorderLayer, lakes } = input
  const cantonsLayer = buildCantonsLayer({ data: cantonsGeo, activeBfsNr })
  // Nur einreihen, wenn das Artefakt tatsächlich geladen werden konnte (siehe
  // `ViewLayersBasis.lakes` oben) — fehlt es, bleibt die Karte unverändert,
  // ohne Lücke in der Layer-Liste.
  const lakesLayer = lakes ? buildLakesLayer(lakes) : null

  // Ansicht «Börsennotierte Firmen»: seit Phase 3 national (kein Bezug mehr
  // auf einen einzelnen, vorher geladenen Kanton) — vier Layer: Bodenschatten
  // (`buildCompanyShadowLayer`, verankert die Säule am Boden) und Säulen für
  // die recherchierten Firmen (`buildCompanyLayer`, Inhalt), flache neutrale
  // Marker für alle übrigen kotierten Titel (`buildUnresearchedCompanyLayer`,
  // Kontext), und zuoberst die Namen der zwölf grössten Gesellschaften nach
  // der aktiven Kennzahl (`buildLabelLayer`, `layers/labels.ts`). Keine
  // eigene Nulllinie mehr (Aufgabe 18, siehe `layers/visible.ts`,
  // `zeroPlaneHeight`): Säulen stehen bei jeder Kennzahl auf der
  // Plattenoberkante, ein Verlust trägt sein Vorzeichen über die Farbe.
  if (input.view === 'sichtbare') {
    const { companies, result, metric, onShowCompanyPanel } = input

    // Seit Aufgabe 18 eine Konstante (immer die Plattenoberkante, siehe
    // `layers/visible.ts`) — trotzdem über die Funktion bezogen statt als
    // Literal dupliziert, damit ein künftiger Wechsel der Basis nur an einer
    // Stelle geändert werden muss.
    const zeroPlane = zeroPlaneHeight()
    const topCompanies = topByMetric(result, metric, TOP_LABEL_COUNT)
    // Nur der Name — für die unrecherchierten Marker (`buildUnresearchedCompanyLayer`
    // unten) gibt es nichts Zweites zu sagen: weder Kennzahl noch Branche sind
    // für sie belegt.
    const onHoverCompany = (company: Company | null, x: number, y: number) => {
      if (!company) return hideHoverLabel()
      showHoverLabel(company.name, x, y)
    }
    // Zweite Zeile für die recherchierten Säulen (`buildCompanyLayer` unten):
    // Wert der aktiven Kennzahl und Branche, dieselbe Herleitung wie die
    // Säulenhöhe (`metricValue`) bzw. das Klick-Panel (`ui/panel.ts`,
    // `nogaGroupLabel`). Fehlt der Wert (`metricValue` liefert `null` — dieselbe
    // Firma bekommt dann die Platzhaltersäule, siehe `companyElevations`), sagt
    // die Zeile das explizit: ein leerer Platz oder ein "undefined" wäre nicht
    // ehrlicher, nur unauffälliger, und liesse offen, ob der Wert vergessen
    // oder tatsächlich nicht bekannt ist. Als eigene, exportierte Funktion statt
    // eines Closure-Einzeilers, weil hier die eigentliche fachliche Entscheidung
    // fällt (welcher Wert, welche Kennzahl, welcher Fallback-Text) — die gehört
    // ohne DOM prüfbar, siehe `companyHoverLines` in `viewLayers.test.ts`.
    const onHoverResearchedCompany = (company: Company | null, x: number, y: number) => {
      if (!company) return hideHoverLabel()
      showHoverLabel(companyHoverLines(company, metric), x, y)
    }

    return [
      cantonsLayer,
      ...(lakesLayer ? [lakesLayer] : []),
      cantonBorderLayer,
      // Vor der Säule eingereiht, sonst zeichnet deck.gl den Schatten über
      // die Säule statt darunter.
      buildCompanyShadowLayer(result),
      buildCompanyLayer({
        result,
        metric: metric,
        mode,
        onClick: onShowCompanyPanel,
        onHover: onHoverResearchedCompany,
      }),
      buildUnresearchedCompanyLayer(companies, onShowCompanyPanel, onHoverCompany),
      // Zuoberst eingereiht (letztes Element): deck.gl zeichnet spätere
      // Layer über frühere. Die Namen der grössten Gesellschaften sollen von
      // keiner Säule und keinem Marker verdeckt werden, egal wie die anderen
      // Layer sich überlagern.
      //
      // `topCompanies` trägt eigene Höhen statt aus `heights` (oben, über
      // `result.visible`) herausgegriffen zu werden: `companyElevations` ist
      // je Firma unabhängig von den übrigen Firmen im Array (nur `vmax`,
      // `mode`, `maxHeight` sind geteilt) — mit denselben drei Werten liefert
      // sie für dieselbe Firma exakt dieselbe Höhe wie oben, nur bereits in
      // der Reihenfolge von `topCompanies`, wie `buildLabelLayer`s
      // `getPosition` sie braucht (Zugriff über den deck.gl-Datenindex).
      buildLabelLayer(
        topCompanies,
        metric,
        companyElevations(topCompanies, metric, result.vmax, MAX_BAR_HEIGHT_M, mode),
        zeroPlane,
      ),
    ]
  }

  const { level, kantone, cantonGeometries, kantoneVmax, activeCanton } = input

  if (level === 'kanton' && activeCanton) {
    const entry = activeCanton
    return [
      cantonsLayer,
      ...(lakesLayer ? [lakesLayer] : []),
      cantonBorderLayer,
      buildMunicipalityLayer('gemeinde', {
        level: entry.gemeinde,
        geometries: entry.geometries,
        vmax: entry.vmax,
        mode,
        opacity: 1,
        visible: true,
        onClick: (index) => input.onShowMunicipalityPanel(entry.gemeinde, index),
        onHover: (index, x, y) => {
          if (index === null) return hideHoverLabel()
          const name = municipalityName(entry.gemeinde, index)
          if (name) showHoverLabel(name, x, y)
          else hideHoverLabel()
        },
      }),
    ]
  }

  // Deckt sowohl `level === 'schweiz'` als auch den Verteidigungsfall
  // (`level === 'kanton'` ohne `activeCanton`) ab.
  return [
    cantonsLayer,
    ...(lakesLayer ? [lakesLayer] : []),
    cantonBorderLayer,
    buildMunicipalityLayer(KANTONE_BARS_LAYER_ID, {
      level: kantone,
      geometries: cantonGeometries,
      vmax: kantoneVmax,
      mode,
      opacity: 1,
      visible: true,
      onClick: input.onEnterCanton,
      onHover: (index, x, y) => {
        if (index === null) return hideHoverLabel()
        const info = kantonRowInfo(kantone, index)
        if (!info) return hideHoverLabel()
        const value = kantone.arrays.values[index] ?? 0
        showHoverLabel(`${info.name} · ${formatNumber(value)} Beschäftigte`, x, y)
      },
    }),
  ]
}
