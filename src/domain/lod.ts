export type LevelName = 'kanton' | 'gemeinde' | 'hektar'

export interface LodWeights {
  kanton: number
  gemeinde: number
  hektar: number
}

// Von Hand auf die Ausdehnung des Kantons Aargau abgestimmt: bei Zoom 9 ist
// der ganze Kanton im Bild (Kanton -> Gemeinde macht dann Sinn), bei Zoom 12
// füllt eine Gemeinde den Bildschirm (Gemeinde -> Hektare). Anders als die
// Artefaktnamen hängt das nicht automatisch an `CANTON` — ein deutlich
// grösserer oder kleinerer Kanton bräuchte andere Zentren (siehe README,
// Abschnitt "Kantonswechsel").
export const BAND_CENTERS = { kantonGemeinde: 9, gemeindeHektar: 12 } as const
export const BAND_WIDTH = 0.75

function ramp(zoom: number, centre: number): number {
  const t = (zoom - (centre - BAND_WIDTH / 2)) / BAND_WIDTH
  return Math.min(1, Math.max(0, t))
}

/** Gewichte der drei Stufen. Summiert sich immer auf 1, damit die Überblendung
 *  keine Lücke und keine doppelte Deckung erzeugt.
 *
 *  Algebraisch gilt kanton + gemeinde + hektar = 1 + toHectare * (1 - toMunicipality).
 *  Das ist nur dann > 1, wenn toHectare > 0 UND toMunicipality < 1 gleichzeitig gelten
 *  — also wenn sich die beiden Übergangsbänder überlappen. Band 1 (toMunicipality)
 *  liegt in [kantonGemeinde - BAND_WIDTH/2, kantonGemeinde + BAND_WIDTH/2], mit den
 *  aktuellen Konstanten also [8.625, 9.375]. Band 2 (toHectare) liegt entsprechend in
 *  [11.625, 12.375]. Zwischen den Bändern liegt eine Lücke von 11.625 - 9.375 = 2.25
 *  Zoomstufen, in der toMunicipality bereits 1 und toHectare noch 0 ist — die Bänder
 *  überlappen sich also nicht, und die Summe bleibt exakt 1. Das gilt nur, solange
 *  BAND_WIDTH kleiner bleibt als der Abstand zwischen den Bandzentren (hier: 3
 *  Zoomstufen); werden BAND_WIDTH oder BAND_CENTERS künftig geändert, muss das erneut
 *  geprüft werden. */
export function lodWeights(zoom: number): LodWeights {
  const toMunicipality = ramp(zoom, BAND_CENTERS.kantonGemeinde)
  const toHectare = ramp(zoom, BAND_CENTERS.gemeindeHektar)
  return {
    kanton: 1 - toMunicipality,
    gemeinde: toMunicipality * (1 - toHectare),
    hektar: toHectare,
  }
}

export function activeLevel(zoom: number): LevelName {
  const w = lodWeights(zoom)
  if (w.hektar >= w.gemeinde && w.hektar >= w.kanton) return 'hektar'
  return w.gemeinde >= w.kanton ? 'gemeinde' : 'kanton'
}
