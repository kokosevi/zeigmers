import { abschnitt } from './leiste'

/** Suche in der Leiste — neu mit dem Redesign (Handoff 1b/1c).
 *
 *  Das Problem, das sie löst: Eine von 201 Säulen war bisher nur durch Zoomen
 *  und Raten zu finden. Auf der Beschäftigten-Seite dasselbe für 26 Kantone
 *  und über 2'000 Gemeinden.
 *
 *  **Die Suche filtert nicht, sie navigiert.** Das ist die eine Regel, die
 *  dieses Modul einhalten muss: Filtern ist allein Sache der Branchenzeilen,
 *  und dafür gibt es genau einen Pfad (`domain/selection.ts`, `applySelection`
 *  — «ein Pfad, kein zweiter Ort zum Filtern»). Ein Treffer meldet deshalb nur
 *  `onPick(eintrag)`; was die Seite damit tut (Kamera bewegen, Panel öffnen),
 *  entscheidet die Aufrufstelle. Deshalb hält dieses Modul auch keine
 *  Verbindung zur Karte und kennt weder `Company` noch `Level`. */

/** Ein durchsuchbarer Eintrag. `id` ist für `aria-activedescendant` nötig
 *  (die Tastaturbedienung muss auf ein Element zeigen können) und trägt sonst
 *  keine Bedeutung; `wert` ist der Nutzlast-Wert, den `onPick` zurückgibt. */
export interface SuchEintrag<T> {
  id: string
  name: string
  wert: T
}

export interface SucheOptions<T> {
  /** Was im leeren Feld steht: «Firma suchen» bzw. «Kanton oder Gemeinde». */
  platzhalter: string
  /** `⌘K`-Hinweis rechts im Feld. Nur die Firmenseite zeigt ihn (der Entwurf
   *  lässt ihn auf `/beschaeftigte/` weg), deshalb optional. */
  kuerzel?: string
  eintraege: readonly SuchEintrag<T>[]
  onPick: (wert: T) => void
}

/** Höchstens acht Treffer. Mehr wäre keine Auswahl mehr, sondern eine zweite
 *  Liste neben der Karte — und die Leiste hat die Höhe nicht. */
export const MAX_TREFFER = 8

/** Normalisiert für den Vergleich: Kleinschreibung und ohne Akzente, damit
 *  «nestle» auch «Nestlé» findet und «zurich» auch «Zürich».
 *
 *  `NFD` zerlegt einen Buchstaben mit Akzent in Buchstabe + kombinierendes
 *  Zeichen, der Bereich `U+0300–U+036F` entfernt anschliessend genau diese
 *  Zeichen. Das ist der Grund, warum hier nicht `localeCompare` steht: der
 *  vergleicht zwei ganze Zeichenketten, gesucht wird aber ein Teilstring an
 *  beliebiger Stelle. Deutsche Umlaute bleiben dabei als Grundbuchstabe
 *  stehen («Zürich» → «zurich»), was für eine Suche das gewünschte Verhalten
 *  ist: wer «zurich» tippt, meint Zürich. */
