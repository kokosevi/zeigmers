import { joinMunicipalityGeometry, loadMunicipalityBoundaries } from '../data/boundaries'
import { loadLevel } from '../data/loader'
import { boundsOfGeometries } from '../domain/bounds'
import { presentGroupsFromIndices } from '../domain/legendGroups'
import type { ScaleMode } from '../domain/scale'
import { buildMunicipalityBorderLayer } from '../layers/many'
import { buildViewLayers, kantonRowInfo, type CantonEntry } from '../layers/viewLayers'
import { renderBackControl } from '../ui/backControl'
import { showError } from '../ui/error'
import { hideHoverLabel } from '../ui/hoverLabel'
import { renderLegend } from '../ui/legend'
import { renderNotices, type NoticeLevel } from '../ui/notices'
import { configureCanton, hidePanel, showMunicipalityPanel } from '../ui/panel'
import { createBasis, mountNav } from './basis'

/** Zeigt einen Fehler aus einer fehlgeschlagenen Kanton-Navigation über den
 *  bestehenden `showError`-Weg an. Ohne diesen Aufrufer verschwand ein
 *  abgelehntes Promise stillschweigend — genau der Grund, warum sich ein
 *  fehlgeschlagener Fetch früher als „gar nichts passiert" zeigte statt als
 *  sichtbarer Fehler. */
function reportNavigationError(context: string): (error: unknown) => void {
  return (error) => showError(`${context}: ${String(error)}`)
}

/** Ansicht «Beschäftigte» — zwei Stufen: `'schweiz'` (26 Kantonsbalken,
 *  Startzustand) und `'kanton'` (die Gemeinden des zuletzt betretenen
 *  Kantons). Zwei getrennte Bildschirme, kein Zoom-/LOD-Überblenden zwischen
 *  ihnen (Auftrag) — ein Klick auf einen Kantonsbalken wechselt den
 *  Bildschirm, löst keine Kameraüberblendung „hinein" aus. */
