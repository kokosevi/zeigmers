import { abschnitt } from './leiste'

/** Breadcrumb im Leistenkopf von `/beschaeftigte/` — ersetzt
 *  `ui/backControl.ts` vollständig (Handoff 1c, Punkt 1).
 *
 *  Der Zurück-Knopf sagte nur, DASS es zurückgeht. Das Breadcrumb sagt
 *  zusätzlich, wo man steht — auf der Schweiz-Stufe, in einem Kanton, oder (bei
 *  einer künftigen dritten Stufe) in einer Gemeinde. Damit verschwindet
 *  ausserdem ein eigenes Element von der Karte: der Knopf sass als
 *  `#zurueck-gruppe` unter der Steuerung, mit einem von Hand abgestimmten
 *  `top`-Wert, der bei jeder Änderung der Steuerung mitwandern musste (siehe
 *  den entfallenen Kommentar in `style.css`).
 *
 *  Die aktive Stufe ist kein Ziel: sie trägt keinen Unterstrich, keinen Zeiger
 *  und keinen Klick-Handler — man steht schon dort. */

export interface BreadcrumbStufe {
  name: string
  /** Fehlt sie, ist das die aktive Stufe. */
  onPick?: () => void
}

/** Zeichnet die Stufen in den Leistenkopf, unter die Wortmarke.
 *
 *  Der Kopf wird dabei NICHT geleert: dort stehen Wortmarke und Ansichtsname
 *  von `ui/nav.ts`, die bei einem Stufenwechsel unverändert bleiben. Ein
 *  eigener Container mit stabiler ID daneben, wie im Leistenfuss (siehe
 *  `ui/leiste.ts`, `fussTeil`). */
export function renderBreadcrumb(stufen: readonly BreadcrumbStufe[]): void {
  const kopf = document.getElementById('leiste-kopf') ?? abschnitt('kopf')
  let el = document.getElementById('leiste-breadcrumb')
  if (!el) {
    el = document.createElement('nav')
    el.id = 'leiste-breadcrumb'
    el.className = 'breadcrumb'
    el.setAttribute('aria-label', 'Stufe')
    kopf.appendChild(el)
  }
  el.replaceChildren()

  stufen.forEach((stufe, index) => {
    if (index > 0) {
      const trenner = document.createElement('span')
      trenner.className = 'breadcrumb-trenner'
      trenner.setAttribute('aria-hidden', 'true')
      trenner.textContent = '›'
      el.appendChild(trenner)
    }

    if (!stufe.onPick) {
      // Aktive Stufe: ein `<span>`, kein deaktivierter Knopf — ein Knopf, den
      // man nicht drücken kann, ist in der Tab-Reihenfolge trotzdem eine
      // Station und verspricht eine Aktion, die es nicht gibt.
      const aktiv = document.createElement('span')
      aktiv.className = 'breadcrumb-stufe breadcrumb-aktiv'
      aktiv.setAttribute('aria-current', 'true')
      aktiv.textContent = stufe.name
      el.appendChild(aktiv)
      return
    }

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'breadcrumb-stufe'
    button.textContent = stufe.name
    button.addEventListener('click', () => stufe.onPick?.())
    el.appendChild(button)
  })
}
