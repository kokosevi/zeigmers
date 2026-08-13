import { MapboxOverlay } from '@deck.gl/mapbox'
import type { LayersList } from '@deck.gl/core'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const BASEMAP_STYLE =
  'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json'

export const INITIAL_VIEW = {
  center: [8.15, 47.4] as [number, number],
  zoom: 9.5,
  pitch: 50,
  bearing: -15,
}

export interface MapHandle {
  readonly map: maplibregl.Map
  setLayers(layers: LayersList): void
  onZoom(handler: (zoom: number) => void): void
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
    map,
    setLayers: (layers) => overlay.setProps({ layers }),
    onZoom: (handler) => {
      map.on('zoom', () => handler(map.getZoom()))
      handler(map.getZoom())
    },
    getZoom: () => map.getZoom(),
  }
}
