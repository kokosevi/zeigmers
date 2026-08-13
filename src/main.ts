import './style.css'
import { loadLevel, loadMeta } from './data/loader'
import { municipalityOverstatementStats } from './domain/overstatement'
import type { ScaleMode } from './domain/scale'
import { buildColumnLayer } from './layers/many'
import { buildCompanyLayer, loadCompanies } from './layers/visible'
import { createMap } from './map'
import { showError } from './ui/error'
import { renderLegend } from './ui/legend'
import { renderNotices } from './ui/notices'
import { configureCanton, hidePanel, showCompanyPanel, showMunicipalityPanel } from './ui/panel'
import { createToggle, DEFAULT_MODE, type ViewName } from './ui/toggle'

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

  // Ansicht B zeigt nur noch die Gemeindestufe, bei jedem Zoom gleich — die
  // Kanton- und Hektarstufe wurden am 2026-08-13 verworfen (siehe README).
  const [gemeinde, companies] = await Promise.all([
    loadLevel(`${prefix}_gemeinde`),
    loadCompanies(),
  ])

  // Bezugsgrösse für Ansicht B ist jetzt das Gemeindemaximum (Aarau), nicht
  // mehr das Kantonstotal: ohne die anderen beiden Stufen gäbe es sonst keinen
  // Balken, der die volle Höhe je erreicht — ein Fünftel des Höhenbudgets wäre
  // für einen nie gezeichneten Kantonsturm reserviert.
  const vmax = gemeinde.meta.stats.max
  // Median/Maximum der Überschätzung je Gemeinde für die Legende — dieselbe
  // Grösse wie im Pflichthinweis (`ui/notices.ts`), hier aber live berechnet
  // statt als AG-2023-Literal (siehe `domain/overstatement.ts`).
  const overstatementPct = municipalityOverstatementStats(gemeinde)
  const statentYear = gemeinde.meta.year
  // Firmen können unterschiedliche Geschäftsjahre ausweisen; die Legende zeigt
  // eine einzelne Zahl, deshalb das jüngste erfasste Jahr.
  const companyYear =
    Math.max(0, ...companies.companies.map((c) => c.fiscalYear ?? 0)) || statentYear

  let view: ViewName = 'viele'
  let mode: ScaleMode = DEFAULT_MODE[view]

  // Zustand ist (view, mode). Jede Änderung an einem der beiden rendert
  // komplett neu: Layer, Legende, Pflichthinweis. Der viewState der Karte wird
  // hier nirgends angefasst — das ist Sache von map.ts, und genau das lässt
  // die Kameraposition beim Umschalten unverändert.
  const render = () => {
    hidePanel()

    if (view === 'viele') {
      handle.setLayers([
        buildColumnLayer('gemeinde', {
          level: gemeinde,
          vmax,
          mode,
          opacity: 1,
          visible: true,
          onClick: (index) => showMunicipalityPanel(gemeinde, index),
        }),
      ])
    } else {
      handle.setLayers([buildCompanyLayer(companies, mode, showCompanyPanel)])
    }

    renderLegend({
      view,
      mode,
      year: view === 'viele' ? statentYear : companyYear,
      vmax: view === 'viele' ? vmax : companies.stats.max,
      ambiguousCells: view === 'viele' ? gemeinde.meta.stats.ambiguousCells : 0,
      overstatementPct: view === 'viele' ? overstatementPct : { medianPct: 0, maxPct: 0 },
    })
    renderNotices(view)
  }

  // `createToggle` ruft `onChange` schon bei der Konstruktion einmal auf
  // (siehe toggle.ts, `sync()`) — das übernimmt den ersten Render, ein
  // zusätzlicher expliziter Aufruf hier wäre nur eine Wiederholung.
  const toggle = createToggle((newView, newMode) => {
    view = newView
    mode = newMode
    render()
  })
  ui?.appendChild(toggle)
}

start().catch((error: unknown) =>
  showError(`Daten konnten nicht geladen werden: ${String(error)}`),
)
