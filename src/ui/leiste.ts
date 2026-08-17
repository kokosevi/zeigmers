/** Die Leiste links — eine Spalte statt sechs Flächen an fünf Rändern
 *  (Handoff 1b/1c, 17. August 2026).
 *
 *  Dieses Modul baut **nur das Skelett** und gibt Abschnitte heraus; welcher
 *  Text darin steht, entscheidet weiterhin das Modul, dem er gehört
 *  (`ui/nav.ts`, `ui/suche.ts`, `ui/legend.ts`, `ui/rangliste.ts`,
 *  `ui/kennzahlen.ts`, `ui/notices.ts`). Das ist Absicht: die Alternative wäre
 *  ein Modul, das alle Texte der Oberfläche kennt — dann läge die
 *  Abdeckungsangabe nicht mehr bei den Vorbehalten, sondern in einem Layout-
 *  Baustein, und die Begründungen, warum ein Satz so lautet, wären von ihrem
 *  Satz getrennt.
 *
 *  Die Abschnitte sind feste Plätze in fester Reihenfolge, keine Anhäng-
 *  Reihenfolge: `abschnitt('branchen')` liefert dasselbe Element, egal welches
 *  Modul zuerst fragt. Vorher hing die Reihenfolge der Boxen daran, welche
 *  `render*()`-Funktion ihr Element zuerst an `#ui` hängte — auf schmalen
 *  Viewports musste das CSS das mit `order: -1` wieder einfangen (siehe den
 *  entfallenen Kommentar in `style.css`). Feste Plätze ersparen das.
 *
 *  Jeder Aufruf von `abschnitt()` gibt einen **leeren** Container zurück (er
 *  räumt seinen Inhalt selbst aus), passend zum bestehenden Muster: jede
 *  `renderX()`-Funktion zeichnet bei jedem `render()` neu und hält keinen
 *  eigenen Zustand. */

/** Die fünf Plätze der Leiste, von oben nach unten. `mitte` ist der einzige
 *  scrollbare Teil (siehe `style.css`): Kopf, Suche und Fuss sollen auch auf
 *  einem niedrigen Fenster stehen bleiben — zuerst soll die Branchen- bzw.
 *  Ranglisten-Liste scrollen, nicht die Summe aus dem Bild wandern. */
export type AbschnittName = 'kopf' | 'suche' | 'gruppen' | 'liste' | 'fuss'

const IDS: Record<AbschnittName, string> = {
  kopf: 'leiste-kopf',
  suche: 'leiste-suche',
  gruppen: 'leiste-gruppen',
  liste: 'leiste-liste',
  fuss: 'leiste-fuss',
}

/** Legt die Leiste an, falls sie noch nicht existiert, und gibt sie zurück.
 *  `#ui` ist der Träger wie bei allen Oberflächen-Elementen (siehe
 *  `style.css`, Stapelreihenfolge). */
function leiste(): HTMLElement {
  const vorhanden = document.getElementById('leiste')
  if (vorhanden) return vorhanden

  const el = document.createElement('div')
  el.id = 'leiste'

  const kopf = document.createElement('div')
  kopf.id = IDS.kopf
  const suche = document.createElement('div')
  suche.id = IDS.suche

  // `mitte` ist ein eigener Container, damit `overflow-y: auto` nur die Liste
  // erfasst und nicht Kopf und Fuss mitnimmt.
  const mitte = document.createElement('div')
  mitte.id = 'leiste-mitte'
  const gruppen = document.createElement('div')
  gruppen.id = IDS.gruppen
  const liste = document.createElement('div')
  liste.id = IDS.liste
  mitte.append(gruppen, liste)

  const fuss = document.createElement('div')
  fuss.id = IDS.fuss

  el.append(kopf, suche, mitte, fuss)
  document.getElementById('ui')?.appendChild(el)
  return el
}

