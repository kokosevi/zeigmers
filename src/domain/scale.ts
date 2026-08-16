export type ScaleMode = 'logarithmisch' | 'linear'

// Exponent der Skala: h = (v / vmax) ** GAMMA * maxHeight (Change 6, Ablösung
// der ursprünglichen `log10(1+v)/log10(1+vmax)`-Skala, die den ganzen Kanton
// zwischen 42 % und 100 % Balkenhöhe zusammendrückte — ein Faktor 2.4 für
// einen Datenbereich mit Faktor 470). γ = 0.4 spreizt denselben Bereich über
// 9 %–100 % (Faktor 11.7).
export const DAMPENING_EXPONENT = 0.4

/** Höhen in Metern. `'logarithmisch'` (Exponent `DAMPENING_EXPONENT`) ist der
 *  Standard für Ansicht «Beschäftigte» (Re-Review 2026-08-15: hiess hier
 *  fälschlich «Ansicht A» — das ist «Börsennotierte Firmen», nicht
 *  «Beschäftigte», siehe `ui/nav.ts`, `VIEW_LABEL`), sonst bestünde die Karte
 *  aus einem Turm und einer Ebene — siehe `ui/nav.ts`, `DEFAULT_MODE`.
 *
 *  Namensstand (Redesign Change 5, 2026-08-14): Button und Legende sagen
 *  wieder «logarithmisch» — der Name, den Betrachter aus jeder anderen
 *  Kartenanwendung kennen, an der Stelle, an der sie navigieren, nicht
 *  behaupten. Die Funktion dahinter bleibt unverändert die oben beschriebene
 *  **Potenzskala** (`(v/vmax)**0.4`), **keine echte Logarithmusfunktion** —
 *  ein Logarithmus, an dieselbe Balkenhöhen-Kurve gefittet, drückt die
 *  kleinste Gemeinde auf rund 81 m statt 256 m (bei `vmax` = Aarau,
 *  `maxHeight` = 3000 m) — praktisch flach, nicht das freigegebene Bild.
 *  Diese Diskrepanz wird nicht verschwiegen: die Eckbox (`ui/notices.ts`)
 *  nennt die tatsächliche Formel, an der einzigen Stelle der Oberfläche, wo
 *  Nutzende eine Behauptung nachprüfen statt nur einen Schalter bedienen
 *  wollen. Frühere Zwischenlösung («gedämpft», die den Exponenten direkt im
 *  Legenden-Label nannte) ist damit hinfällig: die Legende zeigt seit Change
 *  3 desselben Redesigns gar keinen Skalenmodus mehr an. */
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
    const scaled = mode === 'logarithmisch' ? Math.pow(fraction, DAMPENING_EXPONENT) : fraction
    out[i] = scaled * maxHeight
  }
  return out
}

/** Wie `computeElevations`, aber vorzeichenfähig: die Dämpfung wirkt auf den
 *  Betrag, das Vorzeichen bleibt stehen.
 *
 *  Gebraucht für die Kennzahl «Gewinn», bei der 41 der 201 Gesellschaften
 *  einen Verlust ausweisen. `vmax` ist deshalb das Maximum der **Beträge**,
 *  nicht der Werte — sonst normierte eine Auswahl aus lauter Verlustfirmen
 *  gegen ein Maximum von null. */
export function computeSignedElevations(
  values: Float32Array,
  vmax: number,
  maxHeight: number,
  mode: ScaleMode,
): Float32Array {
  const out = new Float32Array(values.length)
  if (vmax <= 0) return out

  for (let i = 0; i < values.length; i++) {
    const value = values[i]!
    if (value === 0) continue
    const fraction = Math.abs(value) / vmax
    const scaled = mode === 'logarithmisch' ? Math.pow(fraction, DAMPENING_EXPONENT) : fraction
    out[i] = Math.sign(value) * scaled * maxHeight
  }
  return out
}
