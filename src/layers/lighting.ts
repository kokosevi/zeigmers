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
 *  Report, Abschnitt „was visuell ungeprüft bleibt".
 *
 *  Werte als benannte Konstanten statt Inline-Literale (Finding 2b/2a-Report,
 *  2026-08-14): `layers/litColor.ts` rechnet mit exakt denselben Zahlen die
 *  Deckflächen-Farbe für die Legende nach (Finding 2a) — zwei Kopien
 *  derselben drei Zahlen könnten sonst auseinanderlaufen. */
export const LIGHT_COLOR: readonly [number, number, number] = [255, 255, 255]

/** Directional-Intensität 1.6 -> 0.75 (Finding 2b): bei 1.6 übersteigt
 *  Ambient- plus Diffusanteil einer Deckfläche in Lichtrichtung (Faktor
 *  ~1.36 auf die Rohfarbe, siehe ETL/Farb-Report) den unbeleuchteten Wert
 *  deutlich — helle Branchenfarben (z. B. IKT-Gelb) clippen dabei fast
 *  vollständig ins Weisse ("kindliche" Pastelltöne, Auftrag). Halbiert plus
 *  etwas, damit auf der am stärksten beleuchteten Deckfläche kein Kanal mehr
 *  über 1.0 hinausschiesst. */
export const SUN_INTENSITY = 0.75

/** Ambient-Intensität 1.15 -> 1.2 (Finding 2b): leicht angehoben, damit die
 *  von der Sonne abgewandten Flanken (Ambient ist der einzige Lichtanteil,
 *  den sie bekommen) trotz der stark reduzierten Sonnenintensität oben
 *  lesbar bleiben, statt beim blossen Absenken der Sonne insgesamt zu dunkel
 *  zu wirken. Zusammen mit `SUN_INTENSITY` ergibt das für eine Deckfläche
 *  einen Gesamtfaktor von ~1.0 auf die Rohfarbe (nah am wahren Farbton, siehe
 *  `litColor.ts`/ETL-Report) — bei den sonnenabgewandten Flanken bleibt nur
 *  der Ambient-Anteil (~0.66), sichtbar dunkler als die Deckfläche. */
export const AMBIENT_INTENSITY = 1.2

/** Unverändert gegenüber dem ursprünglichen Redesign — nur die Intensitäten
 *  wurden retariert (Finding 2b), nicht die Richtung selbst. */
export const SUN_DIRECTION: readonly [number, number, number] = [1, -1, -3]

export const mapLightingEffect = new LightingEffect({
  ambient: new AmbientLight({ color: [...LIGHT_COLOR], intensity: AMBIENT_INTENSITY }),
  sonne: new DirectionalLight({
    color: [...LIGHT_COLOR],
    intensity: SUN_INTENSITY,
    direction: [...SUN_DIRECTION],
  }),
})
