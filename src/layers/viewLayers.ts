import type { LayersList } from '@deck.gl/core'
import type { Geometry } from 'geojson'
import type { BoundaryFeatureCollection } from '../data/boundaries'
import type { Level } from '../data/loader'
import type { PresentGroups } from '../domain/legendGroups'
import type { ScaleMode } from '../domain/scale'
import type { NoticeLevel } from '../ui/notices'
import { formatNumber } from '../ui/format'
import { hideHoverLabel, showHoverLabel } from '../ui/hoverLabel'
import { municipalityName } from '../ui/panel'
import { buildCantonBorderLayer, buildCantonsLayer } from './cantons'
import { buildMunicipalityBorderLayer, buildMunicipalityLayer } from './many'
import {
  buildCompanyLayer,
  buildUnresearchedCompanyLayer,
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

/** In beiden Ansichten gebraucht: die Basiskarte und die Höhenskala. */
interface ViewLayersBasis {
  mode: ScaleMode
  cantonsGeo: BoundaryFeatureCollection
  activeBfsNr: number | null
  cantonBorderLayer: ReturnType<typeof buildCantonBorderLayer>
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
  const { mode, cantonsGeo, activeBfsNr, cantonBorderLayer } = input
  const cantonsLayer = buildCantonsLayer({ data: cantonsGeo, activeBfsNr })

  // Ansicht «Börsennotierte Firmen»: seit Phase 3 national (kein Bezug mehr
  // auf einen einzelnen, vorher geladenen Kanton) — zwei Layer, nicht eine:
  // Säulen für die recherchierten Firmen (`buildCompanyLayer`, Inhalt),
  // flache neutrale Marker für alle übrigen kotierten Titel
  // (`buildUnresearchedCompanyLayer`, Kontext — siehe `layers/visible.ts`).
  if (input.view === 'sichtbare') {
    const { companies, onShowCompanyPanel } = input
    return [
      cantonsLayer,
      cantonBorderLayer,
      buildCompanyLayer(companies, mode, onShowCompanyPanel),
      buildUnresearchedCompanyLayer(companies, onShowCompanyPanel, (company, x, y) => {
        if (!company) return hideHoverLabel()
        showHoverLabel(company.name, x, y)
      }),
    ]
  }

  const { level, kantone, cantonGeometries, kantoneVmax, activeCanton } = input

  if (level === 'kanton' && activeCanton) {
    const entry = activeCanton
    return [
      cantonsLayer,
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
