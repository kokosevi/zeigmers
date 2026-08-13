import { NOGA_GROUPS, NOGA_UNKNOWN_INDEX, UNKNOWN_COLOR } from './noga.generated'

// Bit 0 aus `flags` (siehe Spec 5/6.4): eine Zelle mit dem BFS-aufgerundeten
// Wert 4. Bis 2026-08-13 hatte `ui/legend.ts` hierfür einen eigenen Muster-
// Swatch, der denselben Alpha-Wert verwendete — daher waren beide Konstanten
// exportiert. Der Swatch ist mit der Hektarstufe entfallen (siehe README),
// `buildColors` ist seither der einzige Verwendungsort; nicht mehr exportiert.
const FLAG_AMBIGUOUS = 1
const AMBIGUOUS_ALPHA = 140

/** RGBA je Zeile. Mehrdeutige Hektaren behalten ihre Branchenfarbe, werden aber
 *  durchscheinend gezeichnet — die Farbe bleibt lesbar, die Unschärfe sichtbar. */
export function buildColors(
  noga: Uint8Array,
  flags: Uint8Array,
  alpha = 255,
): Uint8Array {
  const out = new Uint8Array(noga.length * 4)
  for (let i = 0; i < noga.length; i++) {
    const index = noga[i]!
    const group = index === NOGA_UNKNOWN_INDEX ? undefined : NOGA_GROUPS[index]
    const rgb = group?.color ?? UNKNOWN_COLOR
    const offset = i * 4
    out[offset] = rgb[0]
    out[offset + 1] = rgb[1]
    out[offset + 2] = rgb[2]
    out[offset + 3] = (flags[i]! & FLAG_AMBIGUOUS) !== 0 ? AMBIGUOUS_ALPHA : alpha
  }
  return out
}
