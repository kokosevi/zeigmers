import type { Material } from '@deck.gl/core'

/** Gemeinsames Material für Kantons- und Gemeindeflächen (visueller Redesign,
 *  2026-08-14). Die Kernidee des Auftrags: elf gemessene, farbenblind-sichere
 *  Branchenfarben (`domain/noga.generated.ts`, geprüft von
 *  `etl/tests/test_palette.py`) bleiben unangetastet — die Wirkung eines
 *  Referenzbilds („blasse, monochrome Blautöne, flache Extrusion, Seiten
 *  deutlich dunkler als die Deckfläche") kommt stattdessen aus einem
 *  einheitlichen Licht (`layers/lighting.ts`), das über alle elf Farben
 *  gleich gelegt wird. `material: false` (vorheriger Stand, `many.ts`) gab
 *  flaches, richtungsloses Shading — günstig bei bis zu 17'940 Hektarbalken,
 *  irrelevant bei 196 Gemeindeflächen.
 *
 *  Werte von Hand austariert (kein Browser verfügbar, siehe Redesign-Report):
 *  hoher `ambient`-Anteil hält Deckflächen nah an der Originalfarbe (das Auge
 *  soll dort noch dieselbe Branchenfarbe lesen), ein niedrigeres `diffuse`
 *  plus `shininess`/`specularColor` nah bei Grau vermeiden einen glänzenden
 *  Kunststoff-Look — die Referenz ist matt, nicht poliert. Die eigentliche
 *  Differenzierung Deckfläche/Seitenwand entsteht aus dem Winkel des
 *  gerichteten Lichts (`DirectionalLight`), nicht aus dem Material selbst. */
export const MAP_MATERIAL: Material = {
  ambient: 0.55,
  diffuse: 0.5,
  shininess: 6,
  specularColor: [45, 45, 45],
}
