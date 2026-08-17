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

// Padding je Seite für die Kamera-Rahmung, hergeleitet aus der tatsächlichen
// Oberfläche — nicht von Hand gewählt.
//
// Diese Herleitung ist mit dem Redesign vom 17. August 2026 vollständig neu:
// Vorher vermass sie sechs Boxen an fünf Rändern (`#steuerung`, `#kennzahlen`,
// `#legende`, `#hinweis`, `#panel`, plus MapLibres `NavigationControl`), und
// die untere Seite war mit 320px die grösste — die Legende trug damals zwölf
// Branchenzeilen mit Zahlen. Es gibt jetzt drei Flächen mit festen Massen aus
// dem Entwurf, was die Rechnung kurz macht:
//
//   links  20px Randabstand + 264px Leiste + 20px Luft = 304px
//   rechts 20px Randabstand + 296px Panel  + 20px Luft = 336px
//   unten  22px Randabstand + 99px Zoom-Gruppe (3×32px + 2×1px Trennlinie
//          + 2×1,5px Rahmen) + 20px Luft ≈ 141px; der Massstab auf
//          `/beschaeftigte/` (links 308px, unten 22px) ist niedriger und
//          liegt ohnehin hinter der Leisten-Spalte, er bestimmt nichts.
//   oben   20px Randabstand + 20px Luft = 40px — rechts der Leiste steht dort
//          seit dem Redesign nichts mehr (die Summenzeile oben mittig und das
//          NavigationControl oben rechts sind beide entfallen).
//
// Die Leiste spannt zwar die ganze Höhe (`top: 20px; bottom: 20px`), zählt
// aber nur für `left`: sie deckt eine Spalte ab, keinen waagrechten Streifen.
//
// Dieser Rohwert wird NICHT direkt weitergereicht, siehe `cappedPadding`
// unten: das Modell hinter jeder solchen Herleitung (Padding = volle Breite der
// Chrome) nimmt an, die Oberfläche schneide die Karte ab wie ein Rahmen. Das
// stimmt nicht — Leiste, Panel und Zoom-Gruppe liegen mit `z-index` ÜBER dem
// Kartencanvas (siehe `#ui`/`#map` in `style.css`), nicht daneben. Es genügt,
// dass die Landesfläche nicht hinter einer Fläche verschwindet, nicht dass die
// gerahmte Fläche jede von ihnen meidet.
const DERIVED_FRAME_PADDING: PaddingOptions = {
  top: 40,
  bottom: 141,
  left: 304,
  right: 336,
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
 *  die Fenstergrösse zwischen Aufrufen ändern kann (Resize, andere Seite).
 *
 *  Aufgabe 18, festgehalten statt stillschweigend hingenommen: ist der
 *  Container beim Aufruf noch nicht gelayoutet (`clientWidth`/`clientHeight`
 *  liefern dann `0`, z. B. ein `frameBounds()` vor dem ersten Browser-Reflow),
 *  ergibt sich ein Padding von `0` auf allen vier Seiten — unschädlich
 *  (`cameraForBounds` rahmt dann ungepolstert, keine Exception, kein NaN),
 *  aber ohne die hier sonst geltende Rahmung. In der Praxis tritt der Fall
 *  nicht auf: `createBasis()` ruft `frameBounds()` erst, nachdem `#map` im DOM
 *  hängt und der erste Layout-Pass gelaufen ist (siehe dort). Kein Abfangen
 *  nötig, nur die Randbedingung dieser Herleitung dokumentiert. */
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

// Zusätzlicher Zoom, nach der aus `DERIVED_FRAME_PADDING` hergeleiteten
// Kamera aufaddiert (siehe `frameBounds` unten): `cameraForBounds` — wie
// `fitBounds`, das intern denselben Weg geht — rechnet `pitch` nicht in die
// Bounds-Berechnung ein (siehe `CameraForBoundsOptions`, die keinen
// `pitch`-Parameter kennt), obwohl die Kamera anschliessend mit `pitch: 50`
// aus `INITIAL_VIEW` schwenkt. Dadurch bleibt die gerahmte Fläche kleiner als
// vom Padding beabsichtigt (Screenshot-Befund: rund 45 % Bildfläche statt der
// angestrebten Ausfüllung). Der richtige Ausgleichswert lässt sich nur am
// gerenderten Bild ablesen, nicht aus CSS oder Geometrie herleiten — deshalb
// hier bewusst nicht geraten: `PITCH_FILL_BOOST` blieb `0` (unverändertes
// Verhalten gegenüber vor dieser Aufgabe), bis Aufgabe 18 anhand von
// Screenshots den tatsächlich passenden Wert mass.
//
// Aufgabe 18, Messreihe (Kennzahl Umsatz, 1600×1000, headless Chrome/
// SwiftShader, `PITCH_FILL_BOOST` testweise verändert und jeweils neu
// geschossen): `0` rahmte die Schweiz auf rund 45 % Bildfläche (Befund oben
// bestätigt); `1.0` füllte den Rahmen deutlich, schob den Genfersee-Rand
// («Compagnie Financière Richemont SA») dabei aber unter die Legende-Box
// links (deren eigener 1rem-Sicherheitsabstand, siehe `DERIVED_FRAME_
// PADDING`, ist für das *flache* `fitBounds`-Modell gerechnet, nicht für den
// tatsächlich weiter herausgezoomten Rand bei `pitch: 50`).
//
// Nachbesserung (selbes Datum): `0.15` war die erste Wahl, verworfen nach
// Sichtprüfung der ganzen Reihe (`0.15`/`0.2`/`0.3`/`0.5`) — bei `0.15`
// bleiben rund 40 % der Bildfläche leer, praktisch der Ausgangszustand, wegen
// dem die Rahmung überhaupt angefasst wurde. Bei `0.5` füllt die Landesfläche
// den Rahmen spürbar besser, die Seen treten deutlicher hervor, und
// Beschriftungen wie NOVARTIS AG, NESTLÉ S.A. und Kühne + Nagel werden
// dadurch deutlich lesbarer. Massgeblich für die Wahl: bei `0.5` berührt die
// Landesfläche selbst die Legende-Box weiterhin nicht — sie endet an deren
// Kante, wie bei `0.15` auch. Einzige neue Einschränkung: der
// Beschriftungstext von «Compagnie Financière Richemont SA» am Westrand
// streift jetzt den Rand der Legende-Box (Text, nicht Landfläche) — in
// Kauf genommen, weil kein Buchstabe darunter verschwindet und der Zugewinn
// an gefüllter Fläche und Lesbarkeit den kleinen Kontaktpunkt aufwiegt.
const PITCH_FILL_BOOST = 0.5

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
  /** Fliegt zu einem Punkt — der Weg, den ein Suchtreffer nimmt (siehe
   *  `ui/suche.ts`: die Suche navigiert, sie filtert nicht). `pitch`/`bearing`
   *  bleiben unangetastet, damit die Karte nach einem Treffer dieselbe
   *  Blickrichtung behält wie vorher; nur Zentrum und Zoom ändern sich. */
  flyTo(center: [number, number], zoom: number): void
  /** Die drei Zoom-Bedienelemente (`ui/zoom.ts`). Sie liegen hier und nicht in
   *  der Oberfläche, weil `map.ts` die einzige Stelle ist, die den
   *  `maplibregl.Map`-Zustand kennt — `MapHandle` gibt bewusst nur schmale
   *  Callbacks nach aussen, nie die Karteninstanz selbst (siehe Kommentar
   *  oben). */
  zoomIn(): void
  zoomOut(): void
  resetNorth(): void
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

  // Drehen und Neigen mit Shift + linker Maustaste (Auftrag, 17. August 2026).
  //
  // MapLibre kann das von Haus aus nur über die RECHTE Maustaste oder
  // Ctrl + links (`DragRotateHandler`); Shift + links ist dort standardmässig
  // der Auswahlrahmen zum Zoomen (`boxZoom`). Auf einem Trackpad ohne rechte
  // Taste ist die Karte damit praktisch nicht drehbar — genau die Lücke, die
  // dieser Handler schliesst. `boxZoom` wird deshalb abgeschaltet: beide auf
  // derselben Geste hiessen, dass beim Drehen ein Zoomrahmen mitgezeichnet
  // wird.
  //
  // Eigener Handler statt Umkonfiguration, weil MapLibre die auslösende Taste
  // von `dragRotate` nicht als Option anbietet — es gibt keinen Schalter, der
  // Shift zusätzlich zulässt. Die zwei Faktoren unten (0.35 Grad Drehung je
  // Pixel waagrecht, 0.35 Grad Neigung je Pixel senkrecht) sind dieselbe
  // Grössenordnung, die MapLibres eigener Handler verwendet; `maxPitch` (75,
  // siehe unten) und 0 als Untergrenze klemmen die Neigung auf denselben
  // Bereich, den die Karte auch sonst zulässt.
  map.boxZoom.disable()
  let drehStart: { x: number; y: number; bearing: number; pitch: number } | null = null

  map.getCanvas().addEventListener('mousedown', (event) => {
    if (!event.shiftKey || event.button !== 0) return
    // Verhindert, dass MapLibres eigenes Ziehen (Verschieben) gleichzeitig
    // anläuft — sonst wandert die Karte, während sie sich dreht.
    event.preventDefault()
    drehStart = {
      x: event.clientX,
      y: event.clientY,
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    }
    map.dragPan.disable()
  })

  // Am `window`, nicht am Canvas: wer beim Drehen aus der Karte hinausfährt,
  // soll die Drehung nicht mitten in der Bewegung verlieren.
  window.addEventListener('mousemove', (event) => {
    if (!drehStart) return
    const dx = event.clientX - drehStart.x
    const dy = event.clientY - drehStart.y
    map.setBearing(drehStart.bearing - dx * 0.35)
    map.setPitch(Math.min(75, Math.max(0, drehStart.pitch - dy * 0.35)))
  })

  window.addEventListener('mouseup', () => {
    if (!drehStart) return
    drehStart = null
    map.dragPan.enable()
  })

  // MapLibres `NavigationControl` ist mit dem Redesign (17. August 2026)
  // entfallen — ersetzt durch drei eigene Knöpfe (`ui/zoom.ts`) auf den
  // Durchreichen unten. Der Entwurf verlangt eine Spalte aus 32×32-Zellen mit
  // 1.5 px Tinte aussen und 1 px `--linie` zwischen den Zellen, ohne Radien
  // und Schatten. Das wäre am `NavigationControl` nur über fremde Selektoren
  // (`.maplibregl-ctrl-group`, `.maplibregl-ctrl-zoom-in` …) zu erreichen
  // gewesen, die dessen eigenes CSS mitbringt — inklusive Radien, Schatten und
  // SVG-Symbolen, die alle einzeln zurückzunehmen wären, und die bei einem
  // MapLibre-Update ohne Vorwarnung wieder anders heissen können. Eigene
  // Knöpfe sind hier weniger Code als das Zurücknehmen des fremden, und sie
  // erben die Tokens der Leiste automatisch. Der dritte Knopf ist «N»
  // (Norden zurücksetzen) statt des Kompass-Rings des Originals: `bearing`
  // ist mit `-15°` bewusst gesetzt (siehe `INITIAL_VIEW`), und «N» sagt, was
  // der Knopf tut, ohne eine drehbare Nadel zu zeichnen.

  return {
    setLayers: (layers) => overlay.setProps({ layers }),
    // Ein Suchtreffer bewegt Zentrum und Zoom, nicht die Blickrichtung: wer
    // die Karte gedreht hat, soll sie nach einem Treffer nicht neu ausrichten
    // müssen. `prefers-reduced-motion` überspringt die Animation, wie schon
    // bei `frameBounds`.
    flyTo: (center, zoom) => {
      map.flyTo({ center, zoom, duration: prefersReducedMotion() ? 0 : FRAME_DURATION_MS })
    },
    zoomIn: () => map.zoomIn(),
    zoomOut: () => map.zoomOut(),
    resetNorth: () => map.resetNorth(),
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
