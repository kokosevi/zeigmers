export interface LodWeights {
  kanton: number
  gemeinde: number
  hektar: number
}

export const BAND_CENTERS = { kantonGemeinde: 9, gemeindeHektar: 12 } as const
export const BAND_WIDTH = 0.75

function ramp(zoom: number, centre: number): number {
  const t = (zoom - (centre - BAND_WIDTH / 2)) / BAND_WIDTH
  return Math.min(1, Math.max(0, t))
}

/** Gewichte der drei Stufen. Summiert sich immer auf 1, damit die Überblendung
 *  keine Lücke und keine doppelte Deckung erzeugt.
 *
 *  Das setzt voraus, dass sich die beiden Übergangsbänder nicht überlappen:
 *  Band 1 liegt in [kantonGemeinde - BAND_WIDTH/2, kantonGemeinde + BAND_WIDTH/2],
 *  Band 2 entsprechend um gemeindeHektar. Nur wenn toMunicipality bereits 1 ist,
 *  bevor toHectare die Null verlässt, gilt hektar-Gewicht = 0 solange
 *  (1 - toMunicipality) > 0 — sonst würde `1 - toMunicipality*toHectare + toHectare`
 *  grösser als 1. Mit den aktuellen Konstanten (Bandbreite 0.75, Zentren 3
 *  Zoomstufen auseinander) ist das immer erfüllt. */
export function lodWeights(zoom: number): LodWeights {
  const toMunicipality = ramp(zoom, BAND_CENTERS.kantonGemeinde)
  const toHectare = ramp(zoom, BAND_CENTERS.gemeindeHektar)
  return {
    kanton: 1 - toMunicipality,
    gemeinde: toMunicipality * (1 - toHectare),
    hektar: toHectare,
  }
}

export function activeLevel(zoom: number): 'kanton' | 'gemeinde' | 'hektar' {
  const w = lodWeights(zoom)
  if (w.hektar >= w.gemeinde && w.hektar >= w.kanton) return 'hektar'
  return w.gemeinde >= w.kanton ? 'gemeinde' : 'kanton'
}
