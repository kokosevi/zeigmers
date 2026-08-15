import { NOGA_UNKNOWN_INDEX } from './noga.generated'

/** Welche Branchengruppen tatsächlich auf der aktuellen Karte vorkommen —
 *  Grundlage für Finding 2c (Farb-Report, 2026-08-14): die Legende zeigte
 *  bislang immer alle elf gemessenen Gruppen plus Grau, unabhängig davon, ob
 *  eine Gruppe je die dominante/eingefärbte Kategorie einer sichtbaren
 *  Fläche war. Gemessen an den echten Daten dominieren in Ansicht
 *  «Beschäftigte» nur 7 von 11 je eine Gemeinde, in Ansicht «Börsennotierte
 *  Firmen» nur 2 von 11 — die übrigen sind reines Rauschen.
 *
 *  `indices` sind die numerischen Gruppen-Indizes, wie sie sowohl im
 *  Gemeinde-Binärformat (`noga`-Array, `data/loader.ts`) als auch in
 *  `Company.nogaGroupIndex` (`layers/visible.ts`) verwendet werden — deren
 *  Position in `NOGA_GROUPS` (`domain/noga.generated.ts`) entspricht exakt
 *  diesem Index (siehe `domain/colors.ts`, `buildColors`, dieselbe
 *  Konvention). */
export interface PresentGroups {
  readonly indices: readonly number[]
  readonly hasUnknown: boolean
}

/** Läuft einmal über eine Liste von Gruppen-Indizes (ein Gemeinde-`noga`-Array
 *  oder die aus `Company[]` abgeleiteten effektiven Indizes, siehe
 *  `karte/firmen.ts`/`karte/beschaeftigte.ts`) und bestimmt, welche Gruppen
 *  mindestens einmal vorkommen.
 *  `NOGA_UNKNOWN_INDEX` (255) zählt gesondert als `hasUnknown`, nicht als
 *  eigener Eintrag in `indices` — die Legende zeigt "nicht bestimmbar" separat
 *  als grauen Eintrag, nicht als zwölfte Branche. */
export function presentGroupsFromIndices(indices: ArrayLike<number>): PresentGroups {
  const seen = new Set<number>()
  let hasUnknown = false
  for (let i = 0; i < indices.length; i++) {
    const index = indices[i]!
    if (index === NOGA_UNKNOWN_INDEX) hasUnknown = true
    else seen.add(index)
  }
  return { indices: [...seen].sort((a, b) => a - b), hasUnknown }
}
