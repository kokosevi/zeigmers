import { formatMetric, metricLabel, type Metric } from '../domain/metric'
import type { SelectionResult } from '../domain/selection'
import { formatNumber } from './format'

/** Eingaben der Kennzahlenzeile — reines Rendern, kein eigener Zustand
 *  (Muster wie `ui/legend.ts`): die Aufrufstelle hält Filter und Auswahl,
 *  diese Funktion zeichnet nur, was man ihr übergibt. */
export interface KennzahlenOptions {
  result: SelectionResult
  metric: Metric
  /** Gesamtzahl der Gesellschaften VOR dem aktuellen Branchen-/
   *  Organisationsformfilter (auf der Firmenseite z. B.
   *  `companies.stats.count`). Nur zum Vergleich mit `result.visible.length`
   *  gedacht: schrumpft ein Filter die Auswahl, sagt die Zeile «X von Y
   *  Gesellschaften» statt nur «X Gesellschaften» — sonst liesse sich aus
   *  ihr allein nicht ablesen, dass gerade nicht alle Gesellschaften
   *  mitgezählt werden. */
  totalCompanies: number
  /** Beschäftigte der Schweiz insgesamt, für den Vergleich bei der Kennzahl
   *  «Mitarbeitende» — der Vergleich, für den dieses Projekt besteht: rund
   *  2 Mio. Mitarbeitende der kotierten Gesellschaften weltweit gegen die
   *  Beschäftigten im Land. Kommt als Parameter herein statt hartkodiert zu
   *  sein; die Verdrahtung summiert ihn aus dem Kantons-Artefakt, das die
   *  Firmenseite ohnehin lädt. `null`, solange diese Zahl (noch) nicht
   *  bekannt ist — dann bleibt der Vergleich schlicht weg, statt eine
   *  erfundene Zahl zu zeigen. */
  nationalEmployees: number | null
}

function box(): HTMLElement {
  let el = document.getElementById('kennzahlen')
  if (!el) {
    el = document.createElement('div')
    el.id = 'kennzahlen'
    document.getElementById('ui')?.appendChild(el)
  }
  el.replaceChildren()
  return el
}

/** Schmale Zeile am oberen Bildrand: zeigt ohne Klick, was die Karte gerade
 *  summiert. Bislang sah man 200 Säulen, aber nirgends, wie viel das
 *  zusammen ist — die Zeile schliesst genau diese Lücke und folgt dabei dem
 *  Filter (`result` kommt aus `applySelection`, neu berechnet bei jeder
 *  Branchen-/Organisationsformänderung). */
export function renderKennzahlen(options: KennzahlenOptions): void {
  const { result, metric, totalCompanies, nationalEmployees } = options
  const el = box()

  if (result.visible.length === 0) {
    const leer = document.createElement('div')
    leer.textContent = 'Keine Gesellschaft ausgewählt.'
    el.appendChild(leer)
    return
  }

  const anzahl =
    totalCompanies > result.visible.length
      ? `${formatNumber(result.visible.length)} von ${formatNumber(totalCompanies)} Gesellschaften`
      : `${formatNumber(result.visible.length)} Gesellschaften`

  // Der Nenner ist der Kern dieser Zeile: die Summe entsteht aus
  // `withValue.length` Angaben, nicht aus der (meist grösseren) Anzahl
  // sichtbarer Gesellschaften — «201 Gesellschaften · 762.1 Mrd. CHF» allein
  // würde eine Summe über eine Grundgesamtheit stellen, zu der sie nicht
  // gehört (manche Gesellschaft hat für genau diese Kennzahl keinen Wert,
  // siehe `domain/metric.ts`, `metricValue`). Beide Zahlen stehen deshalb
  // nebeneinander.
  const teile = [`${anzahl} · aus ${formatNumber(result.withValue.length)} Angaben`]

  if (metric === 'gewinn') {
    // Gewinn nennt den Saldo, nicht «die Summe» — in ihn gehen negative
    // Beträge ein (`metricAllowsNegative`), eine reine Summenangabe
    // verschwiege, dass darunter Verluste sind. Die Verlustzahl steht
    // zusätzlich für sich: ein positiver Saldo kann einzelne Verlustfirmen
    // trotzdem überdecken.
    teile.push(`Saldo ${formatMetric(result.sum, metric)}`)
    if (result.losses > 0) {
      teile.push(
        `${formatNumber(result.losses)} von ${formatNumber(result.withValue.length)} ` +
          'Gesellschaften mit Verlust',
      )
    }
  } else {
    teile.push(`${metricLabel(metric)} ${formatMetric(result.sum, metric)}`)
  }

  const zeile = document.createElement('div')
  zeile.textContent = teile.join(' · ')
  el.appendChild(zeile)

  // Der Vergleich, für den es dieses Projekt gibt: die Mitarbeitenden der
  // kotierten Gesellschaften WELTWEIT (Konzernzahl — `metricValue` liest
  // `company.employees` ohne Schweiz-Filter) gegen die Beschäftigten IN der
  // Schweiz. Nur bei dieser Kennzahl sinnvoll — Umsatz und Gewinn haben
  // keine nationale Vergleichszahl, die dasselbe misst.
  if (metric === 'mitarbeitende' && nationalEmployees !== null) {
    const vergleich = document.createElement('div')
    vergleich.textContent =
      `Vergleich: ${formatMetric(result.sum, metric)} Mitarbeitende der kotierten ` +
      `Gesellschaften weltweit gegenüber ${formatNumber(nationalEmployees)} Beschäftigten ` +
      'in der Schweiz.'
    el.appendChild(vergleich)
  }
}
