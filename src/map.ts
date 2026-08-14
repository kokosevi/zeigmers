import { MapboxOverlay } from '@deck.gl/mapbox'
import type { LayersList } from '@deck.gl/core'
import maplibregl from 'maplibre-gl'
import type { StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// Bis Change 3 lud die Karte zur Laufzeit die swisstopo-Vektorkacheln
// (66 Layer, davon 19 Beschriftungen und 30 Linien — Strassen, Gemeindenamen,
// alles, was die Aufgabe hier gerade nicht will). Die Anforderung ist eine
// reduzierte Karte ohne Gemeindenamen und Strassen, nur mit markierten
// Kantonsgrenzen — mit 66 grösstenteils unerwünschten Layern liesse sich das
// nicht durch Ausblenden erreichen, und einen Kantonsgrenzen-Layer führte der
// swisstopo-Stil ohnehin nicht. Diese leere Stil-Definition lässt MapLibre nur
// noch Pan/Rotate/Zoom und den WebGL-Kontext stellen; die Kantonsflächen
// zeichnet `layers/cantons.ts` selbst als deck.gl-Layer aus dem eigenen
// `ch_kantone.geojson` (ETL, `boundaries.build_cantons`). Kein Laufzeit-
// Request an einen fremden Dienst mehr — das in der Spezifikation (Abschnitt
// 10) genannte Ausfallrisiko "swisstopo-Vektorkacheln fallen aus" entfällt
// damit ersatzlos, siehe README.
const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'hintergrund',
      type: 'background',
      paint: { 'background-color': '#eef1f4' },
    },
  ],
}

// Von Hand auf den Kanton Aargau abgestimmt (Zentrum, Zoom, Neigung so, dass
// die ganze Kantonsfläche schräg von oben ins Bild passt). Anders als die
// Artefaktnamen leitet sich das NICHT automatisch aus `CANTON` her — ein
// Kantonswechsel im ETL ändert diese Werte nicht mit. Bei einem echten
// Kantonswechsel muss das hier neu justiert werden (siehe README, Abschnitt
// "Kantonswechsel").
export const INITIAL_VIEW = {
  center: [8.15, 47.4] as [number, number],
  zoom: 9.5,
  pitch: 50,
  bearing: -15,
}

// map.ts ist die einzige Stelle, die den vollen maplibregl.Map-Zustand kennt
// (siehe Task 11) — MapHandle gibt bewusst nur schmale Callbacks nach aussen,
// nie die Karteninstanz selbst, sonst könnte main.ts (oder jeder andere
// Aufrufer) den viewState direkt anfassen.
//
// `onZoom`/`getZoom` gehörten bis 2026-08-13 dazu — main.ts brauchte den Zoom
// ausschliesslich für die LOD-Überblendung zwischen Kanton-, Gemeinde- und
// Hektarstufe (siehe README). Mit deren Entfernung hat niemand mehr einen
// Aufrufer für Zoom-Callbacks; sie sind entfernt statt als toter Code auf
// einer bewusst schmal gehaltenen Schnittstelle liegen zu bleiben.
export interface MapHandle {
  setLayers(layers: LayersList): void
  onError(handler: (message: string) => void): void
}

export function createMap(container: HTMLElement): MapHandle {
  const map = new maplibregl.Map({
    container,
    style: BLANK_STYLE,
    center: INITIAL_VIEW.center,
    zoom: INITIAL_VIEW.zoom,
    pitch: INITIAL_VIEW.pitch,
    bearing: INITIAL_VIEW.bearing,
    maxPitch: 75,
    attributionControl: false,
  })

  // interleaved: deck.gl-Balken werden in denselben WebGL-Kontext gezeichnet,
  // damit die Basiskarte sie korrekt verdeckt.
  const overlay = new MapboxOverlay({ interleaved: true, layers: [] })
  map.addControl(overlay)
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')

  return {
    setLayers: (layers) => overlay.setProps({ layers }),
    // Bis Change 3 feuerte MapLibre `error` regelmässig für einzelne
    // fehlgeschlagene Kachel- oder Glyphen-Requests gegen den externen
    // swisstopo-Stil, während die Karte danach normal weiterlief — das durfte
    // keinen dauerhaften roten Fehlerbalken auslösen. `BLANK_STYLE` lädt
    // keine externe Ressource mehr, dieser Fall kann also nicht mehr
    // auftreten; die Wache bleibt trotzdem, für den unwahrscheinlicheren,
    // aber weiterhin möglichen Fall, dass der Basisstil selbst nie fertig
    // lädt (z. B. WebGL-Kontext nicht verfügbar) — das ist dann tatsächlich
    // ein Fall, in dem die Karte nicht funktioniert (siehe Abschluss-Review,
    // Finding I6).
    onError: (handler) => {
      map.on('error', (event) => {
        if (map.isStyleLoaded()) return
        handler(event.error?.message ?? 'unbekannter Fehler')
      })
    },
  }
}
