// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { finde, MAX_TREFFER, normalisiere, renderSuche, type SuchEintrag } from './suche'

beforeEach(() => {
  document.body.innerHTML = '<div id="ui"></div>'
})

const eintrag = (name: string): SuchEintrag<string> => ({ id: name, name, wert: name })

function feld(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('.suche-feld input')!
}

function trefferListe(): HTMLElement {
  return document.getElementById('suche-treffer')!
}

function trefferTexte(): string[] {
  return [...trefferListe().querySelectorAll('li')].map((li) => li.textContent ?? '')
}

/** Tippt in das Feld und löst dasselbe `input`-Event aus wie eine Tastatur. */
function tippe(text: string): void {
  feld().value = text
  feld().dispatchEvent(new Event('input'))
}

function taste(key: string): void {
  feld().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

describe('normalisiere', () => {
  it('macht «Nestlé» und «nestle» vergleichbar', () => {
    expect(normalisiere('Nestlé')).toBe(normalisiere('nestle'))
  })

  it('macht «Zürich» und «zurich» vergleichbar', () => {
    // Deutsche Umlaute fallen auf den Grundbuchstaben zurück — wer «zurich»
    // tippt, meint Zürich.
    expect(normalisiere('Zürich')).toBe('zurich')
  })

  it('lässt Zeichen ohne Akzent unverändert', () => {
    expect(normalisiere('Holcim AG')).toBe('holcim ag')
  })
})

describe('finde', () => {
  it('findet «Nestlé» auch als «nestle»', () => {
    const treffer = finde([eintrag('Nestlé S.A.'), eintrag('Holcim AG')], 'nestle')
    expect(treffer.map((t) => t.name)).toEqual(['Nestlé S.A.'])
  })

  it('findet auch mitten im Namen', () => {
    const treffer = finde([eintrag('Zürcher Kantonalbank'), eintrag('Holcim AG')], 'kantonal')
    expect(treffer.map((t) => t.name)).toEqual(['Zürcher Kantonalbank'])
  })

  it('gibt höchstens acht Treffer zurück', () => {
    // Mehr wäre keine Auswahl mehr, sondern eine zweite Liste neben der Karte.
    const viele = Array.from({ length: 30 }, (_, i) => eintrag(`Beispiel ${i} AG`))
    expect(finde(viele, 'beispiel')).toHaveLength(MAX_TREFFER)
  })

  it('gibt bei leerer Eingabe nichts zurück', () => {
    // Die Liste erscheint erst, wenn tatsächlich gesucht wird — sonst stünden
    // beim Fokussieren acht Firmen ohne Bezug zu irgendetwas da.
    const eintraege = [eintrag('Nestlé S.A.')]
    expect(finde(eintraege, '')).toEqual([])
    expect(finde(eintraege, '   ')).toEqual([])
  })
})

describe('renderSuche', () => {
  it('zeigt Platzhalter und Kürzel, wie die Seite sie übergibt', () => {
    renderSuche({
      platzhalter: 'Firma suchen',
      kuerzel: '⌘K',
      eintraege: [],
      onPick: () => {},
    })
    expect(feld().placeholder).toBe('Firma suchen')
    expect(document.querySelector('.suche-kuerzel')?.textContent).toBe('⌘K')
  })

  it('lässt das Kürzel weg, wo die Seite keines übergibt', () => {
    // Der Entwurf zeigt `⌘K` nur auf `/firmen/`.
    renderSuche({ platzhalter: 'Kanton oder Gemeinde', eintraege: [], onPick: () => {} })
    expect(document.querySelector('.suche-kuerzel')).toBeNull()
  })

  it('zeigt die Trefferliste erst beim Tippen', () => {
    renderSuche({
      platzhalter: 'Firma suchen',
      eintraege: [eintrag('Nestlé S.A.')],
      onPick: () => {},
    })
    expect(trefferListe().hidden).toBe(true)
    tippe('nestle')
    expect(trefferListe().hidden).toBe(false)
    expect(trefferTexte()).toEqual(['Nestlé S.A.'])
  })

  it('meldet einen Klick auf einen Treffer und leert das Feld', () => {
    const gewaehlt: string[] = []
    renderSuche({
      platzhalter: 'Firma suchen',
      eintraege: [eintrag('Nestlé S.A.')],
      onPick: (wert) => gewaehlt.push(wert),
    })
    tippe('nestle')
    trefferListe().querySelector('li')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(gewaehlt).toEqual(['Nestlé S.A.'])
    expect(feld().value).toBe('')
    expect(trefferListe().hidden).toBe(true)
  })

  it('Escape leert das Feld und schliesst die Liste', () => {
    renderSuche({
      platzhalter: 'Firma suchen',
      eintraege: [eintrag('Nestlé S.A.')],
      onPick: () => {},
    })
    tippe('nestle')
    taste('Escape')
    expect(feld().value).toBe('')
    expect(trefferListe().hidden).toBe(true)
  })

  it('blättert mit den Pfeiltasten und meldet den Treffer mit Enter', () => {
    const gewaehlt: string[] = []
    renderSuche({
      platzhalter: 'Firma suchen',
      eintraege: [eintrag('Alpha AG'), eintrag('Alpine AG')],
      onPick: (wert) => gewaehlt.push(wert),
    })
    tippe('alp')
    expect(trefferTexte()).toEqual(['Alpha AG', 'Alpine AG'])

    taste('ArrowDown')
    taste('ArrowDown')
    // `aria-activedescendant` muss auf die hervorgehobene Zeile zeigen, sonst
    // liest ein Screenreader die Auswahl nicht mit.
    expect(feld().getAttribute('aria-activedescendant')).toBe('suche-treffer-Alpine AG')
    taste('Enter')
    expect(gewaehlt).toEqual(['Alpine AG'])
  })

  it('trägt die Rollen, die eine Trefferliste braucht', () => {
    renderSuche({
      platzhalter: 'Firma suchen',
      eintraege: [eintrag('Nestlé S.A.')],
      onPick: () => {},
    })
    expect(feld().getAttribute('role')).toBe('combobox')
    expect(trefferListe().getAttribute('role')).toBe('listbox')
    tippe('nestle')
    expect(feld().getAttribute('aria-expanded')).toBe('true')
    expect(trefferListe().querySelector('li')?.getAttribute('role')).toBe('option')
  })
})
