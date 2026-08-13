import './style.css'
import { loadLevel, loadMeta, type Level } from './data/loader'
import { activeLevel, lodWeights } from './domain/lod'
import type { ScaleMode } from './domain/scale'
import { buildColumnLayer } from './layers/many'
import { buildCompanyLayer, loadCompanies } from './layers/visible'
import { createMap } from './map'
import { showError } from './ui/error'
import { renderLegend } from './ui/legend'
import { renderNotices } from './ui/notices'
import { configureCanton, hidePanel, showCompanyPanel, showHectarePanel } from './ui/panel'
import { createToggle, DEFAULT_MODE, type ViewName } from './ui/toggle'

const LEVEL_NAMES = ['kanton', 'gemeinde', 'hektar'] as const

async function start() {
  const container = document.getElementById('map')
  if (!container) return showError('Kartencontainer #map fehlt im HTML.')
  const ui = document.getElementById('ui')

  const handle = createMap(container)
  handle.onError((message) => showError(`Basiskarte: ${message}`))

  // meta.json zuerst: es trägt den Kanton (Code fürs Artefakt-Präfix, Name
  // für Titel und Panel) und wird bislang von niemandem gelesen, obwohl das
  // ETL es bei jedem Lauf schreibt. Ohne diesen Schritt bliebe ein
  // Kantonswechsel auf `ag_*`-Dateinamen hängen, egal was `CANTON` im ETL sagt.
  const meta = await loadMeta()
  const prefix = meta.canton.code.toLowerCase()
  document.title = `Draufsicht — Wirtschaftskarte Kanton ${meta.canton.name}`
  configureCanton(meta.canton.name)

  const [loaded, companies] = await Promise.all([
    Promise.all(LEVEL_NAMES.map((n) => loadLevel(`${prefix}_${n}`))),
    loadCompanies(),
  ])
  const levels = Object.fromEntries(
    LEVEL_NAMES.map((name, i) => [name, loaded[i]!]),
  ) as Record<(typeof LEVEL_NAMES)[number], Level>

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

    const dominant = activeLevel(zoom)

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
      // Die geteilte Kantons-vmax macht die Legenden-Stützwerte im linearen
      // Modus auf Gemeinde-/Hektarebene unlesbar (jede Zahl dort liegt um
      // Grössenordnungen unter dem Kantonstotal) — die aktuell dominante
      // Stufe liefert deshalb zusätzlich ihr eigenes Maximum (siehe I5).
      activeLevel:
        view === 'viele' ? { level: dominant, max: levels[dominant].meta.stats.max } : undefined,
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
