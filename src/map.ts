import { MapboxOverlay } from '@deck.gl/mapbox'
import type { LayersList } from '@deck.gl/core'
import maplibregl from 'maplibre-gl'
import type { PaddingOptions, StyleSpecification } from 'maplibre-gl'
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

// Kamera-Padding für `frameBounds`, je Seite einzeln (Pixel) — hergeleitet
// aus der tatsächlichen UI-Chrome in `style.css`, nicht mehr ein einzelner,
// von Hand gewählter Wert für alle vier Seiten (siehe Bericht Aufgabe 17).
// Zeilenhöhe, wo `style.css` kein eigenes `line-height` setzt: angenommener
// Browser-Normalwert ≈ 1,2 × Schriftgrösse (gängige Faustregel für
// serifenlose Systemschriften, exakter Wert erst im Browser messbar).
//
// oben (140px = 1rem + 6,75rem + 1rem): #steuerung (Marke + zwei
// `.gruppe`-Zeilen) wird nicht neu vermessen, sondern von `#zurueck-gruppe`s
// eigenem `top: 7.75rem` übernommen (= 1rem Randabstand + 6,75rem Höhe von
// #steuerung selbst) — dessen Kommentar in `style.css` bezeichnet diese
// 7.75rem selbst als «unverifiziert»; dieselbe geerbte Unsicherheit gilt
// deshalb auch für die 6,75rem hier, ungeglättet, bis Aufgabe 18 sie am
// Screenshot prüft. #kennzahlen bleibt mit ein bis zwei Zeilen (Padding
// 2×.5rem=1rem + Zeilenhöhe 2×1,4×.8125rem=2,275rem + 2×1px Rand ≈ 3,4rem
// Boxhöhe) deutlich darunter — #steuerung bestimmt die Seite so oder so.
// +1rem Sicherheitsabstand (derselbe Randabstand, den jede Box in diesem
// Stylesheet vom Viewport-Rand hat) ergibt 1rem+6,75rem+1rem=8,75rem.
//
// links (320px = 1rem + 18rem + 1rem): #legende (`max-width: 18rem`) ist
// breiter als die Button-Reihen von #steuerung und bestimmt die Seite.
// Randabstand 1rem + Breite 18rem + 1rem Sicherheitsabstand = 20rem.
//
// rechts (368px = 1rem + 21rem + 1rem): #panel (`max-width: 21rem`) ist
// breiter als #hinweis (16rem) und bestimmt die Seite. Randabstand 1rem +
// Breite 21rem + 1rem Sicherheitsabstand = 23rem.
//
// unten (528px ≈ 1rem + 31rem + 1rem): #legende bestimmt die Seite,
// vollständig aufgeschlüsselt für Ansicht «Börsennotierte Firmen» (Filter-
// Modus, `ui/legend.ts`, `renderLegend`) — die dort dichteste Kombination:
//   - `.legende-titel`: 1 Zeile × 13,2px (11px×1,2) + .5rem Marge = 21,2px
//   - `.legende-alle`-Knopf: 12px Zeile + 2×.3rem Padding + .5rem Marge = 29,6px
//   - Branchenliste: bis zu 12 Zeilen (elf NOGA-Gruppen + „nicht eindeutig
//     bestimmbar" bei `presentGroups.hasUnknown`) × 13,2px + 11×.25rem Gap
//     + .55rem Listen-Marge = 211,2px
//   - zweite Liste, nur hier (Randmarkierung/unrecherchierter Marker/
//     Mindesthöhen-Hinweis, `outlineSwatch`/`unresearchedSwatch`/
//     `floorNote` in `ui/legend.ts`): drei ganze Sätze, die bei 18rem
//     Boxbreite umbrechen. Textbreite mit Punkt+Gap ≈ 18rem − 2×.875rem
//     Padding − 2px Rand − .55rem Punkt − .45rem Gap ≈ 242px, ohne Punkt
//     (Mindesthöhen-Hinweis, reiner Text-Li) ≈ 258px; bei ≈5,5px/Zeichen
//     (Faustregel für proportionale 11px-Schrift) ≈44 bzw. ≈47 Zeichen/
//     Zeile. Randmarkierungs-Text (145 Zeichen) → 4 Zeilen, Marker-Text
//     (99 Zeichen) → 3 Zeilen, Mindesthöhen-Text (144 Zeichen) → 4 Zeilen,
//     macht 11 Zeilen × 13,2px + 2×.25rem Gap + .55rem Listen-Marge = 162px
//   - Bezugszeilen (bis zu zwei: „Höchste Säule" + Verlustzeile,
//     `.legende-bezug`): angenommen 3 Zeilen × 13,2px + eine .35rem-Marge
//     = 45,2px
// Summe Innenhalt 469,2px + 2×.75rem Boxpadding + 2×1px Rand ≈ 495,2px
// Boxhöhe (≈31rem) + 1rem Randabstand + 1rem Sicherheitsabstand ≈ 33rem.
// #hinweis trägt in derselben Ansicht bis zu sechs Pflichttext-Absätze
// (`ui/notices.ts`, `renderNotices`) und bleibt nach derselben Rechnung
// (vier bis sechs Absätze statt fixer drei Zeilen) knapp darunter — beide
// Boxen sind also ähnlich raumgreifend, #legende bleibt die etwas grössere
// und damit bestimmende. Aufgabe 18 prüft am Screenshot, ob dieser
// grosszügige Wert übertrieben wirkt oder tatsächlich gebraucht wird.
//
// Dieser Rohwert bleibt unverändert stehen — er sagt, woher die Zahlen
// kommen. Er wird aber NICHT direkt an `fitBounds`/`cameraForBounds`
// weitergereicht, siehe `cappedPadding` unten: das Modell hinter dieser
// Herleitung (Padding = volle Höhe/Breite der Chrome-Box) geht davon aus,
// die Chrome schneide die Karte am Rand ab wie ein echter Rahmen. Das
// stimmt nicht — #legende/#hinweis/#panel/#steuerung/#kennzahlen liegen mit
// `z-index` ÜBER dem Kartencanvas (siehe `#ui`/`#map` in `style.css`), nicht
// daneben; sie sind zudem halbtransparent (`--oberflaeche`,
// `rgba(255,255,255,.84)`). Es genügt, dass die Landesfläche nicht
// vollständig hinter einer Box verschwindet — nicht, dass die gerahmte
// Fläche jede Chrome-Box vollständig meidet. Ungekappt würde eine
// 15-zeilige Legende (528px unten) auf einem 1000px hohen Fenster der Karte
// zusammen mit den oberen 140px nur noch ein Drittel der Höhe lassen — das
// Gegenteil dessen, wofür diese Aufgabe existiert (Schweiz füllt das Bild,
// nicht 45 % davon).
const DERIVED_FRAME_PADDING: PaddingOptions = {
  top: 140,
  bottom: 528,
  left: 320,
  right: 368,
}

