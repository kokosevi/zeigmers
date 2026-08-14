import './style.css'
import {
  loadCantons,
  loadMunicipalityBoundaries,
  joinCantonGeometry,
  joinMunicipalityGeometry,
} from './data/boundaries'
import { loadLevel, loadMeta } from './data/loader'
import { boundsOfGeometries } from './domain/bounds'
import { presentGroupsFromIndices } from './domain/legendGroups'
import { NOGA_UNKNOWN_INDEX } from './domain/noga.generated'
import type { ScaleMode } from './domain/scale'
import { buildCantonBorderLayer } from './layers/cantons'
import { buildMunicipalityBorderLayer } from './layers/many'
import { loadCompanies } from './layers/visible'
import { buildViewLayers, kantonRowInfo, type CantonEntry } from './layers/viewLayers'
import { createMap } from './map'
import { renderBackControl } from './ui/backControl'
import { showError } from './ui/error'
import { hideHoverLabel } from './ui/hoverLabel'
import { renderLegend } from './ui/legend'
import { formatGermanDate } from './ui/format'
import { renderNotices, type NoticeLevel } from './ui/notices'
import { configureCanton, hidePanel, showCompanyPanel, showMunicipalityPanel } from './ui/panel'
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

/** Zeigt einen Fehler aus einer fehlgeschlagenen Navigation (Kanton- oder
 *  Firmenansicht-Fetch) über den bestehenden `showError`-Weg an. Ohne diesen
 *  Aufrufer verschwand ein abgelehntes Promise stillschweigend — genau der
 *  Grund, warum sich ein fehlgeschlagener Fetch früher als „gar nichts
 *  passiert" zeigte statt als sichtbarer Fehler (siehe Bericht, Abschnitt
 *  „Fehlerpfad bei fehlgeschlagener Navigation"). */