/** Der Abschnitt für `name`, geleert. Ruft `leiste()` mit, damit ein Modul
 *  seinen Platz bekommt, ohne zu wissen, ob die Leiste schon steht. */
export function abschnitt(name: AbschnittName): HTMLElement {
  leiste()
  const el = document.getElementById(IDS[name])
  // Kann nach `leiste()` nicht fehlen; der Wurf ist die ehrlichere Reaktion
  // als ein stilles `?.`, das eine halb gebaute Leiste unbemerkt liesse.
  if (!el) throw new Error(`Leisten-Abschnitt ${name} fehlt`)
  el.replaceChildren()
  return el
}

/** Ein eigener, geleerter Container innerhalb eines Abschnitts.
 *
 *  Zwei Abschnitte tragen je zwei Module, und beide zeichnen bei jedem
 *  `render()` neu — sie dürfen dabei aber nicht den ganzen Abschnitt leeren,
 *  sonst löscht das später zeichnende das früher gezeichnete, und welches das
 *  ist, hinge an der Aufrufreihenfolge:
 *
 *  - **Fuss:** die Summe der Auswahl (`ui/kennzahlen.ts`) und darunter die
 *    Vorbehalte (`ui/notices.ts`).
 *  - **Liste:** auf `/beschaeftigte/` die Branchenlegende (`ui/legend.ts` — der
 *    Schlüssel zu den Farben, mit denen die Karte ihre Kantone einfärbt) und
 *    die Rangliste (`ui/rangliste.ts`). Ohne getrennte Container stünden die
 *    Kantonsfarben ohne Schlüssel da.
 *
 *  Jedes Modul bekommt deshalb seinen eigenen Platz mit stabiler ID und räumt
 *  nur diesen aus. Die Reihenfolge ergibt sich aus der Einfügereihenfolge beim
 *  ersten Aufruf; in `render()` stehen die Aufrufe direkt beieinander (siehe
 *  `karte/firmen.ts`, `karte/beschaeftigte.ts`). */
export function teil(name: AbschnittName, id: string, className = ''): HTMLElement {
  const wurzel = abschnittOhneLeeren(name)
  let el = document.getElementById(id)
  if (!el) {
    el = document.createElement('div')
    el.id = id
    if (className) el.className = className
    wurzel.appendChild(el)
  }
  el.replaceChildren()
  return el
}

/** Kurzform für den Fuss — die zwei Module dort waren der erste Anlass für
 *  `teil` (siehe oben). */
export function fussTeil(id: string, className: string): HTMLElement {
  return teil('fuss', id, className)
}

/** Wie `abschnitt`, aber ohne zu leeren — nur für `teil` oben. */
function abschnittOhneLeeren(name: AbschnittName): HTMLElement {
  leiste()
  const el = document.getElementById(IDS[name])
  if (!el) throw new Error(`Leisten-Abschnitt ${name} fehlt`)
  return el
}

/** Ein Gruppenlabel («KENNZAHL», «HÖHE», «BRANCHEN», «RANGLISTE») —
 *  Grossbuchstaben und Sperrung macht das CSS, der DOM-Text bleibt lesbar und
 *  damit auch für Screenreader und Tests eine normale Zeichenkette.
 *
 *  `aktion` ist die Nebenaktion rechts in derselben Zeile («alle», «alle 26»).
 *  Sie steht bewusst im Label und nicht über oder unter der Liste: sie gehört
 *  zu der Gruppe, die das Label benennt, und eine eigene Zeile hätte die
 *  Leiste ohne Gewinn höher gemacht. */
export function label(text: string, aktion?: HTMLElement): HTMLElement {
  const el = document.createElement('p')
  el.className = aktion ? 'leiste-label leiste-labelzeile' : 'leiste-label'

  const beschriftung = document.createElement('span')
  beschriftung.textContent = text
  el.appendChild(beschriftung)

  if (aktion) el.appendChild(aktion)
  return el
}
