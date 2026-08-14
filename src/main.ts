import './style.css'
import { loadCantons, loadMunicipalityBoundaries, joinMunicipalityGeometry } from './data/boundaries'
import { loadLevel, loadMeta } from './data/loader'
import { municipalityOverstatementStats } from './domain/overstatement'
import type { ScaleMode } from './domain/scale'
import { buildCantonsLayer } from './layers/cantons'
import { buildMunicipalityLayer } from './layers/many'
import { buildCompanyLayer, loadCompanies } from './layers/visible'
import { createMap } from './map'
import { showError } from './ui/error'
import { hideHoverLabel, showHoverLabel } from './ui/hoverLabel'
import { renderLegend } from './ui/legend'
import { renderNotices } from './ui/notices'
import {
  configureCanton,
  hidePanel,
  municipalityName,
  showCompanyPanel,
  showMunicipalityPanel,
} from './ui/panel'
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
  // `boundaries`/`cantons` sind neu (Change 2/3): die Gemeindepolygone für die
  // extrudierten Flächen in Ansicht B und die Kantonsflächen für die
  // selbstgezeichnete Basiskarte, beide als eigene `*.geojson`-Artefakte.
  const [gemeinde, companies, boundaries, cantons] = await Promise.all([
    loadLevel(`${prefix}_gemeinde`),
    loadCompanies(),
    loadMunicipalityBoundaries(prefix),
    loadCantons(),
  ])

  // Join einmal beim Laden (siehe `data/boundaries.ts`), nicht bei jedem
  // Render: `many.ts` bekommt fertige Geometrien je Zeile und bleibt eine
  // reine `(daten, uiState) → Layer`-Funktion.
  const municipalityGeometries = joinMunicipalityGeometry(gemeinde, boundaries)
  const cantonsLayer = buildCantonsLayer({ data: cantons, activeBfsNr: meta.canton.bfs_nr })

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

  let view: ViewName = 'beschaeftigte'
  let mode: ScaleMode = DEFAULT_MODE[view]

  // Zustand ist (view, mode). Jede Änderung an einem der beiden rendert
  // komplett neu: Layer, Legende, Pflichthinweis. Der viewState der Karte wird
  // hier nirgends angefasst — das ist Sache von map.ts, und genau das lässt
  // die Kameraposition beim Umschalten unverändert.
  //
  // Die Kantonsflächen (`cantonsLayer`) sind Basiskarte, kein Ansichtsinhalt —
  // sie werden in beiden Ansichten zuunterst gezeichnet, unabhängig vom Toggle.
  const render = () => {
    hidePanel()
    // Ein Ansichts- oder Skalenwechsel baut den Layer neu (siehe unten) — ein
    // Hover-Label, das zur vorigen Ansicht gehörte, muss dabei mit
    // verschwinden, sonst zeigt Ansicht A kurz noch den Namen einer
    // Gemeinde aus Ansicht B.
    hideHoverLabel()

    if (view === 'beschaeftigte') {
      handle.setLayers([
        cantonsLayer,
        buildMunicipalityLayer('gemeinde', {
          level: gemeinde,
          geometries: municipalityGeometries,
          vmax,
          mode,
          opacity: 1,
          visible: true,
          onClick: (index) => showMunicipalityPanel(gemeinde, index),
          // Change 4: Hover ändert nur Farbe (via `autoHighlight` in
          // `many.ts`) und zeigt den Namen in einem eigenen DOM-Label — der
          // Klick auf dieselbe Fläche öffnet weiterhin unverändert das volle
          // Panel (`onClick` oben), Hover ersetzt das nicht.
          onHover: (index, x, y) => {
            if (index === null) return hideHoverLabel()
            const name = municipalityName(gemeinde, index)
            if (name) showHoverLabel(name, x, y)
            else hideHoverLabel()
          },
        }),
      ])
    } else {
      handle.setLayers([cantonsLayer, buildCompanyLayer(companies, mode, showCompanyPanel)])
    }

    renderLegend({
      view,
      mode,
      year: view === 'beschaeftigte' ? statentYear : companyYear,
      vmax: view === 'beschaeftigte' ? vmax : companies.stats.max,
      ambiguousCells: view === 'beschaeftigte' ? gemeinde.meta.stats.ambiguousCells : 0,
      overstatementPct: view === 'beschaeftigte' ? overstatementPct : { medianPct: 0, maxPct: 0 },
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