function reportNavigationError(context: string): (error: unknown) => void {
  return (error) => showError(`${context}: ${String(error)}`)
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
  // wird hier geladen; die folgt erst, wenn ein Kanton tatsächlich betreten
  // wird (`loadCantonEntry` unten). `companies.json` (Ansicht «Börsennotierte
  // Firmen», seit Phase 3 national) lädt bereits hier vollständig mit — die
  // Ansicht braucht anders als «Beschäftigte» keinen Kanton mehr nachzuladen.
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
  // Nur die recherchierten Firmen tragen eine Branchenfarbe (eine Säule) —
  // die übrigen kotierten Titel erscheinen als neutrale Marker ohne
  // Branchenbezug (siehe `layers/visible.ts`) und sollen die Legende nicht
  // um Branchen erweitern, die keine Säule tatsächlich zeigt.
  const companyPresentGroups = presentGroupsFromIndices(
    companies.companies
      .filter((c) => c.researched)
      .map((c) => (c.placeholder ? NOGA_UNKNOWN_INDEX : c.nogaGroupIndex)),
  )
  // Phase 3: die Abdeckungsangabe der Karte selbst — zwei Zahlen, nicht nur
  // eine. "8 von 224 recherchiert" allein wäre unvollständig: wer die Marker
  // zählt, sieht `stats.count` (platziert, inkl. der unrecherchierten
  // Marker), nicht 224 — ein SIX-Titel ohne eindeutigen Zefix-Sitz erscheint
  // gar nicht auf der Karte (siehe `companies.build_artifact`). Beide Zahlen
  // stehen deshalb nebeneinander: wie viele der kotierten Titel überhaupt
  // gezeigt werden, und wie viele davon recherchiert sind. Aus den
  // Artefaktdaten zur Laufzeit berechnet, nicht hartkodiert — ein künftiger
  // Sync-/Recherche-Lauf zieht beide Zahlen automatisch nach. Erscheint als
  // `scopeLabel` in der Legende (`ui/legend.ts`).
  const coverageLabel =
    `${companies.stats.count} von ${companies.stats.totalListed} kotierten Titeln ` +
    `auf der Karte gezeigt, davon ${companies.stats.researched} recherchiert` +
    (companies.stats.sixRetrievedDate
      ? ` · SIX-Stand ${formatGermanDate(companies.stats.sixRetrievedDate)}`
      : '')

  // Kantonsgrenzen (Basiskarte, siehe `layers/cantons.ts`) — in beiden
  // Ansichten und auf beiden Stufen von «Beschäftigte» sichtbar (Auftrag),
  // deshalb einmalig gebaut. Die Kantonsflächen-Füllung selbst (mit dem
  // hervorgehobenen aktiven Kanton) baut `buildViewLayers` dagegen bei jedem
  // Render neu: welcher Kanton „aktiv" ist, ändert sich jetzt mit der
  // Navigation (siehe `activeHighlightBfsNr`), was vor Phase 2 nie der Fall
  // war.
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
    // `.finally()` gibt eine eigene, zweite Promise-Kette zurück, die bei
    // einem fehlgeschlagenen Fetch ebenfalls ablehnt — `promise` selbst (an
    // die Aufrufer oben zurückgegeben) trägt den eigentlichen Fehler bereits
    // und wird dort behandelt (`enterCanton`/`ensureCompaniesReady`, beide
    // über `reportNavigationError`). Ohne `.catch(() => {})` hier würde diese
    // zweite, nur für die Cache-Aufräumung gebaute Kette zusätzlich als
    // unbehandelte Ablehnung auffallen.
    promise.finally(() => cantonFetches.delete(code)).catch(() => {})
    return promise
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
    // Phase 3: Ansicht «Börsennotierte Firmen» ist national — kein
    // einzelner Kanton mehr hervorzuheben (bis Phase 2 war das immer
    // Aargau, unabhängig davon, wo die Firmen tatsächlich lagen).
    if (view === 'sichtbare') return null
    if (level === 'kanton' && activeCanton) return activeCanton.bfsNr
    return null
  }

  function documentTitle(): string {
    if (view === 'sichtbare') return 'Draufsicht — Börsennotierte Firmen Schweiz'
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
  // garantiert (Auftrag): die Karte bleibt exakt dort stehen, wo sie beim
  // Umschalten gerade war — seit Phase 3 ohnehin konsistent, weil auch diese
  // Ansicht national ist, keine Aargau-Sonderrolle mehr.
  const render = () => {
    // Verteidigung gegen einen Zustand, der laut obigem Kommentar nie
    // entstehen sollte (Kantonsstufe ohne geladenen Kanton) — fällt statt
    // eines leeren Renders auf die Schweiz-Stufe zurück. `buildViewLayers`
    // hat dieselbe Verteidigung nochmals eingebaut (siehe
    // `layers/viewLayers.ts`, `viewLayers.test.ts`), diese hier hält
    // zusätzlich `level` selbst konsistent (für `documentTitle`,
    // `renderBackControl`, den `keydown`-Listener).
    if (level === 'kanton' && !activeCanton) level = 'schweiz'

    hidePanel()
    hideHoverLabel()
    document.title = documentTitle()

    handle.setLayers(
      buildViewLayers({
        view,
        level,
        mode,
        cantonsGeo,
        activeBfsNr: activeHighlightBfsNr(),
        cantonBorderLayer,
        kantone,
        cantonGeometries,
        kantoneVmax,
        activeCanton,
        companies,
        onEnterCanton: (index) => {
          enterCanton(index).catch(reportNavigationError('Kanton konnte nicht geladen werden'))
        },
        onShowMunicipalityPanel: showMunicipalityPanel,
        onShowCompanyPanel: showCompanyPanel,
      }),
    )

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
          ? coverageLabel
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
   *  rendert erst danach um. Wirft weiter, statt den Fehler selbst zu
   *  schlucken — der Aufrufer (`onEnterCanton` in `render()`) hängt
   *  `reportNavigationError` an, damit ein fehlgeschlagener Fetch sichtbar
   *  wird statt „einfach nichts passiert". */
  async function enterCanton(index: number) {
    const info = kantonRowInfo(kantone, index)
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

  // Phase 3: Ansicht «Börsennotierte Firmen» ist national und braucht keinen
  // Kanton mehr nachzuladen — `companies` (aus `loadCompanies()`, oben beim
  // Start bereits vollständig geladen) reicht allein. Bis Phase 2 lud ein
  // Umschalten hierher zusätzlich die Aargauer Gemeindegrenzen nach
  // (`ensureCompaniesReady`); das entfällt ersatzlos, kein Fetch beim
  // Umschalten mehr nötig.

  // `createToggle` ruft `onChange` schon bei der Konstruktion einmal auf
  // (siehe toggle.ts, `sync()`) — das übernimmt den ersten Render, ein
  // zusätzlicher expliziter Aufruf hier wäre nur eine Wiederholung.
  const toggle = createToggle((newView, newMode) => {
    view = newView
    mode = newMode
    render()
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
