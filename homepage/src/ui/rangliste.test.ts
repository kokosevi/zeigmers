// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { balkenBreite, renderRangliste, SICHTBAR, sortiere, type RangEintrag } from './rangliste'

beforeEach(() => {
  document.body.innerHTML = '<div id="ui"></div>'
})

const eintrag = (name: string, wert: number): RangEintrag<string> => ({
  id: name,
  name,
  wert,
  nutzlast: name,
})

function zeilen(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('.rang-zeile')]
}

function namen(): string[] {
  return zeilen().map((b) => b.querySelector('.rang-name')?.textContent ?? '')
}

describe('sortiere', () => {
  it('sortiert absteigend nach Wert', () => {
    const sortiert = sortiere([eintrag('Uri', 20_000), eintrag('Zürich', 1_167_319), eintrag('Bern', 600_000)])
    expect(sortiert.map((e) => e.name)).toEqual(['Zürich', 'Bern', 'Uri'])
  })

  it('lässt die übergebene Liste unangetastet', () => {
    // Die Werte kommen aus dem Artefakt (`ch_kantone`) — `sort()` an der
    // Quelle würde die Reihenfolge dort dauerhaft umstellen.
    const eingabe = [eintrag('Uri', 20_000), eintrag('Zürich', 1_167_319)]
    sortiere(eingabe)
    expect(eingabe.map((e) => e.name)).toEqual(['Uri', 'Zürich'])
  })
})

describe('balkenBreite', () => {
  it('gibt dem grössten Wert die volle Breite', () => {
    expect(balkenBreite(100, 100)).toBe(100)
  })

  it('dämpft, damit kleine Werte sichtbar bleiben', () => {
    // Ohne Dämpfung wäre 1/108 des Maximums unter einem Prozent und damit
    // nicht mehr von null zu unterscheiden — der Faktor zwischen Appenzell
    // I.Rh. und Zürich.
    const roh = (1 / 108) * 100
    expect(balkenBreite(1, 108)).toBeGreaterThan(roh * 5)
  })

  it('gibt bei Maximum 0 keine NaN-Breite', () => {
    expect(balkenBreite(0, 0)).toBe(0)
  })
})

describe('renderRangliste', () => {
  const viele = Array.from({ length: 26 }, (_, i) => eintrag(`Kanton ${i}`, (26 - i) * 1000))

  it('zeigt zunächst nur die ersten neun Zeilen', () => {
    renderRangliste({ titel: 'Rangliste', eintraege: viele, onPick: () => {} })
    expect(zeilen()).toHaveLength(SICHTBAR)
  })

  it('klappt auf «alle 26» auf und wieder zu', () => {
    renderRangliste({ titel: 'Rangliste', eintraege: viele, onPick: () => {} })
    const aktion = document.querySelector<HTMLButtonElement>('[data-alle]')!
    expect(aktion.textContent).toBe('alle 26')
    aktion.click()
    expect(zeilen()).toHaveLength(26)
    expect(document.querySelector('[data-alle]')?.getAttribute('aria-expanded')).toBe('true')
    document.querySelector<HTMLButtonElement>('[data-alle]')!.click()
    expect(zeilen()).toHaveLength(SICHTBAR)
  })

  it('zeigt keinen Aufklapp-Griff, wo es nichts aufzuklappen gibt', () => {
    renderRangliste({ titel: 'Rangliste', eintraege: viele.slice(0, 3), onPick: () => {} })
    expect(document.querySelector('[data-alle]')).toBeNull()
    expect(zeilen()).toHaveLength(3)
  })

  it('zeigt die Zeilen absteigend, unabhängig von der Eingabereihenfolge', () => {
    renderRangliste({
      titel: 'Rangliste',
      eintraege: [eintrag('Uri', 20_000), eintrag('Zürich', 1_167_319), eintrag('Bern', 600_000)],
      onPick: () => {},
    })
    expect(namen()).toEqual(['Zürich', 'Bern', 'Uri'])
  })

  it('meldet einen Klick mit der Nutzlast der Zeile', () => {
    const gewaehlt: string[] = []
    renderRangliste({
      titel: 'Rangliste',
      eintraege: [eintrag('Uri', 20_000), eintrag('Zürich', 1_167_319)],
      onPick: (wert) => gewaehlt.push(wert),
    })
    zeilen()[0]!.click()
    expect(gewaehlt).toEqual(['Zürich'])
  })

  it('meldet Hover und das Verlassen der Zeile', () => {
    const gehovert: (string | null)[] = []
    renderRangliste({
      titel: 'Rangliste',
      eintraege: [eintrag('Zürich', 1_167_319)],
      onPick: () => {},
      onHover: (wert) => gehovert.push(wert),
    })
    zeilen()[0]!.dispatchEvent(new MouseEvent('mouseenter'))
    zeilen()[0]!.dispatchEvent(new MouseEvent('mouseleave'))
    expect(gehovert).toEqual(['Zürich', null])
  })

  it('hebt beim Durchtabben dieselbe Zeile hervor wie beim Hover', () => {
    // Sonst zeigt die Karte nur der Maus, wovon gerade die Rede ist.
    const gehovert: (string | null)[] = []
    renderRangliste({
      titel: 'Rangliste',
      eintraege: [eintrag('Zürich', 1_167_319)],
      onPick: () => {},
      onHover: (wert) => gehovert.push(wert),
    })
    zeilen()[0]!.dispatchEvent(new FocusEvent('focus'))
    expect(gehovert).toEqual(['Zürich'])
  })

  it('nennt den Wert je Zeile', () => {
    renderRangliste({
      titel: 'Rangliste',
      eintraege: [eintrag('Zürich', 1_167_319)],
      onPick: () => {},
    })
    expect(document.querySelector('.rang-wert')?.textContent).toBe("1'167'319")
  })
})
