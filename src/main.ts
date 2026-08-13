import './style.css'
import { loadLevel, type Level } from './data/loader'
import { lodWeights } from './domain/lod'
import type { ScaleMode } from './domain/scale'
import { buildColumnLayer } from './layers/many'
import { buildCompanyLayer, loadCompanies } from './layers/visible'
import { createMap } from './map'
import { showError } from './ui/error'
import { renderLegend } from './ui/legend'
import { renderNotices } from './ui/notices'
import { configureAmbiguity, hidePanel, showCompanyPanel, showHectarePanel } from './ui/panel'
import { createToggle, DEFAULT_MODE, type ViewName } from './ui/toggle'

const LEVEL_NAMES = ['kanton', 'gemeinde', 'hektar'] as const

async function start() {
  const container = document.getElementById('map')
  if (!container) return showError('Kartencontainer #map fehlt im HTML.')
  const ui = document.getElementById('ui')

  const handle = createMap(container)
  handle.map.on('error', (event) =>
    showError(`Basiskarte: ${event.error?.message ?? 'unbekannter Fehler'}`),
  )

  const [loaded, companies] = await Promise.all([
    Promise.all(LEVEL_NAMES.map((n) => loadLevel(`ag_${n}`))),
    loadCompanies(),
  ])
  const levels = Object.fromEntries(
    LEVEL_NAMES.map((name, i) => [name, loaded[i]!]),
  ) as Record<(typeof LEVEL_NAMES)[number], Level>

  // Ermöglicht dem Gemeindepanel, die Überschätzung durch Wert-4-Rundung je
  // Gemeinde statt nur kantonsweit auszuweisen (siehe panel.ts).
  configureAmbiguity(levels.hektar)

  // Eine gemeinsame Bezugsgroesse fuer alle drei Stufen von Ansicht B: das
  // Kantonstotal. Nur so sind Balkenhoehen ueber die Stufen hinweg vergleichbar
  // und der Uebergang beim Zoomen bleibt stetig.
  const sharedVmax = levels.kanton.meta.stats.max
  const statentYear = levels.kanton.meta.year
  // Firmen können unterschiedliche Geschäftsjahre ausweisen; die Legende zeigt
  // eine einzelne Zahl, deshalb das jüngste erfasste Jahr.
  const companyYear =
    Math.max(0, ...companies.companies.map((c) => c.fiscalYear ?? 0)) || statentYear

  let view: ViewName = 'viele'
  let mode: ScaleMode = DEFAULT_MODE[view]
  let zoom = handle.getZoom()

  // Zustand ist (view, mode, zoom). Jede Änderung an irgendeinem der drei
  // rendert komplett neu: Layer, Legende, Pflichthinweis. Der viewState der
  // Karte wird hier nirgends angefasst — das ist Sache von map.ts, und genau
  // das lässt die Kameraposition beim Umschalten unverändert.
  const render = () => {
    hidePanel()

    if (view === 'viele') {
      const weights = lodWeights(zoom)
      handle.setLayers(
        LEVEL_NAMES.map((name) =>
          buildColumnLayer(name, {
            level: levels[name],
            vmax: sharedVmax,
            mode,
            opacity: weights[name],
            visible: weights[name] > 0.01,
            onClick: (index) => showHectarePanel(levels[name], index),
          }),
        ),
      )
    } else {
      handle.setLayers([buildCompanyLayer(companies, mode, showCompanyPanel)])
    }

    renderLegend({
      view,
      mode,
      year: view === 'viele' ? statentYear : companyYear,
      vmax: view === 'viele' ? sharedVmax : companies.stats.max,
      ambiguousCells: view === 'viele' ? levels.hektar.meta.stats.ambiguousCells : 0,
      overstatementMax: view === 'viele' ? levels.hektar.meta.stats.overstatementMax : 0,
    })
    renderNotices(view)
  }

  const toggle = createToggle((newView, newMode) => {
    view = newView
    mode = newMode
    render()
  })
  ui?.appendChild(toggle)

  handle.onZoom((newZoom) => {
    zoom = newZoom
    render()
  })
}

start().catch((error: unknown) =>
  showError(`Daten konnten nicht geladen werden: ${String(error)}`),
)
