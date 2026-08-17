import './style.css'
import { startFirmen } from './karte/firmen'
import { StaleCompanyDataError } from './layers/visible'
import { showError } from './ui/error'

// `StaleCompanyDataError` (siehe `layers/visible.ts`, `parseCompanyData`)
// trägt bereits eine für sich lesbare, zutreffende Meldung — die generische
// «Daten konnten nicht geladen werden»-Vorsilbe wäre hier falsch, denn genau
// das ist nicht passiert: die Daten wurden geladen, sie sind nur älter als
// dieser Code. Jeder andere Fehler (Netzwerk, HTTP-Status, kaputtes JSON)
// bleibt bei der bisherigen, generischen Meldung — dort stimmt sie.
startFirmen().catch((error: unknown) =>
  showError(
    error instanceof StaleCompanyDataError
      ? error.message
      : `Daten konnten nicht geladen werden: ${String(error)}`,
  ),
)
