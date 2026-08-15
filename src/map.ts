import { MapboxOverlay } from '@deck.gl/mapbox'
import type { LayersList } from '@deck.gl/core'
import maplibregl from 'maplibre-gl'
import type { StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { LngLatBounds } from './domain/bounds'
import { mapLightingEffect } from './layers/lighting'

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
// Hintergrundfarbe = `--grund` aus style.css (kühles, blasses Blaugrau, kein
// Weiss) — hier als Literal dupliziert, weil MapLibres Stil kein CSS liest;
// bei einer Token-Änderung muss dieser Wert von Hand mitgezogen werden.
const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'hintergrund',
      type: 'background',
      paint: { 'background-color': '#E8EDF2' },
    },
  ],
}

// Phase 2 («nationale Navigation»): mit 26 Kantonen gibt es keine einzelne
// „richtige" Kamera mehr, die sich von Hand justieren liesse wie zuvor für
// Aargau allein. `center`/`zoom` unten sind deshalb nur noch ein grober,
// schweizweiter Platzhalter für den Moment zwischen `new maplibregl.Map(...)`
// (die synchron irgendeine Kamera braucht) und dem ersten `frameBounds()`-
// Aufruf in `karte/basis.ts`s `createBasis()`, der die tatsächliche Schweiz-
// Rahmung aus den 26 geladenen Kantonsgeometrien herleitet (`domain/bounds.ts`,
// `boundsOfGeometries`) — dieser zweite Schritt läuft mit `instant: true`
// (siehe `frameBounds` unten), der Platzhalter ist also nie sichtbar länger
// als die Ladezeit von `ch_kantone.geojson`. `pitch`/`bearing` bleiben die
// einzigen weiterhin von Hand gewählten Werte: dieselbe Neigung/Drehung gilt
// für jede hergeleitete Kamera (Schweiz wie jeder einzelne Kanton), nicht nur
// für Aargau.
export const INITIAL_VIEW = {
  center: [8.3, 46.8] as [number, number],
  zoom: 7.3,
  pitch: 50,
  bearing: -15,
}

// Kamera-Padding für `frameBounds` (Pixel je Seite) — grosszügig genug, dass
// die UI-Chrome (Steuerung oben links, Legende/Hinweis unten, siehe
// `style.css`) eine gerahmte Fläche nicht verdeckt, und dass die durch
// `pitch` gestauchte Ferne (siehe `FitBoundsOptions`, die den `pitch` selbst
// nicht in die Bounds-Rechnung einbezieht) nicht am Bildrand abgeschnitten
// wirkt. Von Hand gewählt, nicht hergeleitet — wie stark eine Kantonsfläche
// dadurch tatsächlich ausgefüllt wird, ist unverifiziert (siehe Bericht).
const FRAME_PADDING_PX = 64
const FRAME_DURATION_MS = 900

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

// map.ts ist die einzige Stelle, die den vollen maplibregl.Map-Zustand kennt
// (siehe Task 11) — MapHandle gibt bewusst nur schmale Callbacks nach aussen,
// nie die Karteninstanz selbst, sonst könnte `karte/basis.ts` (oder jeder
// andere Aufrufer) den viewState direkt anfassen.
//
// `onZoom`/`getZoom` gehörten bis 2026-08-13 dazu — der damalige, noch
// ungeteilte Seiteneinstieg (heute aufgeteilt in `karte/basis.ts`,
// `karte/firmen.ts`, `karte/beschaeftigte.ts`) brauchte den Zoom
// ausschliesslich für die LOD-Überblendung zwischen Kanton-, Gemeinde- und
// Hektarstufe (siehe README). Mit deren Entfernung hat niemand mehr einen
// Aufrufer für Zoom-Callbacks; sie sind entfernt statt als toter Code auf
// einer bewusst schmal gehaltenen Schnittstelle liegen zu bleiben.
export interface MapHandle {
  setLayers(layers: LayersList): void
  onError(handler: (message: string) => void): void
  /** Bewegt die Kamera so, dass `bounds` (Lng/Lat, siehe `domain/bounds.ts`)
   *  im Bild liegt, bei fester `pitch`/`bearing` aus `INITIAL_VIEW` — die
   *  Herleitung „von der Geometrie, nicht von 26 Handpositionen" (Auftrag).
   *  `instant: true` (Erstladung der Schweiz-Übersicht) und ein aktives
   *  `prefers-reduced-motion` überspringen die Animation (`duration: 0`);
   *  sonst wird über `FRAME_DURATION_MS` sanft geschwenkt. */
  frameBounds(bounds: LngLatBounds, options?: { instant?: boolean }): void
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

  // `interleaved: true` diente dazu, deck.gl-Layer in MapLibres eigenen
  // Layer-Stack einzufügen, damit 3D-Geometrie der Basiskarte (Gebäude,
  // Gelände) unsere Balken korrekt verdecken konnte — solange die
  // swisstopo-Vektorkacheln als Basiskarte liefen, war das aktiv. Seit
  // Change 3 gibt es keine Basiskarten-Geometrie mehr, mit der interleaved
  // werden müsste (`BLANK_STYLE` hat nur eine einfarbige `background`-Ebene,
  // keine 3D-Inhalte) — der Modus kostet dann nur eine nie im Browser
  // geprüfte Annahme über das Zusammenspiel mit einem leeren Stil, ohne
  // etwas dafür zu bekommen. `false` ist der unzweideutig sichere Weg: deck.gl
  // zeichnet in einen eigenen Canvas über der Karte, unabhängig vom
  // MapLibre-Stilinhalt.
  // Ein gemeinsamer LightingEffect für Kantons- und Gemeindeflächen (visueller
  // Redesign, siehe `layers/lighting.ts`) — beide Layer haben jetzt
  // `material` aktiv statt `false`, ohne diesen Effect gäbe es aber nur
  // deck.gls Default-Licht, nicht die hier bewusst gewählte Richtung/Stärke.
  const overlay = new MapboxOverlay({
    interleaved: false,
    layers: [],
    effects: [mapLightingEffect],
  })
  map.addControl(overlay)
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')

  return {
    setLayers: (layers) => overlay.setProps({ layers }),
    frameBounds: (bounds, options) => {
      const instant = options?.instant === true || prefersReducedMotion()
      map.fitBounds(bounds, {
        pitch: INITIAL_VIEW.pitch,
        bearing: INITIAL_VIEW.bearing,
        padding: FRAME_PADDING_PX,
        duration: instant ? 0 : FRAME_DURATION_MS,
      })
    },
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
