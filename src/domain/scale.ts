export type ScaleMode = 'log' | 'linear'

/** Höhen in Metern. Logarithmisch ist der Standard, sonst besteht die Karte
 *  aus einem Turm und einer Ebene. */
export function computeElevations(
  values: Float32Array,
  vmax: number,
  maxHeight: number,
  mode: ScaleMode,
): Float32Array {
  const out = new Float32Array(values.length)
  if (vmax <= 0) return out

  const denominator = mode === 'log' ? Math.log10(1 + vmax) : vmax
  if (denominator <= 0) return out

  for (let i = 0; i < values.length; i++) {
    const value = values[i]!
    if (value <= 0) continue
    const numerator = mode === 'log' ? Math.log10(1 + value) : value
    out[i] = (numerator / denominator) * maxHeight
  }
  return out
}

/** Drei Stützwerte für die Legende, gleichmässig über die aktive Skala verteilt.
 *
 *  Die oberste Marke ist immer exakt `vmax`. Die unteren beiden werden auf ganze
 *  Zahlen gerundet, aber nur dann, wenn das Runden die Reihenfolge nicht zerstört
 *  — sonst bleibt der unskalierte Wert stehen. Ohne diese Wache würden bei kleinem
 *  `vmax` benachbarte Marken auf denselben Integer runden (oder die 0.6-Marke bis
 *  auf `vmax` hochrunden), weil der Logarithmus die drei Stützpunkte dann eng
 *  zusammenschiebt. */
export function referenceTicks(vmax: number, mode: ScaleMode): number[] {
  if (vmax <= 0) return [0, 0, 0]
  const fractions = [0.25, 0.6]
  const ticks: number[] = []
  let prev = 0
  for (const f of fractions) {
    const raw = mode === 'log' ? Math.pow(10, Math.log10(1 + vmax) * f) - 1 : vmax * f
    const rounded = Math.round(raw)
    const value = rounded > prev && rounded < vmax ? rounded : raw > prev ? raw : prev
    ticks.push(value)
    prev = value
  }
  ticks.push(vmax)
  return ticks
}
