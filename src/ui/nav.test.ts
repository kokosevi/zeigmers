// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createNav, DEFAULT_MODE } from './nav'

describe('DEFAULT_MODE', () => {
  it('startet die Firmenseite gedämpft', () => {
    // Linear sitzen 153 von 188 Säulen auf der Mindesthöhe — die Karte
    // öffnete mit zwei sichtbaren Säulen und einem Feld Stummel.
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
})
