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
   *  Gesellschaften ausgewählt» statt nur «X Gesellschaften» — sonst liesse
   *  sich aus ihr allein nicht ablesen, dass gerade nicht alle
   *  Gesellschaften mitgezählt werden. Das Wort «ausgewählt» ist dabei kein
   *  Zierrat: die Landing (`index.html`) und, seit der Auftraggeber-Korrektur
   *  vom 2026-08-17, die Eckbox dieser Seite (`ui/notices.ts`,
   *  `coverageNote`) nennen bereits ein anderes «X von Y» über Gesellschaften
   *  (Kartenabdeckung ggü. kotierten SIX-Titeln, z. B. «201 Gesellschaften
   *  von 224 kotierten SIX-Titeln» — bis zum Kahlschlag desselben Datums
   *  stand dieselbe Angabe stattdessen in der Legende, `ui/legend.ts`,
   *  `scopeLabel`) — ohne benannten Bezug wären zwei verschiedene «X von
   *  Y»-Aussagen leicht zu verwechseln. */
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

/** Zahl mit passender Endung — «1 Gesellschaft», aber «2 Gesellschaften».
 *  Bei einem engen Filter (eine einzige übrig gebliebene Branche, eine
 *  einzige Gesellschaft mit Wert) ist die Einzahl ein erreichbarer Fall,
 *  keine theoretische Feinheit. */