export async function startBeschaeftigte(): Promise<void> {
  const basis = await createBasis()
  const {
    handle,
    kantone,
    cantonsGeo,
    cantonGeometries,
    cantonBorderLayer,
    nationalBounds,
    lakesGeo,
  } = basis

  // Titel der Gemeindezelle im Panel — nur diese Ansicht zeigt Gemeinden,
  // deshalb steht der Aufruf hier und nicht im geteilten `createBasis`.
  configureCanton(basis.meta.canton.name)

  const kantoneVmax = kantone.meta.stats.max
  const nationalYear = kantone.meta.year
  const kantonePresentGroups = presentGroupsFromIndices(kantone.arrays.noga)

  // Pro Kanton einmal geladen, danach für die Sitzung im Speicher (Auftrag:
  // „re-entering a canton already visited must not fetch again"). 26 Kantone
  // vollständig geladen wären zusammen rund 12 MB — für eine Kartenanwendung
  // in einem einzelnen Tab unkritisch; ein Verdrängungs-Cache hätte hier nur
  // Komplexität ohne tatsächlichen Speicherdruck gelöst. `cantonFetches`
  // dedupliziert gleichzeitige Anfragen für denselben Kanton (z. B. ein
  // schneller Doppelklick).
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
    // einem fehlgeschlagenen Fetch ebenfalls ablehnt — `promise` selbst trägt
    // den eigentlichen Fehler bereits und wird beim Aufrufer behandelt. Ohne
    // `.catch(() => {})` hier würde diese zweite, nur für die
    // Cache-Aufräumung gebaute Kette zusätzlich als unbehandelte Ablehnung
    // auffallen.
    promise.finally(() => cantonFetches.delete(code)).catch(() => {})
    return promise
  }

  let mode: ScaleMode = 'logarithmisch'
  let level: NoticeLevel = 'schweiz'
  let activeCanton: CantonEntry | null = null
  // Wird bei jeder Navigation erhöht — ein `enterCanton`-Aufruf, der erst nach
  // einer inzwischen überholten Navigation (z. B. Escape zurück zur Schweiz,
  // oder ein Klick auf einen anderen Kanton) fertig lädt, erkennt daran, dass
  // er nicht mehr der aktuelle ist, und lässt `level`/`activeCanton`
  // unangetastet.
  let navToken = 0

  // Zustand ist (mode, level, activeCanton). Jede Änderung rendert komplett
  // neu: Layer, Legende, Pflichthinweis, Titel, Zurück-Kontrolle. Der
  // viewState der Karte wird hier nirgends angefasst — Kamerabewegungen laufen
  // ausschliesslich über `handle.frameBounds()` in `enterCanton`/
  // `exitToSwitzerland`, nie in `render()` selbst.
  const render = () => {
    // Verteidigung gegen einen Zustand, der nie entstehen sollte
    // (Kantonsstufe ohne geladenen Kanton) — fällt statt eines leeren Renders
    // auf die Schweiz-Stufe zurück. `buildViewLayers` hat dieselbe
    // Verteidigung nochmals eingebaut (siehe `viewLayers.test.ts`), diese hier
    // hält zusätzlich `level` selbst konsistent (für den Titel,
    // `renderBackControl`, den `keydown`-Listener).
    if (level === 'kanton' && !activeCanton) level = 'schweiz'

    hidePanel()
    hideHoverLabel()
    document.title =
      level === 'kanton' && activeCanton
        ? `zeigmers — Beschäftigte Kanton ${activeCanton.name}`
        : 'zeigmers — Beschäftigte Schweiz'

    handle.setLayers(
      buildViewLayers({
        view: 'beschaeftigte',
        mode,
        cantonsGeo,
        activeBfsNr: level === 'kanton' && activeCanton ? activeCanton.bfsNr : null,
        cantonBorderLayer,
        lakes: lakesGeo,
        level,
        kantone,
        cantonGeometries,
        kantoneVmax,
        activeCanton,
        onEnterCanton: (index) => {
          enterCanton(index).catch(reportNavigationError('Kanton konnte nicht geladen werden'))
        },
        onShowMunicipalityPanel: showMunicipalityPanel,
      }),
    )

    renderLegend({
      view: 'beschaeftigte',
      year: level === 'kanton' && activeCanton ? activeCanton.gemeinde.meta.year : nationalYear,
      presentGroups:
        level === 'kanton' && activeCanton ? activeCanton.presentGroups : kantonePresentGroups,
      scopeLabel: level === 'kanton' && activeCanton ? `Kanton ${activeCanton.name}` : undefined,
    })
    // Diese Seite lädt `companies.json` nicht (siehe `karte/basis.ts`,
    // `createBasis`-Dokumentation) und hat deshalb weder eine Kennzahl noch
    // `stats.revenueInChf`/`stats.profitInChf` zur Hand — unbeachtlich,
    // `renderNotices` liest beide Parameter nur bei `view === 'sichtbare'`
    // (siehe dort). `'umsatz'`/`true` sind hier neutrale Platzhalter, kein
    // Fakt über diese Ansicht.
    renderNotices('beschaeftigte', level, 'umsatz', true)
    renderBackControl(level === 'kanton', exitToSwitzerland)
  }

  /** Betritt den Kanton der angeklickten Zeile der Schweiz-Stufe: schwenkt die
   *  Kamera sofort auf dessen bereits geladenen Umriss (kein Warten auf den
   *  Datenfetch), lädt parallel die beiden kantonsspezifischen Dateien und
   *  rendert erst danach um. Wirft weiter, statt den Fehler selbst zu
   *  schlucken — der Aufrufer hängt `reportNavigationError` an. */
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
   *  Escape. Kein Fetch nötig: die Schweiz-Stufe ist seit dem Start geladen. */
  function exitToSwitzerland() {
    if (level !== 'kanton') return
    navToken++ // invalidiert einen noch laufenden enterCanton()
    level = 'schweiz'
    activeCanton = null
    handle.frameBounds(nationalBounds)
    render()
  }

  // Weder `metrics` noch `orgForms`: diese Seite kennt keine Kennzahlwahl
  // (die Säule ist immer die Kopfzahl der Ebene) und keine Organisationsform
  // (die gibt es nur bei den Firmen) — deshalb erscheinen die beiden neuen
  // Gruppen aus `ui/nav.ts` hier nicht (siehe `NavOptions`).
  mountNav({
    view: 'beschaeftigte',
    onModeChange: (newMode) => {
      mode = newMode
      render()
    },
  })

  // Auftrag: „Escape should do it too" — derselbe Weg zurück wie der
  // Zurück-Knopf, nur über die Tastatur. Nur wirksam, wenn dieser Knopf auch
  // sichtbar wäre (Kantonsstufe).
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && level === 'kanton') exitToSwitzerland()
  })
}
