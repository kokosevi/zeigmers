export type ScaleMode = 'gedaempft' | 'linear'

// Exponent der gedämpften Skala: h = (v / vmax) ** GAMMA * maxHeight. Vom
// Nutzer aus einer Tabelle gewählt (Change 6, Ablösung der bisherigen
// `log10(1+v)/log10(1+vmax)`-Skala, die den ganzen Kanton zwischen 42 % und
// 100 % Balkenhöhe zusammendrückte — ein Faktor 2.4 für einen Datenbereich
// mit Faktor 470). γ = 0.4 spreizt denselben Bereich über 9 %–100 % (Faktor
// 11.7). Exportiert, weil `referenceTicks` unten dieselbe Zahl für die
// Umkehrfunktion braucht: Ein Wert, der Skalenposition `f` erreicht, ist
// `v = vmax * f ** (1/GAMMA)`.
export const DAMPENING_EXPONENT = 0.4

/** Höhen in Metern. «gedämpft» (Exponent `DAMPENING_EXPONENT`) ist der
 *  Standard für Ansicht A (Beschäftigte), sonst bestünde die Karte aus einem
 *  Turm und einer Ebene — siehe `ui/toggle.ts`, `DEFAULT_MODE`. Der Name
 *  ersetzt das frühere «logarithmisch»: eine Potenzskala ist keine
 *  logarithmische, das Label muss die tatsächliche Funktion nennen (siehe
 *  `ui/legend.ts`, `MODE_LABEL`, die den Exponenten mit ausschreibt, damit
 *  die Behauptung nachprüfbar bleibt). */
export function computeElevations(
  values: Float32Array,
  vmax: number,
  maxHeight: number,
  mode: ScaleMode,
): Float32Array {
  const out = new Float32Array(values.length)
  if (vmax <= 0) return out

  for (let i = 0; i < values.length; i++) {
    const value = values[i]!
    if (value <= 0) continue
    const fraction = value / vmax
    const scaled = mode === 'gedaempft' ? Math.pow(fraction, DAMPENING_EXPONENT) : fraction
    out[i] = scaled * maxHeight
  }
  return out
}

/** Drei Stützwerte für die Legende, gleichmässig über die aktive Skala verteilt.
 *
 *  Die oberste Marke ist immer exakt `vmax`. Die unteren beiden werden auf ganze
 *  Zahlen gerundet, aber nur dann, wenn das Runden die Reihenfolge nicht zerstört
 *  — sonst bleibt der unskalierte Wert stehen. Ohne diese Wache würden bei kleinem
 *  `vmax` benachbarte Marken auf denselben Integer runden (oder die 0.6-Marke bis
 *  auf `vmax` hochrunden), weil die aktive Skala die drei Stützpunkte dann eng
 *  zusammenschiebt.
 *
 *  Für «gedämpft» ist `raw` die Umkehrung von `computeElevations`: der Wert,
 *  dessen Balken bei Skalenanteil `f` läge, ist `vmax * f ** (1/GAMMA)` — bei
 *  `GAMMA = 0.4` also `f ** 2.5`, monoton wachsend in `f` wie zuvor beim
 *  Logarithmus, die Monotonie-Argumentation der Rundungs-Wache gilt
 *  unverändert. */
export function referenceTicks(vmax: number, mode: ScaleMode): number[] {
  if (vmax <= 0) return [0, 0, 0]
  const fractions = [0.25, 0.6]
  const ticks: number[] = []
  let prev = 0
  for (const f of fractions) {
    const raw = mode === 'gedaempft' ? vmax * Math.pow(f, 1 / DAMPENING_EXPONENT) : vmax * f
    const rounded = Math.round(raw)
    const value = rounded > prev && rounded < vmax ? rounded : raw > prev ? raw : prev
    ticks.push(value)
    prev = value
  }
  ticks.push(vmax)
  return ticks
}
