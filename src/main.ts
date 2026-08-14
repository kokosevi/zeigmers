import './style.css'
import type { Geometry } from 'geojson'
import {
  loadCantons,
  loadMunicipalityBoundaries,
  joinCantonGeometry,
  joinMunicipalityGeometry,
} from './data/boundaries'
import { loadLevel, loadMeta, type Level } from './data/loader'
import { boundsOfGeometries } from './domain/bounds'
import { presentGroupsFromIndices, type PresentGroups } from './domain/legendGroups'
import { NOGA_UNKNOWN_INDEX } from './domain/noga.generated'
import type { ScaleMode } from './domain/scale'
import { buildCantonBorderLayer, buildCantonsLayer } from './layers/cantons'
import { buildMunicipalityBorderLayer, buildMunicipalityLayer } from './layers/many'
import { buildCompanyLayer, loadCompanies } from './layers/visible'
import { createMap } from './map'
import { renderBackControl } from './ui/backControl'
import { showError } from './ui/error'
import { formatNumber } from './ui/format'
import { hideHoverLabel, showHoverLabel } from './ui/hoverLabel'
import { renderLegend } from './ui/legend'
import { renderNotices, type NoticeLevel } from './ui/notices'
import {
  configureCanton,
  hidePanel,
  municipalityName,
  showCompanyPanel,
  showMunicipalityPanel,
} from './ui/panel'
import { createToggle, DEFAULT_MODE, type ViewName } from './ui/toggle'

// Phase 2 («nationale Navigation»): Ansicht «Beschäftigte» hat seit diesem
// Phasenwechsel zwei Stufen statt einer festen Gemeindeebene eines einzigen
// Kantons — `'schweiz'` (26 Kantonsbalken, Startzustand) und `'kanton'` (die
// Gemeinden des zuletzt betretenen Kantons, genau wie Ansicht «Beschäftigte»
// vor dieser Phase aussah, nur jetzt für einen von 26 statt fest für Aargau).
// Zwei getrennte Bildschirme, kein Zoom-/LOD-Überblenden zwischen ihnen
// (Auftrag) — ein Klick auf einen Kantonsbalken wechselt den Bildschirm,
// löst keine Kameraüberblendung „hinein" aus.
type BeschaeftigteLevel = NoticeLevel

/** Alles, was ein betretener Kanton für Ansicht «Beschäftigte» braucht, einmal
 *  geladen und aus den beiden Rohdateien (`<code>_gemeinde.{json,bin}`,
 *  `<code>_boundaries.geojson`) abgeleitet — pro Kanton einmalig berechnet und
 *  danach in `cantonCache` (unten) für die Dauer der Sitzung wiederverwendet,
 *  nicht bei jedem Render. Trägt bewusst auch `borderLayer`: Ansicht
 *  «Börsennotierte Firmen» braucht dieselben Gemeindegrenzen wie Ansicht
 *  «Beschäftigte» (siehe `layers/many.ts`, `buildMunicipalityBorderLayer`),
 *  aus demselben Cache-Eintrag, ohne zweiten Fetch. */
interface CantonEntry {
  code: string
  name: string
  bfsNr: number
  gemeinde: Level
  geometries: Geometry[]
  vmax: number
  presentGroups: PresentGroups
  borderLayer: ReturnType<typeof buildMunicipalityBorderLayer>
}

