import './style.css'
import { createMap } from './map'
import { showError } from './ui/error'

const container = document.getElementById('map')
if (!container) {
  showError('Kartencontainer #map fehlt im HTML.')
} else {
  const handle = createMap(container)
  handle.map.on('error', (event) => {
    showError(`Basiskarte konnte nicht geladen werden: ${event.error?.message ?? 'unbekannt'}`)
  })
}
