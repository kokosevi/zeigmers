// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createNav, DEFAULT_MODE } from './nav'

describe('DEFAULT_MODE', () => {
  it('startet die Firmenseite gedämpft', () => {
    // Linear sitzen 153 von 188 Säulen auf der Mindesthöhe — die Karte
    // öffnete mit zwei sichtbaren Säulen und einem Feld Stummel. 188 ist der
    // Messstand vom 2026-08-16, vor Finding I7 (`stats.withRevenue` zählt
    // seither 187, siehe `nav.ts`) — unverändert, weil es die damals
    // tatsächlich gemessene Zahl ist.
    expect(DEFAULT_MODE.sichtbare).toBe('logarithmisch')
  })
})

describe('createNav', () => {
  it('zeigt die Kennzahl-Gruppe nur, wo Kennzahlen angeboten werden', () => {
    const nur = createNav({ view: 'beschaeftigte', onModeChange: () => {} })
    expect(nur.querySelector('[aria-label="Kennzahl"]')).toBeNull()
  })

  it('meldet die gewählte Kennzahl', () => {
    const gewaehlt: string[] = []
    const nav = createNav({
      view: 'sichtbare', onModeChange: () => {},
      metrics: { available: ['umsatz', 'gewinn'], onChange: (m) => gewaehlt.push(m) },
    })
    nav.querySelector<HTMLButtonElement>('[data-metric="gewinn"]')!.click()
    expect(gewaehlt.at(-1)).toBe('gewinn')
  })

  it('zeigt die Organisationsform auch bei nur einem Wert', () => {
    const nav = createNav({
      view: 'sichtbare', onModeChange: () => {},
      orgForms: { available: ['boersenkotiert'], onChange: () => {} },
    })
    expect(nav.querySelector('[data-orgform="boersenkotiert"]')?.textContent)
      .toBe('Börsenkotiert')
  })

  it('Kennzahl ist eine Auswahl von genau einer Option (radiogroup)', () => {
    const nav = createNav({
      view: 'sichtbare', onModeChange: () => {},
      metrics: { available: ['umsatz', 'mitarbeitende', 'gewinn'], onChange: () => {} },
    })
    const gruppe = nav.querySelector('[aria-label="Kennzahl"]')
    expect(gruppe?.getAttribute('role')).toBe('radiogroup')

    nav.querySelector<HTMLButtonElement>('[data-metric="gewinn"]')!.click()
    const gewaehlt = nav.querySelectorAll('[data-metric][aria-checked="true"]')
    expect(gewaehlt.length).toBe(1)
    expect(gewaehlt[0]?.getAttribute('data-metric')).toBe('gewinn')
  })

  it('Organisationsform ist eine Mehrfachauswahl (group, nicht radiogroup)', () => {
    const nav = createNav({
      view: 'sichtbare', onModeChange: () => {},
      orgForms: {
        available: ['boersenkotiert', 'genossenschaft'],
        onChange: () => {},
      },
    })
    const gruppe = nav.querySelector('[aria-label="Organisationsform"]')
    expect(gruppe?.getAttribute('role')).toBe('group')

    // Startzustand: alle verfügbaren Formen ausgewählt — anders als bei der
    // Kennzahl dürfen hier mehrere Knöpfe gleichzeitig aktiv sein.
    const gewaehlt = nav.querySelectorAll('[data-orgform][aria-pressed="true"]')
    expect(gewaehlt.length).toBe(2)
  })
})