// Obergrenze je Seite: höchstens ein Viertel der zugehörigen Fenstergrösse
// (Breite für links/rechts, Höhe für oben/unten) — der kleinere von
// hergeleitetem und begrenztem Wert gilt. Damit bleibt der Karte in jeder
// Fenstergrösse mindestens die Hälfte in jeder Richtung (zwei Seiten à
// höchstens 25 % lassen mindestens 50 % übrig), unabhängig davon, wie lang
// die Legende gerade ist. Diese Kappung ist kein Zurückrudern von der
// Herleitung oben, sondern die Korrektur ihrer falschen Modellannahme (siehe
// dort) — die Herleitung bleibt die Grundlage und greift unverändert dort,
// wo sie unter dieser Grenze liegt (z. B. `left`/`right`/`top` bei den
// meisten Fenstergrössen).
const MAX_PADDING_FRACTION = 0.25

/** Wendet `MAX_PADDING_FRACTION` auf `DERIVED_FRAME_PADDING` an, bezogen auf
 *  die tatsächliche Grösse des Kartencontainers — muss deshalb zur Laufzeit
 *  in `frameBounds` berechnet werden, nicht als Modulkonstante, weil sich
 *  die Fenstergrösse zwischen Aufrufen ändern kann (Resize, andere Seite). */
