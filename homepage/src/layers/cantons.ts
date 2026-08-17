import { GeoJsonLayer } from '@deck.gl/layers'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { BoundaryFeatureCollection, BoundaryProperties } from '../data/boundaries'
import { withBaseElevation } from './elevation'
import { MAP_MATERIAL } from './material'

// Design-Tokens aus style.css (`--land`, `--land-kante`, `--aargau`), hier als
// RGBA-Literale dupliziert — CSS-Variablen erreichen WebGL-Farb-Accessor
// nicht. Bei einer Token-Änderung müssen diese drei Werte von Hand mitziehen.
// Redesign (2026-08-14): volle Deckkraft statt der früheren halbtransparenten
// Overlay-Füllung — die Kantone sind jetzt echte, wenn auch flache
// Extrusionskörper („eine Platte, aus der die Gemeinden wachsen"), keine
// durchscheinende Orientierungsebene mehr über einer fremden Basiskarte.
//
// Aufgabe 17 (Kontrast dünner Säulen gegen die Platte): geprüft, aber
// verworfen wurde eine dunklere Platte (`#C3CEDC`/`[195, 206, 220, 255]`,
// ein Schritt dunkler als hier). Die elf Branchenfarben (`etl/tests/
// test_palette.py`, farbenblind geprüft) sind alle heller als `--land` —
// eine dunklere Platte rückt ihr Leuchtdichteniveau NÄHER an sie heran statt
// weiter weg und senkt den WCAG-Kontrast damit für JEDE der elf Farben,
// nicht nur für einzelne. Gegen `#C3CEDC` fallen «Bau» (1.56 → 1.41), «Ver-
// kehr und Logistik» (1.60 → 1.45, neu unter die geforderten 1.6), «Infor-
// mation und Kommunikation» (1.09 → 1.02) und «Unternehmensdienstleistungen»
// (1.12 → 1.06) unter den Schwellenwert bzw. tiefer darunter — laut Auftrag
// wird in diesem Fall die Plattenfarbe zurückgenommen, nicht die Branchen-
// farbe geändert. `--land`/`LAND_FILL` bleiben deshalb beim bisherigen Wert;
// die vollständige Kontrasttabelle (auch für den unveränderten Wert, der für
// dieselben drei Branchen bereits unter 1.6 liegt — ein von dieser Aufgabe
// unabhängiger, bereits bestehender Befund) steht im Bericht.
const LAND_FILL: [number, number, number, number] = [207, 216, 227, 255] // --land
const LAND_LINE: [number, number, number, number] = [168, 182, 198, 220] // --land-kante

// Der hervorgehobene Kanton sticht durch eine hellere Füllfarbe hervor —
// „ein Schatten heller, damit er sich hebt" (Auftrag) — nicht mehr durch
// einen zusätzlichen Rand oder eine zweite Farbfamilie: die Differenzierung
// bleibt innerhalb derselben kühlen Palette. Welcher Kanton das ist, ist
// seit der Nationalisierung nicht mehr `meta.json`s konfigurierter
// Startkanton, sondern der auf der Kantonsstufe von Ansicht «Beschäftigte»
// betretene (siehe `CantonsLayerOptions.activeBfsNr` unten).
const AARGAU_FILL: [number, number, number, number] = [221, 229, 238, 255] // --aargau

// Leichte Extrusion aller 26 Kantone (Redesign-Vorgabe: „Switzerland reads as
// a plate the municipalities rise from"). Niedrig gehalten, damit sie nicht
// mit den Gemeindebalken konkurriert — die kleinste Gemeinde in Ansicht B
// liegt nach der neuen Höhendecke (`MAX_BAR_HEIGHT_M` = 3000, `layers/many.ts`)
// weit darüber. Exportiert, weil `layers/many.ts` dieselbe Zahl braucht:
// Gemeindeflächen, Gemeindegrenzen und die Kantonsgrenzen unten bekommen sie
// als Basis-Höhe aufgeprägt (`withBaseElevation`), sonst lägen sie bei z=0 IN
// der Kantonsplatte statt sichtbar AUF ihr.
export const CANTON_ELEVATION_M = 300

export interface CantonsLayerOptions {
  data: BoundaryFeatureCollection
  /** Welcher der 26 Kantone hervorgehoben wird — in Ansicht «Börsennotierte
   *  Firmen» seit der Nationalisierung (Phase 3) nie: `karte/firmen.ts`
   *  übergibt durchgehend `null`, kein einzelner Kanton ist dort mehr
   *  ausgezeichnet (Abschluss-Review: dieser Kommentar behauptete bis dahin
   *  fälschlich, es bliebe `meta.canton.bfs_nr`/Aargau). In Ansicht
   *  «Beschäftigte» (`karte/beschaeftigte.ts`) auf der Kantonsstufe der
   *  gerade betretene Kanton, sonst ebenfalls `null` — auf der Schweiz-Stufe
   *  (Phase 2) ist kein einzelner Kanton „aktiv" — alle 26 sind gleichrangig
   *  Inhalt (die Balken darüber, siehe `layers/many.ts`), nicht Hintergrund
   *  mit einem hervorgehobenen Ausnahme-Kanton. */
  activeBfsNr: number | null
  /** Macht die Platte anklickbar (Auftrag vom 17. August 2026): auf der
   *  Kantonsstufe von `/beschaeftigte/` wechselt ein Klick auf einen ANDEREN
   *  Kanton direkt dorthin, ohne den Umweg über «Schweiz». Meldet die
   *  `bfs_nr` der getroffenen Fläche; wer sie in eine Zeile der Kantonsstufe
   *  übersetzt (und den aktiven Kanton aussortiert), ist der Aufrufer
   *  (`layers/viewLayers.ts`) — diese Schicht kennt nur Geometrie. Ohne
   *  `onPick` bleibt die Platte, was sie immer war: nicht anklickbar. */
  onPick?: (bfsNr: number) => void
  /** Hover zur Klickbarkeit oben — `null` beim Verlassen. Nur zusammen mit
   *  `onPick` sinnvoll: eine Fläche, die auf Berührung reagiert, aber auf
   *  Klick nichts tut, wäre ein leeres Versprechen. */
  onHover?: (bfsNr: number | null, x: number, y: number) => void
}

