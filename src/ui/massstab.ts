import { formatNumber } from './format'

/** Der Höhenmassstab auf `/beschaeftigte/` (Handoff 1c, Punkt 5) — die kleine
 *  Karte unten links, die auf `/firmen/` entfallen ist.
 *
 *  Warum sie hier bleibt und dort nicht: Auf der Firmenkarte trägt die Höhe
 *  einen Umsatz, für den die Grössenordnung im Panel steht und dessen Spannweite
 *  die Zeile unter dem Höhen-Umschalter benennt. Hier trägt sie Beschäftigte je
 *  Kanton — eine Grösse mit einem Spannungsverhältnis von über hundert zwischen
 *  dem kleinsten und dem grössten Kanton, bei dem eine Säule ohne Bezugspunkt
 *  nicht mehr zu lesen ist.
 *
 *  Alle Zahlen kommen aus dem Artefakt, das die Seite ohnehin lädt
 *  (`ch_kantone`) — der Faktor ist gerechnet, nicht geschätzt. */

export interface MassstabOptions {
  /** Die Werte der aktuellen Stufe (26 Kantone bzw. die Gemeinden des
   *  betretenen Kantons), unsortiert. */
  werte: readonly number[]
  /** Name des kleinsten und des grössten Eintrags, für den Satz darunter. */
  kleinster: string
  groesster: string
}

/** Vier Stufen zwischen dem kleinsten und dem grössten Wert, dieselbe Dämpfung
 *  wie die Karte selbst (`(v/vmax)**0.4`, `domain/scale.ts`) — die Säulen im
 *  Massstab stehen damit im gleichen Verhältnis wie die auf der Karte, sonst
 *  wäre er ein Massstab für etwas anderes.
 *
 *  Ausgewählt werden echte Werte aus dem Datensatz (Minimum, zwei Quantile,
 *  Maximum), keine gerundeten Wunschzahlen: eine erfundene Stufe wäre eine
 *  Zahl, die nirgends vorkommt. */
export function stufen(werte: readonly number[]): number[] {
  const sortiert = [...werte].filter((w) => w > 0).sort((a, b) => a - b)
  if (sortiert.length === 0) return []
  const bei = (anteil: number) =>
    sortiert[Math.min(sortiert.length - 1, Math.floor(anteil * (sortiert.length - 1)))]!
  // Reihenfolge klein → gross, damit die Säulen ansteigen.
  const kandidaten = [bei(0), bei(0.5), bei(0.85), bei(1)]
  // Doppelte entfernen (kleine Datensätze), Reihenfolge erhalten.
  return kandidaten.filter((wert, index) => kandidaten.indexOf(wert) === index)
}

export function renderMassstab(options: MassstabOptions): void {
  const { werte, kleinster, groesster } = options
  let el = document.getElementById('massstab')
  if (!el) {
    el = document.createElement('div')
    el.id = 'massstab'
    document.getElementById('ui')?.appendChild(el)
  }
  el.replaceChildren()

  const liste = stufen(werte)
  if (liste.length === 0) {
    el.hidden = true
    return
  }
  el.hidden = false

  const titel = document.createElement('p')
  titel.className = 'massstab-titel'
  titel.textContent = 'Höhe = Beschäftigte'
  el.appendChild(titel)

  const max = liste[liste.length - 1]!
  const reihe = document.createElement('div')
  reihe.className = 'massstab-stufen'
  for (const wert of liste) {
    const stufe = document.createElement('div')
    stufe.className = 'massstab-stufe'
    const saeule = document.createElement('span')
    saeule.className = 'massstab-saeule'
    // Dieselbe Dämpfung wie die Karte (Exponent 0.4) auf eine Höhe von 34 px —
    // der Massstab zeigt damit dasselbe Verhältnis, das die Säulen zeigen.
    saeule.style.height = `${Math.max(2, Math.pow(wert / max, 0.4) * 34)}px`
    const zahl = document.createElement('span')
    zahl.className = 'massstab-wert'
    zahl.textContent = formatNumber(wert)
    stufe.append(saeule, zahl)
    reihe.appendChild(stufe)
  }
  el.appendChild(reihe)

  // Der Satz nennt das Verhältnis, das die Dämpfung überhaupt nötig macht.
  // Gerundet auf eine ganze Zahl, weil «108.3-fach» eine Genauigkeit vorgäbe,
  // die die Aussage nicht braucht — der Faktor selbst ist gerechnet.
  const min = liste[0]!
  const faktor = Math.round(max / min)
  const notiz = document.createElement('p')
  notiz.className = 'massstab-notiz'
  notiz.textContent = `Von ${kleinster} bis ${groesster} liegen ${faktor}-fache Unterschiede.`
  el.appendChild(notiz)
}

/** Entfernt den Massstab — auf der Firmenseite gibt es ihn nicht, und beim
 *  Wechsel auf eine Stufe ohne Werte soll keine leere Fläche stehen bleiben. */
export function hideMassstab(): void {
  const el = document.getElementById('massstab')
  if (el) el.hidden = true
}
