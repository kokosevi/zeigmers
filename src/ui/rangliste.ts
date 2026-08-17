import { formatNumber } from './format'
import { label, teil } from './leiste'

/** Rangliste in der Leiste von `/beschaeftigte/` (Handoff 1c, Punkt 4).
 *
 *  Der eigentliche Gewinn dieser Seite: Die Karte zeigt 26 extrudierte
 *  Kantonsflächen, aber welcher davon der grösste ist, liest man ihr nur
 *  ungenau ab — grosse Kantone wirken durch ihre Grundfläche gewichtiger, als
 *  sie sind (derselbe Vorbehalt, den die Eckbox nennt). Eine sortierte Liste
 *  daneben macht die Rangfolge lesbar, ohne dass man die Karte drehen muss.
 *
 *  Hover hebt hervor, Klick betritt — beide Wege führen in dieselben Funktionen
 *  wie ein Klick auf die Fläche selbst (`karte/beschaeftigte.ts`), es entsteht
 *  kein zweiter Navigationspfad. */

export interface RangEintrag<T> {
  id: string
  name: string
  /** Die Grösse, nach der sortiert wird — Beschäftigte am Arbeitsort. */
  wert: number
  nutzlast: T
}

export interface RanglisteOptions<T> {
  /** «Rangliste» bzw. auf Gemeindestufe der Kantonsname. */
  titel: string
  eintraege: readonly RangEintrag<T>[]
  onPick: (nutzlast: T) => void
  /** Hover auf einer Zeile — hebt die Fläche auf der Karte hervor. `null` beim
   *  Verlassen. Optional: die Gemeindestufe hat heute keine Hervorhebung. */
  onHover?: (nutzlast: T | null) => void
}

/** Sichtbar ohne Aufklappen. Neun Zeilen sind rund ein Drittel der 26 Kantone
 *  — genug, um die Spitze zu lesen, kurz genug, dass Kennzahl und Höhe darüber
 *  im Bild bleiben. */
export const SICHTBAR = 9

/** Absteigend sortiert, als reine Funktion — damit die Sortierung ohne DOM
 *  prüfbar ist. Kopiert, statt an der Eingabe zu sortieren: die Liste kommt
 *  aus den Artefakten (`ch_kantone`), und `sort()` würde sie an der Quelle
 *  umstellen. */
export function sortiere<T>(eintraege: readonly RangEintrag<T>[]): RangEintrag<T>[] {
  return [...eintraege].sort((a, b) => b.wert - a.wert)
}

/** Balkenbreite in Prozent: gedämpft mit Exponent 0.5, wie der Entwurf es
 *  vorgibt. Ohne Dämpfung wären die kleinsten Kantone (Appenzell I.Rh. gegen
 *  Zürich: Faktor über 100) nicht mehr von null zu unterscheiden — dieselbe
 *  Überlegung, aus der die Karte selbst ihre Höhen dämpft
 *  (`domain/scale.ts`), nur mit einem anderen Exponenten, weil hier eine Länge
 *  statt einer Höhe gelesen wird. `max <= 0` ergibt 0 statt NaN. */
export function balkenBreite(wert: number, max: number): number {
  if (max <= 0) return 0
  return Math.pow(Math.max(0, wert) / max, 0.5) * 100
}

/** Zeichnet die Liste in den Listen-Abschnitt der Leiste. Der aufgeklappte
 *  Zustand lebt in diesem Modul (wie der Suchtext in `ui/suche.ts`): er
 *  beeinflusst die Karte nicht und gehört deshalb nicht in `selection`. */
export function renderRangliste<T>(options: RanglisteOptions<T>): void {
  const { titel, eintraege, onPick, onHover } = options
  const wurzel = teil('liste', 'leiste-rangliste')

  const sortiert = sortiere(eintraege)
  const max = sortiert[0]?.wert ?? 0
  // Der aufgeklappte Zustand überlebt einen Neuaufbau der Leiste nicht — das
  // ist richtig: ein Stufenwechsel (Kanton betreten) tauscht die ganze Liste
  // aus, eine mitgeschleppte Aufklappung bezöge sich auf eine andere Menge.
  let offen = false

  const zeichne = () => {
    wurzel.replaceChildren()

    const aktion = document.createElement('button')
    aktion.type = 'button'
    aktion.className = 'leiste-aktion'
    aktion.dataset.alle = ''
    const versteckt = sortiert.length - SICHTBAR
    aktion.textContent = offen ? 'weniger' : `alle ${sortiert.length}`
    aktion.setAttribute('aria-expanded', String(offen))
    aktion.addEventListener('click', () => {
      offen = !offen
      zeichne()
    })
    // Nur zeigen, wenn es überhaupt etwas aufzuklappen gibt.
    wurzel.appendChild(versteckt > 0 ? label(titel, aktion) : label(titel))

    const liste = document.createElement('ul')
    liste.className = 'leiste-liste'
    const zeigen = offen ? sortiert : sortiert.slice(0, SICHTBAR)

    for (const eintrag of zeigen) {
      const li = document.createElement('li')
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'rang-zeile'
      button.dataset.rang = eintrag.id

      const kopf = document.createElement('span')
      kopf.className = 'rang-kopf'
      const name = document.createElement('span')
      name.className = 'rang-name'
      name.textContent = eintrag.name
      const wert = document.createElement('span')
      wert.className = 'rang-wert'
      wert.textContent = formatNumber(eintrag.wert)
      kopf.append(name, wert)

      const spur = document.createElement('span')
      spur.className = 'rang-spur'
      const balken = document.createElement('span')
      balken.className = 'rang-balken'
      balken.style.display = 'block'
      balken.style.width = `${balkenBreite(eintrag.wert, max)}%`
      spur.appendChild(balken)

      button.append(kopf, spur)
      button.addEventListener('click', () => onPick(eintrag.nutzlast))
      if (onHover) {
        button.addEventListener('mouseenter', () => onHover(eintrag.nutzlast))
        button.addEventListener('mouseleave', () => onHover(null))
        // Tastaturbedienung: dieselbe Hervorhebung beim Durchtabben, sonst
        // zeigt die Karte nur der Maus, wovon gerade die Rede ist.
        button.addEventListener('focus', () => onHover(eintrag.nutzlast))
        button.addEventListener('blur', () => onHover(null))
      }
      li.appendChild(button)
      liste.appendChild(li)
    }
    wurzel.appendChild(liste)
  }

  zeichne()
}