/** Selbstgezeichnete Basiskarte: alle 26 Kantone, jetzt mit einer flachen,
 *  gemeinsamen Extrusion (siehe `CANTON_ELEVATION_M`); anklickbar nur, wenn
 *  `onPick` gesetzt ist (Kantonsstufe von `/beschaeftigte/`, siehe
 *  `CantonsLayerOptions`).
 *  Ersetzt die früher zur Laufzeit von swisstopo geladenen Vektorkacheln —
 *  siehe README/Spec Abschnitt 9 und 10. Rein wie jeder Layer-Modul-Export
 *  hier: kein MapLibre, kein DOM.
 *
 *  Ohne Umriss (Regression-Fix, Change 6): `GeoJsonLayer` zeichnet den
 *  Polygon-Umriss nur, wenn `extruded: false` ist — bei `extruded: true`
 *  überspringt die Sublayer-Auswahl (`@deck.gl/layers/geojson-layer`,
 *  `_renderLineLayers`: `!extruded && stroked && …`) den Stroke-Sublayer
 *  komplett, unabhängig von `stroked`/`getLineColor`/`getLineWidth`. Diese
 *  Fläche trug also `stroked: true` mit Farbe/Breite, ohne je einen Rand zu
 *  zeichnen — nicht unsichtbar durch schwachen Kontrast, sondern schlicht nie
 *  gebaut. Siehe `buildCantonBorderLayer` unten für den tatsächlich
 *  sichtbaren Rand. */
export function buildCantonsLayer({
  data,
  activeBfsNr,
  onPick,
  onHover,
}: CantonsLayerOptions): GeoJsonLayer<BoundaryProperties> {
  return new GeoJsonLayer<BoundaryProperties>({
    id: 'kantone',
    data,
    filled: true,
    stroked: false,
    extruded: true,
    material: MAP_MATERIAL,
    getElevation: CANTON_ELEVATION_M,
    pickable: Boolean(onPick),
    // Dieselbe leise Aufhellung wie auf den Gemeindeflächen (`layers/many.ts`,
    // `HOVER_HIGHLIGHT_COLOR`) — die Platte ist gross, das Weiss reicht; die
    // dunkle Säulen-Hervorhebung (`layers/visible.ts`) wäre hier ein
    // flächiger schwarzer Kanton.
    autoHighlight: Boolean(onPick),
    highlightColor: [255, 255, 255, 70],
    getFillColor: (f: Feature<Geometry, BoundaryProperties>) =>
      f.properties.bfs_nr === activeBfsNr ? AARGAU_FILL : LAND_FILL,
    updateTriggers: { getFillColor: [activeBfsNr] },
    onClick: onPick
      ? (info) => {
          const bfsNr = info.object?.properties.bfs_nr
          if (typeof bfsNr === 'number') onPick(bfsNr)
        }
      : undefined,
    onHover: onHover
      ? (info) => {
          const bfsNr = info.object?.properties.bfs_nr
          onHover(typeof bfsNr === 'number' ? bfsNr : null, info.x, info.y)
        }
      : undefined,
  })
}

/** Der tatsächlich sichtbare Kantonsrand (Regression-Fix, Change 6): eine
 *  zweite, ungefüllte, unextrudierte `GeoJsonLayer` auf denselben Daten, nur
 *  für den Umriss — siehe Kommentar an `buildCantonsLayer` oben, warum
 *  `stroked` auf der extrudierten Fläche wirkungslos war. Auf Plattenhöhe
 *  gehoben (`withBaseElevation`), damit der Rand am oberen, sichtbaren Rand
 *  der Platte liegt statt an ihrer Grundfläche bei z=0. Muss in **beiden**
 *  Ansichten gezeichnet werden (Auftrag) — `karte/basis.ts`s `createBasis()`
 *  baut sie deshalb einmal, beide Seiten reihen sie in ihren eigenen
 *  `setLayers()`-Aufruf ein, wie `buildCantonsLayer` selbst. Farbe/Breite
 *  unverändert gegenüber dem früheren (nie gezeichneten) Versuch:
 *  `--land-kante` bei praktisch voller Deckkraft, 1.2px — deutlich
 *  kräftiger als die Gemeindegrenzen in `layers/many.ts`
 *  (`buildMunicipalityBorderLayer`), die dieser Linie optisch untergeordnet
 *  bleiben sollen. */
export function buildCantonBorderLayer({
  data,
}: {
  data: BoundaryFeatureCollection
}): GeoJsonLayer<BoundaryProperties> {
  const lifted: FeatureCollection<Geometry, BoundaryProperties> = {
    type: 'FeatureCollection',
    features: data.features.flatMap((f) =>
      f.geometry ? [{ ...f, geometry: withBaseElevation(f.geometry, CANTON_ELEVATION_M) }] : [],
    ),
  }

  return new GeoJsonLayer<BoundaryProperties>({
    id: 'kantone-grenzen',
    data: lifted,
    filled: false,
    stroked: true,
    extruded: false,
    pickable: false,
    getLineColor: LAND_LINE,
    getLineWidth: 1.2,
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: 1.2,
  })
}
