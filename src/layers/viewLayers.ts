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
import type { ViewName } from '../ui/toggle'
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
 *  `<code>_boundaries.geojson`) abgeleitet — siehe `main.ts`, `cantonCache`. */
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
 *  `main.ts` braucht dieselbe Auflösung in `enterCanton`, um Code/bfs_nr der
 *  angeklickten Zeile zu bestimmen, nicht nur beim Bauen des Hover-Labels
 *  hier. */
export function kantonRowInfo(
  kantone: Level,
  index: number,
): { bfsNr: number; code: string; name: string } | undefined {
  const { gemeindeIdx } = kantone.arrays
  const entries = kantone.meta.kantone
  if (!gemeindeIdx || !entries) return undefined
  return entries[gemeindeIdx[index] ?? -1]
}

export interface ViewLayersInput {
  view: ViewName
  level: NoticeLevel
  mode: ScaleMode
  cantonsGeo: BoundaryFeatureCollection
  activeBfsNr: number | null
  cantonBorderLayer: ReturnType<typeof buildCantonBorderLayer>
  kantone: Level
  cantonGeometries: Geometry[]
  kantoneVmax: number
  activeCanton: CantonEntry | null
  companies: CompanyData
  onEnterCanton: (index: number) => void
  onShowMunicipalityPanel: (level: Level, index: number) => void
  onShowCompanyPanel: (company: Company) => void
}

/** Baut genau die Layer-Liste, die `main.ts` an `handle.setLayers()`
 *  übergibt — als eigenständige, DOM-freie Funktion (kein `fetch`, kein
 *  `document`), damit sich die id-Eindeutigkeit über alle Kombinationen aus
 *  `view`/`level` ohne Browser prüfen lässt (`viewLayers.test.ts`). Enthält
 *  dieselbe Verteidigung wie zuvor in `main.ts`s `render()`: Kantonsstufe
 *  ohne geladenen Kanton (sollte nicht vorkommen, siehe `main.ts`) fällt auf
 *  die Schweiz-Stufe zurück statt eine leere oder falsche Liste zu bauen. */
export function buildViewLayers(input: ViewLayersInput): LayersList {
  const {
    view,
    level,
    mode,
    cantonsGeo,
    activeBfsNr,
    cantonBorderLayer,
    kantone,
    cantonGeometries,
    kantoneVmax,
    activeCanton,
    companies,
    onEnterCanton,
    onShowMunicipalityPanel,
    onShowCompanyPanel,
  } = input

  const cantonsLayer = buildCantonsLayer({ data: cantonsGeo, activeBfsNr })

  if (view === 'beschaeftigte' && level === 'kanton' && activeCanton) {
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
        onClick: (index) => onShowMunicipalityPanel(entry.gemeinde, index),
        onHover: (index, x, y) => {
          if (index === null) return hideHoverLabel()
          const name = municipalityName(entry.gemeinde, index)
          if (name) showHoverLabel(name, x, y)
          else hideHoverLabel()
        },
      }),
    ]
  }

  if (view === 'beschaeftigte') {
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
        onClick: onEnterCanton,
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

  // Ansicht «Börsennotierte Firmen»: seit Phase 3 national (kein Bezug mehr
  // auf einen einzelnen, vorher geladenen Kanton) — zwei Layer, nicht eine:
  // Säulen für die recherchierten Firmen (`buildCompanyLayer`, Inhalt),
  // flache neutrale Marker für alle übrigen kotierten Titel
  // (`buildUnresearchedCompanyLayer`, Kontext — siehe `layers/visible.ts`).
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
