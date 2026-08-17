// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createNav, DEFAULT_MODE } from './nav'

// Redesign (17. August 2026, Handoff 1b/1c): `createNav` gibt kein Element
// mehr zurück, sondern zeichnet in die Abschnitte der Leiste (`ui/leiste.ts`)
// — Kopf und Gruppen sitzen dort an zwei verschiedenen Plätzen, ein einzelnes
// Rückgabe-Element könnte nur einen davon treffen. Die Tests fragen deshalb das
// Dokument ab statt einen Rückgabewert.
//
// Entfallen sind die beiden Tests zur Organisationsform-Gruppe: sie hatte genau
// einen Wert und filterte nichts, der Entwurf streicht ihre Schaltflächen
// (siehe `ui/nav.ts`). Der Filterpfad selbst ist unangetastet und weiterhin
// durch `domain/selection.test.ts` gedeckt — verloren geht hier also keine
// Zusicherung über das Verhalten der Karte, nur über zwei Knöpfe, die es nicht
// mehr gibt.
beforeEach(() => {
  document.body.innerHTML = '<div id="ui"></div>'
})

const gruppen = () => document.getElementById('leiste-gruppen')!

describe('DEFAULT_MODE', () => {
  it('startet die Firmenseite gedämpft', () => {
    // Bei linearer Skala sass die überwiegende Mehrheit der Säulen auf der
    // Mindesthöhe — die Karte öffnete mit zwei sichtbaren Säulen und einem
    // Feld Stummel. Die aktuelle Zahl dazu steht nicht mehr als Kommentar
    // hier, sondern sichtbar in der Leiste (`heightNote`), wo sie bei jedem
    // Aufruf aus den Artefakten gerechnet wird statt zu veralten.
    expect(DEFAULT_MODE.sichtbare).toBe('logarithmisch')
  })
})

describe('createNav', () => {
  it('nennt im Kopf Wortmarke und Ansichtsname', () => {
    createNav({ view: 'sichtbare', onModeChange: () => {} })
    const kopf = document.getElementById('leiste-kopf')!
    expect(kopf.querySelector('.leiste-marke')?.textContent).toBe('zeigmers')
    expect(kopf.querySelector('.leiste-marke')?.getAttribute('href')).toBe('/')
    expect(kopf.textContent).toContain('Börsennotierte Firmen')
  })

  it('führt im Kopf einen Pfeil zurück auf die Landing', () => {
    // Auftrag vom 17. August 2026: die Wortmarke war schon ein Link auf `/`,
    // sah aber nicht danach aus — der Pfeil macht den Rückweg sichtbar. Ein
    // eigenes `aria-label`, damit ein Screenreader nicht zweimal «zeigmers»
    // liest. Über `createNav` steht er damit auf beiden Unterseiten.
    createNav({ view: 'beschaeftigte', onModeChange: () => {} })
    const zurueck = document.querySelector('.leiste-zurueck')
    expect(zurueck?.getAttribute('href')).toBe('/')
    expect(zurueck?.getAttribute('aria-label')).toBe('Zur Startseite')
    expect(zurueck?.textContent).toBe('←')
  })

  it('zeigt die Kennzahl-Gruppe nur, wo Kennzahlen angeboten werden', () => {
    createNav({ view: 'beschaeftigte', onModeChange: () => {} })
    expect(gruppen().querySelector('[aria-label="Kennzahl"]')).toBeNull()
    // Die Höhe gibt es dagegen auf beiden Seiten.
    expect(gruppen().querySelector('[aria-label="Höhe"]')).not.toBeNull()
  })

  it('meldet die gewählte Kennzahl', () => {
    const gewaehlt: string[] = []
    createNav({
      view: 'sichtbare',
      onModeChange: () => {},
      metrics: { available: ['umsatz', 'gewinn'], onChange: (m) => gewaehlt.push(m) },
    })
    gruppen().querySelector<HTMLButtonElement>('[data-metric="gewinn"]')!.click()
    expect(gewaehlt.at(-1)).toBe('gewinn')
  })

  it('Kennzahl ist eine Auswahl von genau einer Option (radiogroup)', () => {
    createNav({
      view: 'sichtbare',
      onModeChange: () => {},
      metrics: { available: ['umsatz', 'mitarbeitende', 'gewinn'], onChange: () => {} },
    })
    const gruppe = gruppen().querySelector('[aria-label="Kennzahl"]')
    expect(gruppe?.getAttribute('role')).toBe('radiogroup')

    gruppen().querySelector<HTMLButtonElement>('[data-metric="gewinn"]')!.click()
    const gewaehlt = gruppen().querySelectorAll('[data-metric][aria-checked="true"]')
    expect(gewaehlt.length).toBe(1)
    expect(gewaehlt[0]?.getAttribute('data-metric')).toBe('gewinn')
  })

  it('Höhe ist ebenfalls eine Auswahl von genau einer Option', () => {
    createNav({ view: 'sichtbare', onModeChange: () => {} })
    const gruppe = gruppen().querySelector('[aria-label="Höhe"]')
    expect(gruppe?.getAttribute('role')).toBe('radiogroup')
    const gewaehlt = gruppen().querySelectorAll('[data-mode][aria-checked="true"]')
    expect(gewaehlt.length).toBe(1)
    expect(gewaehlt[0]?.getAttribute('data-mode')).toBe('logarithmisch')
  })

  it('nennt die Höhenstufen «gedämpft» und «linear», nicht «logarithmisch»', () => {
    // Der Schlüssel bleibt `'logarithmisch'` (`domain/scale.ts`), das Label
    // nicht: «gedämpft» beschreibt eine Potenzfunktion mit Exponent 0.4
    // zutreffend, «logarithmisch» tat es nie (siehe `MODE_LABEL` in `nav.ts`).
    createNav({ view: 'sichtbare', onModeChange: () => {} })
    const texte = [...gruppen().querySelectorAll('[data-mode]')].map((b) => b.textContent)
    expect(texte).toEqual(['gedämpft', 'linear'])
  })

  it('nennt «Personal» im Umschalter, damit die Zelle nicht umbricht', () => {
    // Nur hier gekürzt: `metricLabel()` bleibt für Legende, Panel, Hover und
    // Summenzeile die Quelle des vollen Namens «Mitarbeitende».
    createNav({
      view: 'sichtbare',
      onModeChange: () => {},
      metrics: { available: ['umsatz', 'mitarbeitende', 'gewinn'], onChange: () => {} },
    })
    const texte = [...gruppen().querySelectorAll('[data-metric]')].map((b) => b.textContent)
    expect(texte).toEqual(['Umsatz', 'Personal', 'Gewinn'])
  })

  it('zeigt die Höhen-Notiz mit den übergebenen, gemessenen Zahlen', () => {
    // Die Zahlen kommen von der Seite (`karte/firmen.ts` rechnet sie mit
    // denselben Funktionen, die die Karte zeichnet) — dieses Modul setzt sie
    // nur in den Satz. Ohne `heightNote` erscheint die Zeile nicht.
    createNav({ view: 'sichtbare', onModeChange: () => {}, heightNote: { flach: 153, total: 187 } })
    expect(gruppen().textContent).toContain('Gedämpft, sonst wären 153 von 187 Säulen gleich flach.')
  })

  it('lässt die Höhen-Notiz weg, wo keine Zahlen übergeben werden', () => {
    createNav({ view: 'beschaeftigte', onModeChange: () => {} })
    expect(gruppen().textContent).not.toContain('gleich flach')
  })
})
