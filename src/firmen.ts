import './style.css'
import { startFirmen } from './karte/firmen'
import { showError } from './ui/error'

startFirmen().catch((error: unknown) =>
  showError(`Daten konnten nicht geladen werden: ${String(error)}`),
)