function cappedPadding(map: maplibregl.Map): PaddingOptions {
  const { clientWidth, clientHeight } = map.getContainer()
  const maxHorizontal = clientWidth * MAX_PADDING_FRACTION
  const maxVertical = clientHeight * MAX_PADDING_FRACTION
  return {
    top: Math.min(DERIVED_FRAME_PADDING.top, maxVertical),
    bottom: Math.min(DERIVED_FRAME_PADDING.bottom, maxVertical),
    left: Math.min(DERIVED_FRAME_PADDING.left, maxHorizontal),
    right: Math.min(DERIVED_FRAME_PADDING.right, maxHorizontal),
  }
}

// Zusätzlicher Zoom, nach der aus `FRAME_PADDING` hergeleiteten Kamera
// aufaddiert (siehe `frameBounds` unten): `cameraForBounds` — wie
// `fitBounds`, das intern denselben Weg geht — rechnet `pitch` nicht in die
// Bounds-Berechnung ein (siehe `CameraForBoundsOptions`, die keinen
// `pitch`-Parameter kennt), obwohl die Kamera anschliessend mit `pitch: 50`
// aus `INITIAL_VIEW` schwenkt. Dadurch bleibt die gerahmte Fläche kleiner als
// vom Padding beabsichtigt (Screenshot-Befund: rund 45 % Bildfläche statt der
// angestrebten Ausfüllung). Der richtige Ausgleichswert lässt sich nur am
// gerenderten Bild ablesen, nicht aus CSS oder Geometrie herleiten — deshalb
// hier bewusst nicht geraten: `PITCH_FILL_BOOST` bleibt `0` (unverändertes
// Verhalten gegenüber vor dieser Aufgabe), bis Aufgabe 18 anhand von
// Screenshots den tatsächlich passenden Wert misst und einträgt.
const PITCH_FILL_BOOST = 0

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
   *  Padding je Seite aus `DERIVED_FRAME_PADDING`, gekappt auf höchstens ein
   *  Viertel der jeweiligen Fenstergrösse (`cappedPadding`), zusätzlich um
   *  `PITCH_FILL_BOOST` ausgeglichen (siehe dort — `pitch` selbst bleibt in
   *  der Bounds-Rechnung unberücksichtigt). `instant: true` (Erstladung der
   *  Schweiz-Übersicht) und ein aktives `prefers-reduced-motion` überspringen
   *  die Animation (`duration: 0`); sonst wird über `FRAME_DURATION_MS`
   *  sanft geschwenkt. */
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
      const padding = cappedPadding(map)
      // `cameraForBounds` statt `fitBounds` direkt: dieselbe Zentrum/Zoom-
      // Herleitung aus den Bounds (siehe `PITCH_FILL_BOOST`-Kommentar oben),
      // aber als eigener Zwischenschritt, damit der Ausgleichswert auf den
      // berechneten Zoom aufaddiert werden kann, bevor in einer einzigen
      // Animation dorthin geschwenkt wird — kein zweiter, sichtbar
      // nachruckender Kameraschritt.
      const camera = map.cameraForBounds(bounds, {
        padding,
        bearing: INITIAL_VIEW.bearing,
      })
      // `cameraForBounds` liefert laut eigener Dokumentation `undefined`,
      // wenn es nicht rahmen kann (z. B. entartete Bounds), und warnt dann
      // bereits selbst in die Konsole — hier bleibt in dem Fall nur, die
      // Kamera unverändert zu lassen statt mit `undefined`-Werten
      // weiterzurechnen.
      if (!camera) return
      map.easeTo({
        center: camera.center,
        zoom: (camera.zoom ?? map.getZoom()) + PITCH_FILL_BOOST,
        pitch: INITIAL_VIEW.pitch,
        bearing: INITIAL_VIEW.bearing,
        padding,
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
