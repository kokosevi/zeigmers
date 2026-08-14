import { AmbientLight, DirectionalLight, LightingEffect } from '@deck.gl/core'

/** Eine Lichtstimmung für die ganze Karte (visueller Redesign, 2026-08-14) —
 *  Kantons- und Gemeindeflächen (`layers/cantons.ts`, `layers/many.ts`)
 *  teilen sich denselben `LightingEffect`, dieselbe Lichtrichtung und
 *  dasselbe `MAP_MATERIAL` (`layers/material.ts`). Das ist der eigentliche
 *  Hebel des Redesigns: „elf gemessene Farbtöne, als ein Material gerendert“
 *  — nicht neue Farben, sondern ein Licht, das pastellhelle Deckflächen und
 *  klar dunklere Flanken erzeugt, wie im Referenzbild.
 *
 *  `AmbientLight` hält die Flanken lesbar (nie ganz schwarz) — ohne sie
 *  bräuchte jede Fläche einen zweiten Fülllicht-Layer. `DirectionalLight`
 *  liefert die eigentliche Ober-/Seiten-Differenz aus einer festen Richtung.
 *
 *  Richtung „Nordwesten, hoch" (Auftrag): deck.gl definiert `direction` als
 *  die Richtung, in die das Licht unterwegs ist (x = Ost, y = Nord, z = auf,
 *  siehe `DirectionalLightOptions`), nicht die Richtung zur Quelle. Eine
 *  Quelle im Nordwesten hoch am Himmel strahlt entsprechend nach Osten,
 *  Süden und stark abwärts — `[1, -1, -3]`: die grosse negative z-Komponente
 *  macht das Licht „hoch" (fast senkrecht), das kleinere x/-y kippt es
 *  sichtbar nach Nordwesten, statt komplett von oben zu kommen (das gäbe
 *  keine erkennbaren Flanken). Nicht im Browser geprüft — siehe Redesign-
 *  Report, Abschnitt „was visuell ungeprüft bleibt". */
export const mapLightingEffect = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 1.15 }),
  sonne: new DirectionalLight({
    color: [255, 255, 255],
    intensity: 1.6,
    direction: [1, -1, -3],
  }),
})
