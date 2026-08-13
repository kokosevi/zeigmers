import { MapboxOverlay } from '@deck.gl/mapbox'
import type { LayersList } from '@deck.gl/core'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const BASEMAP_STYLE =
  'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json'

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
// Aufrufer) den viewState direkt anfassen und die hier garantierte
// Zoom-only-Kopplung umgehen.
export interface MapHandle {
  setLayers(layers: LayersList): void
  onZoom(handler: (zoom: number) => void): void
  onError(handler: (message: string) => void): void
  getZoom(): number
}

export function createMap(container: HTMLElement): MapHandle {
  const map = new maplibregl.Map({
    container,
    style: BASEMAP_STYLE,
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
    onZoom: (handler) => {
      map.on('zoom', () => handler(map.getZoom()))
      handler(map.getZoom())
    },
    // MapLibre feuert `error` auch für einzelne fehlgeschlagene Kachel- oder
    // Glyphen-Requests, während die Karte danach normal weiterläuft — das darf
    // keinen dauerhaften roten Fehlerbalken auslösen. Nur melden, wenn der
    // Basisstil selbst nie fertig geladen hat: das ist der einzige Fall, in
    // dem die Karte tatsächlich nicht funktioniert (siehe Abschluss-Review,
    // Finding I6).
    onError: (handler) => {
      map.on('error', (event) => {
        if (map.isStyleLoaded()) return
        handler(event.error?.message ?? 'unbekannter Fehler')
      })
    },
    getZoom: () => map.getZoom(),
  }
}
