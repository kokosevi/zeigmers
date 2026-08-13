import './style.css'
import { loadLevel } from './data/loader'
import { buildColumnLayer } from './layers/many'
import { createMap } from './map'
import { showError } from './ui/error'

async function start() {
  const container = document.getElementById('map')
  if (!container) return showError('Kartencontainer #map fehlt im HTML.')

  const handle = createMap(container)
  handle.map.on('error', (event) =>
    showError(`Basiskarte: ${event.error?.message ?? 'unbekannter Fehler'}`),
  )

  const gemeinde = await loadLevel('ag_gemeinde')
  handle.setLayers([
    buildColumnLayer('gemeinde', {
      level: gemeinde,
      mode: 'log',
      opacity: 1,
      visible: true,
      onClick: (index) => {
        const name = gemeinde.meta.gemeinden?.[gemeinde.arrays.gemeindeIdx![index]!]?.name
        console.log(name, gemeinde.arrays.values[index])
      },
    }),
  ])
}

start().catch((error: unknown) =>
  showError(`Daten konnten nicht geladen werden: ${String(error)}`),
)
