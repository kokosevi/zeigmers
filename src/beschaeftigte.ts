import './style.css'
import { startBeschaeftigte } from './karte/beschaeftigte'
import { showError } from './ui/error'

startBeschaeftigte().catch((error: unknown) =>
  showError(`Daten konnten nicht geladen werden: ${String(error)}`),
)