export function normalisiere(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** Die Treffer zu einer Eingabe — als reine Funktion, damit sie ohne DOM
 *  prüfbar ist. Leere Eingabe ergibt keine Treffer: die Liste erscheint erst,
 *  wenn tatsächlich gesucht wird, sonst stünde beim Fokussieren des Feldes
 *  eine Liste der ersten acht Firmen ohne Bezug zu irgendetwas. */
export function finde<T>(
  eintraege: readonly SuchEintrag<T>[],
  eingabe: string,
): SuchEintrag<T>[] {
  const nadel = normalisiere(eingabe.trim())
  if (!nadel) return []
  const treffer: SuchEintrag<T>[] = []
  for (const eintrag of eintraege) {
    if (normalisiere(eintrag.name).includes(nadel)) treffer.push(eintrag)
    if (treffer.length === MAX_TREFFER) break
  }
  return treffer
}

/** Zeichnet Feld und Trefferliste in den Suche-Abschnitt der Leiste.
 *
 *  Anders als die übrigen `renderX()`-Funktionen hält dieses Modul **doch**
 *  einen kleinen eigenen Zustand: den Suchtext und die hervorgehobene Zeile.
 *  Beide beeinflussen die Karte nicht (die Suche navigiert, sie filtert
 *  nicht) und gehören deshalb nicht in `selection` — sie leben in dieser
 *  Closure. Ein `render()` der Seite baut die Leiste neu; damit ist das Feld
 *  danach leer, was richtig ist: ein Filter- oder Kennzahlwechsel beantwortet
 *  eine andere Frage als die zuletzt getippte. */
export function renderSuche<T>(options: SucheOptions<T>): void {
  const { platzhalter, kuerzel, eintraege, onPick } = options
  const wurzel = abschnitt('suche')

  const feld = document.createElement('div')
  feld.className = 'suche-feld'

  const icon = document.createElement('span')
  icon.className = 'suche-icon'
  icon.setAttribute('aria-hidden', 'true')

  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = platzhalter
  input.setAttribute('role', 'combobox')
  input.setAttribute('aria-expanded', 'false')
  input.setAttribute('aria-autocomplete', 'list')
  input.setAttribute('aria-label', platzhalter)
  input.autocomplete = 'off'

  const liste = document.createElement('ul')
  liste.className = 'suche-treffer'
  liste.id = 'suche-treffer'
  liste.setAttribute('role', 'listbox')
  liste.setAttribute('aria-label', platzhalter)
  liste.hidden = true
  input.setAttribute('aria-controls', liste.id)

  feld.append(icon, input)
  if (kuerzel) {
    const hinweis = document.createElement('span')
    hinweis.className = 'suche-kuerzel'
    hinweis.textContent = kuerzel
    feld.appendChild(hinweis)
  }
  wurzel.append(feld, liste)

  let treffer: SuchEintrag<T>[] = []
  // -1 = nichts hervorgehoben. Die erste Zeile wird NICHT automatisch
  // vorgewählt: sonst bewegt `Enter` nach dem Tippen die Kamera zu einem
  // Treffer, den man nicht bewusst gewählt hat.
  let aktiv = -1

  const zeichneListe = () => {
    liste.replaceChildren()
    liste.hidden = treffer.length === 0
    input.setAttribute('aria-expanded', String(treffer.length > 0))

    treffer.forEach((eintrag, index) => {
      const li = document.createElement('li')
      li.id = `suche-treffer-${eintrag.id}`
      li.setAttribute('role', 'option')
      li.setAttribute('aria-selected', String(index === aktiv))
      li.textContent = eintrag.name
      // `mousedown` statt `click`: ein Klick auf die Liste nimmt dem Feld
      // sonst zuerst den Fokus, und ein `blur`-Handler, der die Liste
      // schliesst, käme dem Klick zuvor.
      li.addEventListener('mousedown', (event) => {
        event.preventDefault()
        waehle(index)
      })
      liste.appendChild(li)
    })

    const aktives = aktiv >= 0 ? treffer[aktiv] : undefined
    if (aktives) input.setAttribute('aria-activedescendant', `suche-treffer-${aktives.id}`)
    else input.removeAttribute('aria-activedescendant')
  }

  const leere = () => {
    input.value = ''
    treffer = []
    aktiv = -1
    zeichneListe()
  }

  const waehle = (index: number) => {
    const eintrag = treffer[index]
    if (!eintrag) return
    // Erst leeren, dann melden: `onPick` löst in der Aufrufstelle ein
    // `render()` aus, das die Leiste neu baut — danach auf ein Feld zu
    // schreiben, das es nicht mehr gibt, wäre wirkungslos, aber irreführend
    // zu lesen.
    leere()
    onPick(eintrag.wert)
  }

  input.addEventListener('input', () => {
    treffer = finde(eintraege, input.value)
    aktiv = -1
    zeichneListe()
  })

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      // Escape leert das Feld UND schliesst die Liste — beides, weil ein
      // geleertes Feld mit offener Liste ein Zustand wäre, den niemand
      // gewollt hat.
      event.preventDefault()
      leere()
      return
    }
    if (event.key === 'Enter') {
      if (aktiv >= 0) {
        event.preventDefault()
        waehle(aktiv)
      } else if (treffer.length === 1) {
        // Ein einziger Treffer ist unzweideutig — dort ist `Enter` ohne
        // vorheriges Blättern die naheliegende Bedienung.
        event.preventDefault()
        waehle(0)
      }
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    if (treffer.length === 0) return
    event.preventDefault()
    const richtung = event.key === 'ArrowDown' ? 1 : -1
    aktiv = (aktiv + richtung + treffer.length) % treffer.length
    zeichneListe()
  })

  // `⌘K` / `Ctrl+K` fokussiert das Feld. Am `document`, weil die Tastenkombi
  // von überall auf der Seite greifen soll; `once`-frei und ohne Aufräumen,
  // weil jeder `render()`-Durchlauf ein neues Feld baut — der Listener zeigt
  // dann auf ein Element, das nicht mehr im Dokument hängt, und `focus()`
  // darauf ist wirkungslos statt falsch. Ein Aufräumen wäre nur nötig, wenn
  // der Listener etwas Sichtbares täte.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'k' || !(event.metaKey || event.ctrlKey)) return
    if (!input.isConnected) return
    event.preventDefault()
    input.focus()
  })
}