function zahlwort(count: number, einzahl: string, mehrzahl: string): string {
  return `${formatNumber(count)} ${count === 1 ? einzahl : mehrzahl}`
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

  // «ausgewählt» ist ausschliesslich bei aktivem Filter dabei (siehe
  // `KennzahlenOptions.totalCompanies`) — ungefiltert (`totalCompanies ===
  // result.visible.length`) bleibt es bei der einfachen Zahl, sonst
  // behauptete die Zeile auch ohne Filter einen Bezug zu einer
  // Grundgesamtheit. `totalCompanies` ist in diesem Zweig immer mindestens
  // 2 (sonst wäre es nicht grösser als `visible.length >= 1`), «Gesellschaf-
  // ten» braucht hier deshalb keine Einzahlprüfung.
  const anzahl =
    totalCompanies > result.visible.length
      ? `${formatNumber(result.visible.length)} von ${formatNumber(totalCompanies)} ` +
        'Gesellschaften ausgewählt'
      : zahlwort(result.visible.length, 'Gesellschaft', 'Gesellschaften')

  const teile = [anzahl]

  if (result.withValue.length === 0) {
    // Eine Auswahl kann sichtbar, aber vollständig wertlos sein — etwa eine
    // Branche voller Platzhalterfirmen bei Kennzahl Umsatz
    // (`domain/metric.ts`, `metricValue`: `placeholder` ergibt `null`).
    // `result.sum` ist dann zwar `0`, aber eine gemessene Summe UND eine
    // Summe aus null Datenpunkten sehen als «0 CHF» identisch aus — die
    // Zeile müsste sonst eine Messung behaupten, die nicht stattgefunden
    // hat. Deshalb hier ein Satz statt einer Zahl, kein Sonderfall der
    // Formatierung von `0`.
    teile.push('keine davon mit einem Wert in dieser Kennzahl')
  } else {
    // Der Nenner ist der Kern dieser Zeile: die Summe entsteht aus
    // `withValue.length` Angaben, nicht aus der (meist grösseren) Anzahl
    // sichtbarer Gesellschaften — «201 Gesellschaften · 762.1 Mrd. CHF»
    // allein würde eine Summe über eine Grundgesamtheit stellen, zu der sie
    // nicht gehört (manche Gesellschaft hat für genau diese Kennzahl keinen
    // Wert). Beide Zahlen stehen deshalb nebeneinander.
    //
    // Fix-Runde (2026-08-16, Abschluss-Review Finding I2): der Nenner stand
    // bis dahin VOR der Summe, die er qualifiziert («201 Gesellschaften ·
    // aus 188 Angaben · Jahresumsatz 762.14 Mrd. CHF») — dadurch las er sich
    // als Zusatz zur ERSTEN Zahl («201 Gesellschaften»), nicht zur Summe,
    // die zwei Wörter weiter erst folgt. Die Spec (Abschnitt 6) formuliert
    // umgekehrt: die Summe zuerst, der Nenner direkt danach («762.1 Mrd. CHF
    // Umsatz aus 188 Angaben»). `teile.push('aus … Angaben')` steht deshalb
    // jetzt NACH der Summen-/Saldozeile, in beiden Zweigen unten.
    const angabenTeil = `aus ${zahlwort(result.withValue.length, 'Angabe', 'Angaben')}`

    if (metric === 'gewinn') {
      // Gewinn nennt den Saldo, nicht «die Summe» — in ihn gehen negative
      // Beträge ein (`metricAllowsNegative`), eine reine Summenangabe
      // verschwiege, dass darunter Verluste sind. Die Verlustzahl steht
      // zusätzlich für sich: ein positiver Saldo kann einzelne
      // Verlustfirmen trotzdem überdecken.
      teile.push(`Saldo ${formatMetric(result.sum, metric)}`)
      teile.push(angabenTeil)
      if (result.losses > 0) {
        teile.push(
          `${formatNumber(result.losses)} von ${formatNumber(result.withValue.length)} ` +
            'Gesellschaften mit Verlust',
        )
      }
    } else {
      teile.push(`${metricLabel(metric)} ${formatMetric(result.sum, metric)}`)
      teile.push(angabenTeil)
    }
  }

  const zeile = document.createElement('div')
  zeile.textContent = teile.join(' · ')
  el.appendChild(zeile)

  // Der Vergleich, für den es dieses Projekt gibt: die Mitarbeitenden der
  // kotierten Gesellschaften WELTWEIT (Konzernzahl — `metricValue` liest
  // `company.employees` ohne Schweiz-Filter) gegen die Beschäftigten IN der
  // Schweiz. Nur bei dieser Kennzahl sinnvoll — Umsatz und Gewinn haben
  // keine nationale Vergleichszahl, die dasselbe misst, und ohne einen
  // einzigen Mitarbeitenden-Datenpunkt (`withValue.length === 0`) wäre die
  // «Mitarbeitende weltweit»-Seite des Vergleichs dieselbe erfundene Null
  // wie oben, deshalb hier dieselbe Bedingung.
  //
  // Fix-Runde (2026-08-16, Abschluss-Review Finding I3), zwei Korrekturen:
  //
  // 1. `result.sum` ist die GEFILTERTE Summe (Branchen-/Organisationsform-
  //    filter, siehe `applySelection`), der Satz sprach aber unqualifiziert
  //    von «der kotierten Gesellschaften weltweit» — als wäre stets die
  //    Gesamtheit gemeint. Ein Filter (z. B. «nur diese» Branche) verändert
  //    `result.sum` sichtbar, ohne dass der Satz das ausweist. «der
  //    ausgewählten kotierten Gesellschaften» stimmt in beiden Fällen: auch
  //    ungefiltert ist «alle Branchen» eine (die grösstmögliche) Auswahl.
  // 2. `nationalEmployees` ist keine exakte Zahl: dieselbe App weist sie im
  //    Klick-Panel der Kantonsseite als OBERGRENZE aus (`ui/panel.ts`,
  //    `aggregateCellContent`, `footnote`) — die BFS-Rundung «unter 4 → 4»
  //    treibt jede Kantonssumme systematisch nach oben, und
  //    `nationalEmployees` ist die Summe über alle 26 Kantone. Hier stand
  //    sie bisher ohne diesen Vorbehalt, obwohl sie exakt derselben Quelle
  //    entstammt. Kein hartkodierter Prozentwert (der veralten könnte, siehe
  //    `ui/notices.ts`, Fund 1) — nur die qualitative Aussage, die auch das
  //    Panel trägt.
  if (metric === 'mitarbeitende' && nationalEmployees !== null && result.withValue.length > 0) {
    const vergleich = document.createElement('div')
    vergleich.textContent =
      `Vergleich: ${formatMetric(result.sum, metric)} Mitarbeitende der ausgewählten ` +
      `kotierten Gesellschaften weltweit gegenüber rund ${formatNumber(nationalEmployees)} ` +
      'Beschäftigten in der Schweiz (Obergrenze: das BFS rundet kleine Betriebe auf ' +
      'mindestens 4 Beschäftigte auf).'
    el.appendChild(vergleich)
  }
}
