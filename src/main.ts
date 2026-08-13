import './style.css'
import { loadLevel, type Level } from './data/loader'
import { lodWeights } from './domain/lod'
import type { ScaleMode } from './domain/scale'
import { buildColumnLayer } from './layers/many'
import { createMap } from './map'
import { showError } from './ui/error'

const LEVEL_NAMES = ['kanton', 'gemeinde', 'hektar'] as const

async function start() {
  const container = document.getElementById('map')
  if (!container) return showError('Kartencontainer #map fehlt im HTML.')

  const handle = createMap(container)
  handle.map.on('error', (event) =>
    showError(`Basiskarte: ${event.error?.message ?? 'unbekannter Fehler'}`),
  )

  const loaded = await Promise.all(LEVEL_NAMES.map((n) => loadLevel(`ag_${n}`)))
  const levels = Object.fromEntries(
    LEVEL_NAMES.map((name, i) => [name, loaded[i]!]),
  ) as Record<(typeof LEVEL_NAMES)[number], Level>

  const mode: ScaleMode = 'log'

  // Eine gemeinsame Bezugsgroesse fuer alle drei Stufen: das Kantonstotal.
  // Nur so sind Balkenhoehen ueber die Stufen hinweg vergleichbar und der
  // Uebergang bleibt stetig.
  const sharedVmax = levels.kanton.meta.stats.max

  const render = (zoom: number) => {
    const weights = lodWeights(zoom)
    handle.setLayers(
      LEVEL_NAMES.map((name) =>
        buildColumnLayer(name, {
          level: levels[name],
          vmax: sharedVmax,
          mode,
          opacity: weights[name],
          visible: weights[name] > 0.01,
        }),
      ),
    )
  }

  handle.onZoom(render)
}

start().catch((error: unknown) =>
  showError(`Daten konnten nicht geladen werden: ${String(error)}`),
)