async function start() {
  const container = document.getElementById('map')
  if (!container) return showError('Kartencontainer #map fehlt im HTML.')
  const ui = document.getElementById('ui')

  const handle = createMap(container)
  handle.onError((message) => showError(`Basiskarte: ${message}`))

  // Startlast (Auftrag: „271 KB — die 26 Kantonsflächen und ihre
  // Aggregatzahlen"): `ch_kantone.{json,bin}` ist ein vollwertiges
  // Level-Artefakt wie jede `<code>_gemeinde`-Datei, nur mit 26 Zeilen (eine
  // je Kanton) statt einer je Gemeinde — dieselbe `loadLevel()` liest beide.
  // Keine einzelne Kantons-Gemeindedatei (`<code>_gemeinde`/`_boundaries`)
  // wird hier geladen; die folgen erst, wenn ein Kanton tatsächlich betreten
  // wird (`loadCantonEntry` unten) oder Ansicht «Börsennotierte Firmen» zum
  // ersten Mal aktiv wird (`ensureCompaniesReady`).
  const [meta, kantone, cantonsGeo, companies] = await Promise.all([
    loadMeta(),
    loadLevel('ch_kantone'),
    loadCantons(),
    loadCompanies(),
  ])
  configureCanton(meta.canton.name)

  const cantonGeometries = joinCantonGeometry(kantone, cantonsGeo)
  // Schweiz-Rahmung aus der tatsächlichen Geometrie hergeleitet (Auftrag:
  // „Derive the canton framing from the geometry rather than hardcoding 26
  // camera positions") — kein von Hand gewählter Zentrum/Zoom-Wert wie zuvor
  // für Aargau allein. `instant: true`: die erste Rahmung beim Laden ist keine
  // Reaktion auf eine Nutzerinteraktion, die eine Kameraanimation ankündigen
  // müsste — sie stellt nur den Platzhalter aus `map.ts` (`INITIAL_VIEW`)
  // richtig, bevor irgendetwas gezeichnet ist.
  const nationalBounds = boundsOfGeometries(cantonGeometries)
  handle.frameBounds(nationalBounds, { instant: true })

  const kantoneVmax = kantone.meta.stats.max
  const nationalYear = kantone.meta.year
  const kantonePresentGroups = presentGroupsFromIndices(kantone.arrays.noga)
  const companyYear =
    Math.max(0, ...companies.companies.map((c) => c.fiscalYear ?? 0)) || nationalYear
  const companyPresentGroups = presentGroupsFromIndices(
    companies.companies.map((c) => (c.placeholder ? NOGA_UNKNOWN_INDEX : c.nogaGroupIndex)),
  )

  // Kantonsgrenzen (Basiskarte, siehe `layers/cantons.ts`) — in beiden
  // Ansichten und auf beiden Stufen von «Beschäftigte» sichtbar (Auftrag),
  // deshalb einmalig gebaut. `cantonsLayer` selbst (die Füllung mit dem
  // hervorgehobenen aktiven Kanton) wandert dagegen in `render()`: welcher
  // Kanton „aktiv" ist, ändert sich jetzt mit der Navigation (siehe
  // `activeHighlightBfsNr`), was vor Phase 2 nie der Fall war.
  const cantonBorderLayer = buildCantonBorderLayer({ data: cantonsGeo })

  // Pro Kanton einmal geladen, danach für die Sitzung im Speicher (Auftrag:
  // „re-entering a canton already visited must not fetch again"). 26 Kantone
  // vollständig geladen wären zusammen rund 12 MB (Auftrag) — für eine
  // Kartenanwendung in einem einzelnen Tab unkritisch; ein Verdrängungs-Cache
  // (LRU o. ä.) hätte hier nur Komplexität ohne einen tatsächlichen
  // Speicherdruck gelöst, deshalb bewusst kein Limit (siehe Bericht).
  // `cantonFetches` dedupliziert gleichzeitige Anfragen für denselben Kanton
  // (z. B. ein schneller Doppelklick), damit nie zwei Fetches derselben Datei
  // gleichzeitig laufen.
  const cantonCache = new Map<string, CantonEntry>()
  const cantonFetches = new Map<string, Promise<CantonEntry>>()

  function loadCantonEntry(bfsNr: number, code: string, name: string): Promise<CantonEntry> {
    const cached = cantonCache.get(code)
    if (cached) return Promise.resolve(cached)
    const pending = cantonFetches.get(code)
    if (pending) return pending
    const prefix = code.toLowerCase()
    const promise = (async () => {
      const [gemeinde, boundaries] = await Promise.all([
        loadLevel(`${prefix}_gemeinde`),
        loadMunicipalityBoundaries(prefix),
      ])
      const geometries = joinMunicipalityGeometry(gemeinde, boundaries)
      const entry: CantonEntry = {
        code,
        name,
        bfsNr,
        gemeinde,
        geometries,
        vmax: gemeinde.meta.stats.max,
        presentGroups: presentGroupsFromIndices(gemeinde.arrays.noga),
        borderLayer: buildMunicipalityBorderLayer(geometries),
      }
      cantonCache.set(code, entry)
      return entry
    })()
    cantonFetches.set(code, promise)
    void promise.finally(() => cantonFetches.delete(code))
    return promise
  }

  /** Löst eine Zeile der Kantonsstufe (`kantone.arrays.*[index]`) zu Name/Code/
   *  bfs_nr auf — dieselbe `gemeindeIdx` → Metadaten-Indirektion wie
   *  `ui/panel.ts`s `municipalityName`, nur über `meta.kantone` statt
   *  `meta.gemeinden` (siehe `data/loader.ts`, `LevelMeta.kantone`). */
  function kantonRowInfo(
    index: number,
  ): { bfsNr: number; code: string; name: string } | undefined {
    const { gemeindeIdx } = kantone.arrays
    const entries = kantone.meta.kantone
    if (!gemeindeIdx || !entries) return undefined
    return entries[gemeindeIdx[index] ?? -1]
  }

  let view: ViewName = 'beschaeftigte'
  let mode: ScaleMode = DEFAULT_MODE[view]
  let level: BeschaeftigteLevel = 'schweiz'
  let activeCanton: CantonEntry | null = null
  // Wird bei jeder Navigation (Kanton betreten/verlassen) erhöht — ein
  // `enterCanton`-Aufruf, der erst nach einer inzwischen überholten
  // Navigation (z. B. Escape zurück zur Schweiz, oder ein Klick auf einen
  // anderen Kanton) fertig lädt, erkennt daran, dass er nicht mehr der
  // aktuelle ist, und lässt `level`/`activeCanton` unangetastet (siehe
  // `enterCanton`).
  let navToken = 0

  function activeHighlightBfsNr(): number | null {
    if (view === 'sichtbare') return meta.canton.bfs_nr
    if (level === 'kanton' && activeCanton) return activeCanton.bfsNr
    return null
  }

  function documentTitle(): string {
    if (view === 'sichtbare') return `Draufsicht — Wirtschaftskarte Kanton ${meta.canton.name}`
    if (level === 'kanton' && activeCanton) {
      return `Draufsicht — Wirtschaftskarte Kanton ${activeCanton.name}`
    }
    return 'Draufsicht — Wirtschaftskarte Schweiz'
  }

  // Zustand ist (view, mode, level, activeCanton). Jede Änderung rendert
  // komplett neu: Layer, Legende, Pflichthinweis, Titel, Zurück-Kontrolle. Der
  // viewState der Karte wird hier nirgends angefasst — Kamerabewegungen laufen
  // ausschliesslich über `handle.frameBounds()` in `enterCanton`/
  // `exitToSwitzerland`, nie in `render()` selbst. Das ist, was Ansicht
  // «Börsennotierte Firmen» ihre unveränderte Kamera beim Umschalten
  // garantiert (Auftrag) — auch wenn diese Ansicht weiterhin nur Aargau zeigt,
  // während die Kamera gerade irgendwo anders in der Schweiz stehen kann
  // (siehe `scopeLabel` unten).
  const render = () => {
    // Verteidigung gegen einen Zustand, der laut obigem Kommentar nie
    // entstehen sollte (Kantonsstufe ohne geladenen Kanton) — fällt statt
    // eines leeren Renders auf die Schweiz-Stufe zurück.
    if (level === 'kanton' && !activeCanton) level = 'schweiz'

    hidePanel()
    hideHoverLabel()
    document.title = documentTitle()

    const cantonsLayer = buildCantonsLayer({
      data: cantonsGeo,
      activeBfsNr: activeHighlightBfsNr(),
    })

    if (view === 'beschaeftigte' && level === 'schweiz') {
      handle.setLayers([
        cantonsLayer,
        cantonBorderLayer,
        buildMunicipalityLayer('kantone', {
          level: kantone,
          geometries: cantonGeometries,
          vmax: kantoneVmax,
          mode,
          opacity: 1,
          visible: true,
          onClick: (index) => void enterCanton(index),
          onHover: (index, x, y) => {
            if (index === null) return hideHoverLabel()
            const info = kantonRowInfo(index)
            if (!info) return hideHoverLabel()
            const value = kantone.arrays.values[index] ?? 0
            showHoverLabel(`${info.name} · ${formatNumber(value)} Beschäftigte`, x, y)
          },
        }),
      ])
    } else if (view === 'beschaeftigte' && activeCanton) {
      const entry = activeCanton
      handle.setLayers([
        cantonsLayer,
        cantonBorderLayer,
        buildMunicipalityLayer('gemeinde', {
          level: entry.gemeinde,
          geometries: entry.geometries,
          vmax: entry.vmax,
          mode,
          opacity: 1,
          visible: true,
          onClick: (index) => showMunicipalityPanel(entry.gemeinde, index),
          onHover: (index, x, y) => {
            if (index === null) return hideHoverLabel()
            const name = municipalityName(entry.gemeinde, index)
            if (name) showHoverLabel(name, x, y)
            else hideHoverLabel()
          },
        }),
      ])
    } else {
      // Ansicht «Börsennotierte Firmen»: unverändert Aargau-spezifisch (Phase
      // 3 folgt). `companiesEntry` ist beim allerersten Umschalten auf diese
      // Ansicht noch nicht geladen (siehe `ensureCompaniesReady`) — die
      // Gemeindegrenzen erscheinen dann einen Render später nach, statt den
      // Wechsel selbst zu blockieren; die Firmensäulen (aus dem separat,
      // eigenständig geladenen `companies.json`) stehen sofort.
      const companiesEntry = cantonCache.get(meta.canton.code)
      handle.setLayers(
        [
          cantonsLayer,
          cantonBorderLayer,
          companiesEntry?.borderLayer,
          buildCompanyLayer(companies, mode, showCompanyPanel),
        ].filter((layer) => layer !== undefined),
      )
    }

    renderLegend({
      view,
      year:
        view === 'sichtbare'
          ? companyYear
          : level === 'kanton' && activeCanton
            ? activeCanton.gemeinde.meta.year
            : nationalYear,
      presentGroups:
        view === 'sichtbare'
          ? companyPresentGroups
          : level === 'kanton' && activeCanton
            ? activeCanton.presentGroups
            : kantonePresentGroups,
      scopeLabel:
        view === 'sichtbare'
          ? `Kanton ${meta.canton.name}`
          : level === 'kanton' && activeCanton
            ? `Kanton ${activeCanton.name}`
            : undefined,
    })
    renderNotices(view, level)
    renderBackControl(view === 'beschaeftigte' && level === 'kanton', exitToSwitzerland)
  }

  /** Betritt den Kanton der angeklickten Zeile der Schweiz-Stufe: schwenkt die
   *  Kamera sofort auf dessen bereits geladenen Umriss (kein Warten auf den
   *  Datenfetch), lädt parallel die beiden kantonsspezifischen Dateien und
   *  rendert erst danach um. */
  async function enterCanton(index: number) {
    const info = kantonRowInfo(index)
    const geometry = cantonGeometries[index]
    if (!info || !geometry) return
    const token = ++navToken
    handle.frameBounds(boundsOfGeometries([geometry]))
    const entry = await loadCantonEntry(info.bfsNr, info.code, info.name)
    if (token !== navToken) return // durch eine spätere Navigation überholt
    activeCanton = entry
    level = 'kanton'
    configureCanton(entry.name)
    render()
  }

  /** Zurück zur Schweiz-Übersicht — Klick auf `renderBackControl`s Knopf oder
   *  Escape (siehe `keydown`-Listener unten). Kein Fetch nötig: die
   *  Schweiz-Stufe ist seit dem Start bereits vollständig geladen. */
  function exitToSwitzerland() {
    if (level !== 'kanton') return
    navToken++ // invalidiert einen noch laufenden enterCanton()
    level = 'schweiz'
    activeCanton = null
    handle.frameBounds(nationalBounds)
    render()
  }

  /** Ansicht «Börsennotierte Firmen» braucht die Gemeindegrenzen des in
   *  `meta.canton` konfigurierten Kantons (heute Aargau) — über denselben
   *  Cache wie ein Kantonsbesuch in Ansicht «Beschäftigte» (Auftrag: „nothing
   *  may be fetched that is not needed" gilt auch hier, kein zweiter,
   *  separater Fetchpfad nur für diese Ansicht). No-op, wenn bereits
   *  geladen (z. B. weil zuvor in Ansicht «Beschäftigte» derselbe Kanton
   *  betreten wurde) oder wenn eine andere Ansicht aktiv ist. */
  async function ensureCompaniesReady() {
    if (view !== 'sichtbare') return
    if (cantonCache.has(meta.canton.code)) return
    await loadCantonEntry(meta.canton.bfs_nr, meta.canton.code, meta.canton.name)
    if (view === 'sichtbare') render()
  }

  // `createToggle` ruft `onChange` schon bei der Konstruktion einmal auf
  // (siehe toggle.ts, `sync()`) — das übernimmt den ersten Render, ein
  // zusätzlicher expliziter Aufruf hier wäre nur eine Wiederholung.
  const toggle = createToggle((newView, newMode) => {
    view = newView
    mode = newMode
    render()
    void ensureCompaniesReady()
  })
  ui?.appendChild(toggle)

  // Auftrag: „Escape should do it too" — derselbe Weg zurück wie der
  // Zurück-Knopf (`renderBackControl`), nur über die Tastatur. Nur aktiv,
  // wenn dieser Knopf auch sichtbar wäre (Kantonsstufe von «Beschäftigte»).
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && view === 'beschaeftigte' && level === 'kanton') {
      exitToSwitzerland()
    }
  })
}

start().catch((error: unknown) =>
  showError(`Daten konnten nicht geladen werden: ${String(error)}`),
)
