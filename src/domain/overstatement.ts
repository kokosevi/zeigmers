import type { Level } from '../data/loader'

export interface OverstatementStats {
  /** Median der Überschätzung (`3 · ambiguousCells / value`) über alle
   *  Gemeinden mit Beschäftigten, in Prozent. */
  medianPct: number
  /** Maximum derselben Grösse — typischerweise eine kleine Gemeinde, in der
   *  wenige mehrdeutige Hektaren einen grossen Anteil der Summe ausmachen. */
  maxPct: number
}

/** Prozentuale Überschätzung je Gemeinde, daraus Median und Maximum.
 *
 *  Dieselbe Rechnung liegt den im Pflichthinweis (`ui/notices.ts`) und im
 *  README fest verdrahteten Zahlen für den Kanton Aargau 2023 zugrunde
 *  (Median ~15.7 %, Maximum ~54.1 % in Obermumpf) — die dort bewusst als
 *  Literal stehen, weil der Hinweistext wortwörtlich vorgegeben ist. Die
 *  Legende (`ui/legend.ts`) braucht dieselbe Grössenordnung aber ohne
 *  AG-2023-spezifischen Text, damit ein Kantonswechsel (siehe README,
 *  Abschnitt „Kantonswechsel") automatisch die richtigen Zahlen für den neuen
 *  Datensatz zeigt statt die alten zu wiederholen — deshalb hier live aus dem
 *  geladenen Level berechnet statt hartkodiert. */
export function municipalityOverstatementStats(level: Level): OverstatementStats {
  const { values, gemeindeIdx } = level.arrays
  const gemeinden = level.meta.gemeinden
  if (!gemeindeIdx || !gemeinden) return { medianPct: 0, maxPct: 0 }

  const pct: number[] = []
  for (let i = 0; i < values.length; i++) {
    const value = values[i] ?? 0
    if (value <= 0) continue
    const gemeinde = gemeinden[gemeindeIdx[i] ?? -1]
    if (!gemeinde) continue
    pct.push(((3 * gemeinde.ambiguousCells) / value) * 100)
  }
  if (pct.length === 0) return { medianPct: 0, maxPct: 0 }

  pct.sort((a, b) => a - b)
  const mid = Math.floor(pct.length / 2)
  const medianPct = pct.length % 2 === 0 ? (pct[mid - 1]! + pct[mid]!) / 2 : pct[mid]!
  return { medianPct, maxPct: pct[pct.length - 1]! }
}
